import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PalettePanel from '@/components/estimate-panel/PalettePanel';
import EstimateCanvas from '@/components/estimate-panel/EstimateCanvas';
import EstimateSearchBar from '@/components/estimate-panel/EstimateSearchBar';
import { CloseEstimateDialog, SaveTemplateDialog } from '@/components/estimate-panel/EstimatePanelDialogs';
import { X, Download, BookmarkPlus } from 'lucide-react';
import { generateEstimatePDF } from '@/lib/generateEstimatePDF';
import { buildCol14Map, lookupCol14 } from '@/lib/computeCol14';
import { roundMoney } from '@/lib/calculations';
import { createEstimateNumber, createStableId, getErrorMessage, validateEstimateData } from '@/lib/reliability';
import { buildEstimateAggregates } from '@/components/estimate-panel/estimateAggregates';

export default function CreateEstimatePanel() {
  const queryClient = useQueryClient();

  // The estimate being edited (null = new)
  const [activeEstimate, setActiveEstimate] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);

  // Sections: [{id, title, items:[{id,description,quantity,unit_price,total,markup}]}]
  const [sections, setSections] = useState([
    { id: createStableId('section'), title: 'Section 1', items: [] },
    { id: 'summary', title: 'Summary', _isSummary: true, items: [] }
  ]);

  // Client info
  const [clientInfo, setClientInfo] = useState({
    client_name: '', project_number: '', project_name: '', client_email: '',
    client_phone: '', client_address: '', notes: '',
    tax_rate: 0, discount: 0, start_date: '', end_date: '',
  });

  // Logo URLs (loaded from user settings)
  const [logoUrls, setLogoUrls] = useState({ infoSignalLogo: '', dynaVentLogo: '' });

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me(), staleTime: 0 });
  const isAdmin = user?.role === 'admin';

  // Auto-load logos from user settings whenever user data arrives
  useEffect(() => {
    if (!user?.settings?.logoUrls) return;
    setLogoUrls(prev => ({
      infoSignalLogo: user.settings.logoUrls.infoSignalLogo || prev.infoSignalLogo,
      dynaVentLogo: user.settings.logoUrls.dynaVentLogo || prev.dynaVentLogo,
    }));
  }, [user]);

  // Auto-load an estimate template if one was queued from the Templates page
  useEffect(() => {
    const raw = sessionStorage.getItem('estimateTemplateToLoad');
    if (!raw) return;
    sessionStorage.removeItem('estimateTemplateToLoad');
    try {
      const tmpl = JSON.parse(raw);
      const info = tmpl.client_info || {};
      setActiveEstimate(null);
      setClientInfo({
        client_name: '',
        project_number: '',
        client_email: info.client_email || '',
        client_phone: info.client_phone || '',
        client_address: info.client_address || '',
        notes: '',
        tax_rate: info.tax_rate || 0,
        discount: info.discount || 0,
      });
      const savedLogos = user?.settings?.logoUrls || {};
      setLogoUrls({
        infoSignalLogo: tmpl.logo_urls?.infoSignalLogo || savedLogos.infoSignalLogo || '',
        dynaVentLogo: tmpl.logo_urls?.dynaVentLogo || savedLogos.dynaVentLogo || '',
      });
      // Reconstruct sections from line_items
      const lineItems = tmpl.line_items || [];
      const rebuilt = [];
      let current = null;
      lineItems.forEach((item) => {
        if (item.description && item.description.startsWith('__SECTION__:')) {
          const title = item.description.slice('__SECTION__:'.length);
          current = { id: createStableId('section'), title, items: [] };
          rebuilt.push(current);
        } else {
          if (!current) {
            current = { id: createStableId('section'), title: 'Section 1', items: [] };
            rebuilt.push(current);
          }
          current.items.push({
            id: createStableId('item'),
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            markup: item.markup || 0,
            total: item.total,
          });
        }
      });
      setSections(rebuilt.length > 0 ? rebuilt : [{ id: createStableId('section'), title: 'Section 1', items: [] }, { id: 'summary', title: 'Summary', _isSummary: true, items: [] }]);
      toast.success(`Template "${tmpl.name}" loaded — ready to save as new estimate.`);
    } catch (e) {
      // ignore parse errors
    }
  }, [user]);

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const linkedProjectNumber = (clientInfo.project_number || '').trim();
  const { data: linkedProjects = [] } = useQuery({
    queryKey: ['linked-project', linkedProjectNumber],
    queryFn: () => base44.entities.Project.filter(
      { project_number: linkedProjectNumber },
      null,
      1
    ),
    enabled: !!linkedProjectNumber,
  });
  const linkedProject = linkedProjects[0] || null;

  // Track the previous linked project id so we can detect a project switch
  const prevLinkedProjectIdRef = useRef(null);
  // Set when loading an existing estimate so the auto-reprice refreshes stale
  // Col14-derived values from the current project state (instead of keeping saved values).
  const forceRepriceRef = useRef(false);
  // Tracks the schedule-data signature of the linked project so in-place updates
  // (e.g. Equipment Schedule edits on Project Details Setup) trigger a Col14 refresh.
  const prevProjectSignatureRef = useRef(null);

  // Realtime: refresh only the linked project lookup so Col14 values stay current.
  useEffect(() => {
    if (!linkedProjectNumber) return;
    const unsubscribe = base44.entities.Project.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['linked-project', linkedProjectNumber] });
    });
    return unsubscribe;
  }, [linkedProjectNumber, queryClient]);

  // ── Auto-reprice: fires whenever linkedProject changes ──────────────────────
  // • First project link (null → project): reprice ALL items with a Col14 match (preserve non-matches)
  // • Project switch (projectA → projectB): zero ALL regular items first, then reprice from new Col14
  // • Deselect (project → null): zero ALL regular items
  useEffect(() => {
    const prevId = prevLinkedProjectIdRef.current;
    const currId = linkedProject?.id ?? null;
    // Signature of schedule-relevant fields to detect in-place data updates
    // (same project, equipment_grid/rows/type_grid changed) and refresh Col14 prices.
    const currSig = linkedProject
      ? JSON.stringify({ eg: linkedProject.equipment_grid, er: linkedProject.equipment_rows, tg: linkedProject.type_grid })
      : null;

    const isSwitch = prevId !== null && currId !== prevId; // switched from one project to another (or to none)
    const isInitialLink = prevId === null && currId !== null; // first time a project is linked (or remount with one)
    const scheduleChanged = prevId !== null && currId === prevId && prevProjectSignatureRef.current !== currSig;
    const forceReprice = forceRepriceRef.current || scheduleChanged || isInitialLink;

    // Update refs for next render
    prevLinkedProjectIdRef.current = currId;
    prevProjectSignatureRef.current = currSig;
    forceRepriceRef.current = false; // consume the flag so it only applies to this run

    if (!linkedProject) {
      // Project deselected — zero everything out and clear customer name
      if (prevId !== null) {
        setSections(prev => prev.map(section => ({
          ...section,
          items: section.items.map(item => {
            const isHeader = /[\[\]]/.test(item.description || '');
            const isSpacer = (item.description || '') === '__SPACER__';
            if (isHeader || isSpacer) return item;
            return { ...item, unit_price: 0, total: 0 };
          }),
        })));
        setClientInfo(prev => ({ ...prev, client_name: '', client_address: '', client_email: '', project_name: '', client_phone: '', notes: '' }));
      }
      return;
    }

    // Populate customer name, site/location/plant, attention, project name, phone, notes, and dates from the linked project
    const siteParts = [linkedProject.site, linkedProject.location, linkedProject.plant].filter(Boolean);
    setClientInfo(prev => ({
      ...prev,
      client_name: linkedProject.client || '',
      client_address: siteParts.join(' / '),
      client_email: linkedProject.name || '',
      project_name: linkedProject.name || '',
      client_phone: linkedProject.phone || '',
      notes: linkedProject.notes || '',
      start_date: linkedProject.start_date || '',
      end_date: linkedProject.end_date || '',
    }));

    if (inventory.length === 0) return;

    const col14Map = buildCol14Map(linkedProject, inventory);

    setSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item => {
        const isHeader = /[\[\]]/.test(item.description || '');
        const isSpacer = (item.description || '') === '__SPACER__';
        if (isHeader || isSpacer) return item;

        // On a project switch, always re-price every regular item from scratch
        // On first link, only fill in items that are still zeroed
        // On force-reprice (loading an existing estimate), refresh items that have a Col14 match
        if (!isSwitch && !forceReprice && (item.unit_price || 0) !== 0) return item;

        const col14 = lookupCol14(item.description, col14Map, inventory);
        const markup = item.markup || 0;
        const qty = item.quantity || 1;

        if (col14 != null && col14 > 0) {
          const markedUp = col14 * (1 + markup / 100);
          return { ...item, unit_price: col14, total: markedUp * qty };
        }

        // On force-reprice, preserve the existing value when there's no Col14 match
        // (don't zero or overwrite custom/manual prices)
        if (forceReprice && !isSwitch) return item;

        // No Col14 match — try inventory unit_cost as fallback (e.g. Conventional Costs)
        const invItem = inventory.find(i =>
          (i.name || '').toLowerCase() === (item.description || '').toLowerCase() ||
          (i.sku || '').toLowerCase() === (item.description || '').toLowerCase()
        );
        if (invItem && (invItem.unit_cost || 0) > 0) {
          const unitCost = invItem.unit_cost;
          const markedUp = unitCost * (1 + markup / 100);
          return { ...item, unit_price: unitCost, total: markedUp * qty };
        }

        // Truly no match — zero on switch, leave unchanged on first link
        return isSwitch ? { ...item, unit_price: 0, total: 0 } : item;
      }),
    })));
  }, [linkedProject, inventory]);

  // Helper: compute Col2 (Col1 × shiftHrs) for a single project row
  const computeRowCol2 = (row, eGrid) => {
    const label = (row.label || '').toLowerCase();
    const isSpecial = label.includes('pre-work') || label.includes('post-work');
    const shiftHrs = isSpecial ? 10 : 12;
    let col1 = 0;
    Object.entries(eGrid).forEach(([key, value]) => {
      if (!key.startsWith(`${row.id}_`)) return;
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 0) col1 += num;
    });
    return col1 * shiftHrs;
  };

  // Manway Package Complete: avg manways per day (SUM of all day values / COUNT of days > 0)
  const manwayAvgDCSM = useMemo(() => {
    if (!linkedProject) return 0;
    const rows = linkedProject.equipment_rows || [];
    const eGrid = linkedProject.equipment_grid || {};
    // Find the row whose inventory item name matches "Manway_Package_Complete" (case-insensitive)
    const manwayRow = rows.find(row => {
      const invItem = inventory.find(i => String(i.id) === String(row.item_id));
      const label = (invItem?.name || row.label || '').toLowerCase().replace(/[\s-]/g, '_');
      return label === 'manway_package_complete' || (invItem?.name || row.label || '').toLowerCase().includes('manway_package_complete'.toLowerCase());
    });
    if (!manwayRow) return 0;
    let sum = 0;
    let count = 0;
    Object.entries(eGrid).forEach(([key, value]) => {
      if (!key.startsWith(`${manwayRow.id}_`)) return;
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 0) { sum += num; count += 1; }
    });
    return count > 0 ? sum / count : 0;
  }, [linkedProject, inventory]);

  // DCSM Man Hours: Col2 for Manpower rows whose label contains "DCSM", "Superintendent", or "On-Site Admin"
  const DCSM_KEYWORDS = ['dcsm', 'superintendent', 'on-site admin'];
  const col2Sum = useMemo(() => {
    if (!linkedProject) return 0;
    const rows = linkedProject.equipment_rows || [];
    const eGrid = linkedProject.equipment_grid || {};
    return rows.reduce((sum, row) => {
      const label = (row.label || '').toLowerCase();
      const invEntry = inventory.find(i => String(i.id) === String(row.item_id))
        || inventory.find(i => (i.name || '').toLowerCase() === label)
        || null;
      if (invEntry?.item_group !== 'Manpower Group') return sum;
      if (!DCSM_KEYWORDS.some(kw => label.includes(kw))) return sum;
      return sum + computeRowCol2(row, eGrid);
    }, 0);
  }, [linkedProject, inventory]);

  // Ventilation Labour Man Hours: Col2 for Manpower rows whose inventory category is exactly "Ventilation Labour"
  const ventCol2Sum = useMemo(() => {
    if (!linkedProject) return 0;
    const rows = linkedProject.equipment_rows || [];
    const eGrid = linkedProject.equipment_grid || {};
    return rows.reduce((sum, row) => {
      const label = (row.label || '').toLowerCase();
      const invEntry = inventory.find(i => String(i.id) === String(row.item_id))
        || inventory.find(i => (i.name || '').toLowerCase() === label)
        || null;
      if (invEntry?.item_group !== 'Manpower Group') return sum;
      if ((invEntry?.category || '').toLowerCase() !== 'ventilation labour') return sum;
      return sum + computeRowCol2(row, eGrid);
    }, 0);
  }, [linkedProject, inventory]);

  // ── Reconstruct sections from line_items (shared by loadEstimate & template preload) ──
  const rebuildSectionsFromLineItems = (lineItems) => {
    const rebuilt = [];
    let current = null;
    lineItems.forEach((item) => {
      if (item.description && item.description.startsWith('__SECTION__:')) {
        const title = item.description.slice('__SECTION__:'.length);
        if (item._isSummary || title.toLowerCase() === 'summary') {
          current = { id: 'summary', title, _isSummary: true, items: [] };
          rebuilt.push(current);
        } else {
          current = { id: createStableId('section'), title, items: [] };
          rebuilt.push(current);
        }
      } else {
        if (!current) {
          current = { id: createStableId('section'), title: 'Section 1', items: [] };
          rebuilt.push(current);
        }
        current.items.push({
          id: createStableId('item'),
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          markup: item.markup || 0,
          total: item.total,
        });
      }
    });
    const hasSummary = rebuilt.some(s => s._isSummary);
    if (!hasSummary) {
      rebuilt.push({ id: 'summary', title: 'Summary', _isSummary: true, items: [] });
    }
    return rebuilt;
  };

  // ── Load an existing estimate into the canvas ──────────────────────────────
  const loadEstimate = (estimate) => {
    forceRepriceRef.current = true;
    setActiveEstimate(estimate);
    setClientInfo({
      client_name: estimate.client_name || '',
      project_number: estimate.project_number || '',
      project_name: estimate.project_name || '',
      client_email: estimate.client_email || '',
      client_phone: estimate.client_phone || '',
      client_address: estimate.client_address || '',
      notes: estimate.notes || '',
      tax_rate: estimate.tax_rate || 0,
      discount: estimate.discount || 0,
      start_date: estimate.start_date || '',
      end_date: estimate.end_date || '',
    });
    // Always use logos from user settings, ignoring whatever was saved on the estimate
    const savedLogos = user?.settings?.logoUrls || {};
    setLogoUrls({
      infoSignalLogo: savedLogos.infoSignalLogo || '',
      dynaVentLogo: savedLogos.dynaVentLogo || '',
    });

    setSections(rebuildSectionsFromLineItems(estimate.line_items || []));
    toast.success(`Loaded: ${estimate.project_name || estimate.client_name}`);
  };

  // Auto-load an estimate queued from Project Details Setup (Convert to Estimate)
  const loadedFromNavRef = useRef(false);
  useEffect(() => {
    const raw = sessionStorage.getItem('estimateToLoad');
    if (!raw || loadedFromNavRef.current) return;
    loadedFromNavRef.current = true;
    sessionStorage.removeItem('estimateToLoad');
    try {
      const data = JSON.parse(raw);
      if (data._isTemplatePreload) {
        // Template preload from Convert to Estimate: load template sections + project header details, no active estimate
        forceRepriceRef.current = true;
        setActiveEstimate(null);
        setClientInfo({
          client_name: data.client_name || '',
          project_number: data.project_number || '',
          project_name: data.project_name || '',
          client_email: data.client_email || '',
          client_phone: data.client_phone || '',
          client_address: data.client_address || '',
          notes: data.notes || '',
          tax_rate: 0,
          discount: 0,
          start_date: data.start_date || '',
          end_date: data.end_date || '',
        });
        setSections(rebuildSectionsFromLineItems(data.line_items || []));
        toast.success('Template loaded — linked to project.');
      } else {
        loadEstimate(data);
      }
    } catch (e) { /* ignore load errors */ }
  }, []);

  // ── Reset to blank ─────────────────────────────────────────────────────────
  const handleNew = () => {
    setActiveEstimate(null);
    setSections([{ id: createStableId('section'), title: 'Section 1', items: [] }, { id: 'summary', title: 'Summary', _isSummary: true, items: [] }]);
    setClientInfo({ client_name: '', project_number: '', project_name: '', client_email: '', client_phone: '', client_address: '', notes: '', tax_rate: 0, discount: 0, start_date: '', end_date: '' });
    // Reset logos to whatever is saved in user settings
    const savedLogos = user?.settings?.logoUrls || {};
    setLogoUrls({ infoSignalLogo: savedLogos.infoSignalLogo || '', dynaVentLogo: savedLogos.dynaVentLogo || '' });
  };

  const handleCloseEstimate = () => setShowCloseConfirm(true);

  // ── Save as Estimate Template ──────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    const trimmed = templateName.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'est_template') {
      toast.error('"Est_Template" is a reserved name. Please choose a different name.');
      return;
    }
    setTemplateSaving(true);
    try {
      const lineItems = [];
      sectionsWithAggregate.forEach(s => {
        lineItems.push({ description: `__SECTION__:${s.title}`, quantity: 0, unit_price: 0, total: 0 });
        s.items.forEach(item => {
          const isHeader = /[\[\]]/.test(item.description || '');
          const isSpacer = (item.description || '') === '__SPACER__';
          lineItems.push({
            description: item.description,
            quantity: item.quantity,
            markup: item.markup,
            unit_price: 0,
            total: 0,
          });
        });
      });
      // Add summary section marker with tax/discount info
      const summarySection = sections.find(s => s._isSummary);
      if (summarySection) {
        lineItems.push({ description: `__SECTION__:${summarySection.title}`, quantity: 0, unit_price: 0, total: 0, _isSummary: true, tax_rate: clientInfo.tax_rate, discount: clientInfo.discount });
      }
      await base44.entities.EstimateTemplate.create({
        name: trimmed,
        description: templateDesc.trim() || `Template from ${activeEstimate?.estimate_number || 'estimate'}`,
        source_estimate_number: activeEstimate?.estimate_number || '',
        client_info: { ...clientInfo },
        line_items: lineItems,
        logo_urls: { ...logoUrls },
      });
      toast.success(`Template "${trimmed}" saved!`);
      setShowSaveTemplate(false);
      setTemplateName('');
      setTemplateDesc('');
    } catch (e) {
      toast.error('Failed to save template');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleCloseNo = () => {
    setShowCloseConfirm(false);
    handleNew();
  };

  const handleCloseYes = () => {
    setShowCloseConfirm(false);
    saveMutation.mutate(undefined, { onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      handleNew();
    }});
  };

  // ── Sections CRUD ──────────────────────────────────────────────────────────
  const addSection = () => {
    setSections(prev => [...prev, { id: createStableId('section'), title: `Section ${prev.length + 1}`, items: [] }]);
  };

  const renameSection = (sectionId, title) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s));
  };

  const removeSection = (sectionId) => {
    setSections(prev => prev.filter(s => s.id !== sectionId));
  };

  // ── Items CRUD ─────────────────────────────────────────────────────────────
  const addItemToSection = useCallback((sectionId, item) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const markup = item.markup || 0;
      const unitPrice = item.unit_price || 0;
      const markedUp = unitPrice * (1 + markup / 100);
      const qty = item.quantity || 1;
      return {
        ...s,
        items: [...s.items, {
          id: createStableId('item'),
          description: item.description || '',
          quantity: qty,
          unit_price: unitPrice,
          markup,
          total: markedUp * qty,
        }]
      };
    }));
  }, []);

  const updateItem = (sectionId, itemId, field, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        items: s.items.map(item => {
          if (item.id !== itemId) return item;
          const updated = { ...item, [field]: value };
          const markedUp = updated.unit_price * (1 + updated.markup / 100);
          updated.total = markedUp * updated.quantity;
          return updated;
        })
      };
    }));
  };

  const removeItem = (sectionId, itemId) => {
    setSections(prev => prev.map(s => ({
      ...s,
      items: s.items.filter(i => i.id !== itemId)
    })));
  };

  const reorderItems = (sectionId, newItems) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: newItems } : s));
  };

  const reorderSections = (newSections) => {
    // Remap IDs from the computed (transformed) sections back to the raw sections state,
    // preserving the new order while keeping raw item data intact.
    setSections(prev => {
      const prevMap = new Map(prev.map(s => [String(s.id), s]));
      return newSections.map(s => prevMap.get(String(s.id)) || s);
    });
  };

  const splitSection = (sectionId) => {
    setSections(prev => {
      const sectionToSplit = prev.find(s => s.id === sectionId);
      if (!sectionToSplit) return prev;
      
      // Split items in half
      const midPoint = Math.ceil(sectionToSplit.items.length / 2);
      const leftItems = sectionToSplit.items.slice(0, midPoint);
      const rightItems = sectionToSplit.items.slice(midPoint);
      
      const leftSection = {
        id: createStableId('section'),
        title: sectionToSplit.title + ' (Left)',
        items: leftItems,
        _splitFrom: sectionId,
        _isSplit: true,
      };
      
      const rightSection = {
        id: createStableId('section'),
        title: sectionToSplit.title + ' (Right)',
        items: rightItems,
        _splitFrom: sectionId,
        _isSplit: true,
      };
      
      // Replace the original section with two new sections
      const newSections = prev.filter(s => s.id !== sectionId);
      const insertIndex = prev.findIndex(s => s.id === sectionId);
      newSections.splice(insertIndex, 0, leftSection, rightSection);
      
      return newSections;
    });
  };

  const { sectionsWithAggregate, conventionalCostsTotal, subtotal, taxAmount, total } =
    buildEstimateAggregates({ sections, inventory, linkedProject, col2Sum, ventCol2Sum, clientInfo });

  // ── Save / Update ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateEstimateData(clientInfo, sectionsWithAggregate);
      if (validationError) throw new Error(validationError);

      const lineItems = [];
      sectionsWithAggregate.forEach(s => {
        lineItems.push({ description: `__SECTION__:${s.title}`, quantity: 0, unit_price: 0, total: 0 });
        s.items.forEach(item => {
          lineItems.push({
            description: item.description.trim(),
            quantity: Number(item.quantity || 0),
            unit_price: roundMoney(item.unit_price),
            markup: Number(item.markup || 0),
            total: roundMoney(item.total),
          });
        });
      });
      // Add summary section as a special section with tax/discount info
      const summarySection = sections.find(s => s._isSummary);
      if (summarySection) {
        lineItems.push({ description: `__SECTION__:${summarySection.title}`, quantity: 0, unit_price: 0, total: 0, _isSummary: true, tax_rate: clientInfo.tax_rate, discount: clientInfo.discount });
      }

      const basePayload = {
        client_name: clientInfo.client_name.trim(),
        project_name: clientInfo.project_name.trim(),
        project_number: clientInfo.project_number.trim(),
        client_email: clientInfo.client_email,
        client_phone: clientInfo.client_phone,
        client_address: clientInfo.client_address,
        notes: clientInfo.notes,
        tax_rate: Number(clientInfo.tax_rate || 0),
        discount: roundMoney(clientInfo.discount),
        start_date: clientInfo.start_date || '',
        end_date: clientInfo.end_date || '',
        line_items: lineItems,
        subtotal: roundMoney(subtotal),
        tax_amount: roundMoney(taxAmount),
        total: roundMoney(total),
        info_signal_logo: logoUrls.infoSignalLogo,
        dyna_vent_logo: logoUrls.dynaVentLogo,
      };

      // If already editing a known record, always update it
      if (activeEstimate) {
        return base44.entities.Estimate.update(activeEstimate.id, {
          ...basePayload,
          status: activeEstimate.status,
          estimate_number: activeEstimate.estimate_number,
        });
      }

      // New save: if project_number is set, check for an existing record with that number first
      if (clientInfo.project_number.trim()) {
        const existing = await base44.entities.Estimate.filter({ project_number: clientInfo.project_number.trim() }, null, 1);
        if (existing && existing.length > 0) {
          const match = existing[0];
          return base44.entities.Estimate.update(match.id, {
            ...basePayload,
            status: match.status || 'draft',
            estimate_number: match.estimate_number,
          });
        }
      }

      // Truly new — create
      return base44.entities.Estimate.create({
        ...basePayload,
        status: 'draft',
        estimate_number: createEstimateNumber(),
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      setActiveEstimate(saved);
      toast.success(activeEstimate ? 'Estimate updated!' : 'Estimate saved as draft!');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to save the estimate.')),
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-foreground">Create Estimate Panel</h1>
          {activeEstimate && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              Editing: {activeEstimate.estimate_number}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
          <button
            onClick={() => { setTemplateName(''); setTemplateDesc(''); setShowSaveTemplate(true); }}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
            title="Save as Estimate Template"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save as Template
          </button>
          )}
          <button
            onClick={async () => {
              await generateEstimatePDF({ clientInfo, sections: sectionsWithAggregate, subtotal, taxAmount, total, estimateNumber: activeEstimate?.estimate_number, logoUrls, manwayAvgDCSM, conventionalCostsTotal, hideZeroItems: !!linkedProject });
            }}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <EstimateSearchBar onLoad={loadEstimate} />
          <button
            onClick={handleCloseEstimate}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
            title="Close estimate"
          >
            <X className="h-3.5 w-3.5" /> Close Estimate
          </button>
          <button onClick={handleNew} className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            + New
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            {saveMutation.isPending ? 'Saving…' : activeEstimate ? 'Update Estimate' : 'Save Draft'}
          </button>
        </div>
      </div>

      {showCloseConfirm && (
        <CloseEstimateDialog
          open
          isSaving={saveMutation.isPending}
          onDiscard={handleCloseNo}
          onSave={handleCloseYes}
        />
      )}

      {isAdmin && showSaveTemplate && (
        <SaveTemplateDialog
          open
          templateName={templateName}
          templateDescription={templateDesc}
          isSaving={templateSaving}
          onNameChange={setTemplateName}
          onDescriptionChange={setTemplateDesc}
          onCancel={() => setShowSaveTemplate(false)}
          onSave={handleSaveTemplate}
        />
      )}

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Tool Palette */}
        <PalettePanel
          inventory={inventory}
          sections={sections}
          onAddSection={addSection}
          onAddItemToSection={addItemToSection}
          projectNumber={clientInfo.project_number}
          onProjectSelect={(pn) => setClientInfo(prev => ({ ...prev, project_number: pn }))}
        />

        {/* RIGHT: Estimate Canvas */}
        <EstimateCanvas
          clientInfo={clientInfo}
          onClientInfoChange={setClientInfo}
          hideZeroItems={!!linkedProject}
          sections={sectionsWithAggregate}
          onRenameSection={renameSection}
          onRemoveSection={removeSection}
          onSplitSection={splitSection}
          onSetSections={setSections}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onReorderItems={reorderItems}
          onReorderSections={reorderSections}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          inventory={inventory}
          logoUrls={logoUrls}
          manwayAvgDCSM={manwayAvgDCSM}
          conventionalCostsTotal={conventionalCostsTotal}
        />
      </div>
    </div>
  );
}
