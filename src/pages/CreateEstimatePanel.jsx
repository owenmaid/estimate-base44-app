import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PalettePanel from '@/components/estimate-panel/PalettePanel';
import EstimateCanvas from '@/components/estimate-panel/EstimateCanvas';
import EstimateSearchBar from '@/components/estimate-panel/EstimateSearchBar';
import { X, Download, BookmarkPlus } from 'lucide-react';
import { generateEstimatePDF } from '@/lib/generateEstimatePDF';
import { buildCol14Map, lookupCol14, computeCol14 } from '@/lib/computeCol14';

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
    { id: Date.now(), title: 'Section 1', items: [] },
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
          current = { id: Date.now() + Math.random(), title, items: [] };
          rebuilt.push(current);
        } else {
          if (!current) {
            current = { id: Date.now() + Math.random(), title: 'Section 1', items: [] };
            rebuilt.push(current);
          }
          current.items.push({
            id: Date.now() + Math.random(),
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            markup: item.markup || 0,
            total: item.total,
          });
        }
      });
      setSections(rebuilt.length > 0 ? rebuilt : [{ id: Date.now(), title: 'Section 1', items: [] }, { id: 'summary', title: 'Summary', _isSummary: true, items: [] }]);
      toast.success(`Template "${tmpl.name}" loaded — ready to save as new estimate.`);
    } catch (e) {
      // ignore parse errors
    }
  }, [user]);

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  // Find the project matching the linked project number
  const linkedProject = useMemo(() => {
    const pn = (clientInfo.project_number || '').trim().toLowerCase();
    if (!pn) return null;
    return projects.find(p => (p.project_number || '').trim().toLowerCase() === pn) || null;
  }, [projects, clientInfo.project_number]);

  // Track the previous linked project id so we can detect a project switch
  const prevLinkedProjectIdRef = useRef(null);
  // Set when loading an existing estimate so the auto-reprice refreshes stale
  // Col14-derived values from the current project state (instead of keeping saved values).
  const forceRepriceRef = useRef(false);
  // Tracks the schedule-data signature of the linked project so in-place updates
  // (e.g. Equipment Schedule edits on Project Details Setup) trigger a Col14 refresh.
  const prevProjectSignatureRef = useRef(null);

  // Realtime: refresh the projects list whenever a project record changes so the
  // linked project (and its Col14 values) stays current across pages and tabs.
  useEffect(() => {
    const unsubscribe = base44.entities.Project.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });
    return unsubscribe;
  }, [queryClient]);

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
          current = { id: Date.now() + Math.random(), title, items: [] };
          rebuilt.push(current);
        }
      } else {
        if (!current) {
          current = { id: Date.now() + Math.random(), title: 'Section 1', items: [] };
          rebuilt.push(current);
        }
        current.items.push({
          id: Date.now() + Math.random(),
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
    setSections([{ id: Date.now(), title: 'Section 1', items: [] }, { id: 'summary', title: 'Summary', _isSummary: true, items: [] }]);
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
    setSections(prev => [...prev, { id: Date.now(), title: `Section ${prev.length + 1}`, items: [] }]);
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
          id: Date.now() + Math.random(),
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
        id: Date.now() + 1,
        title: sectionToSplit.title + ' (Left)',
        items: leftItems,
        _splitFrom: sectionId,
        _isSplit: true,
      };
      
      const rightSection = {
        id: Date.now() + 2,
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

  // ── Aggregate helpers ──────────────────────────────────────────────────────
  const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
  const isSpacer = (desc) => (desc || '') === '__SPACER__';
  const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();

  // getSectionTotal: if section has bracket items, sum their totals (avoids double-counting).
  // Otherwise sum all leaf items.
  const getSectionTotal = (sectionItems) => {
    const bracketItems = sectionItems.filter(i => isSubtotalHeader(i.description));
    if (bracketItems.length > 0) {
      return bracketItems.reduce((s, i) => s + (i.total || 0), 0);
    }
    return sectionItems.filter(i => !isSpacer(i.description)).reduce((s, i) => s + (i.total || 0), 0);
  };

  // sumSectionsByTitle: sum getSectionTotal for all sections whose title matches the list
  const sumSectionsByTitle = (sectionList, titleList) =>
    sectionList.reduce((sum, s) => {
      const title = normalizeDesc(s.title);
      return titleList.includes(title) ? sum + getSectionTotal(s.items) : sum;
    }, 0);

  // ensureItemTotal: for leaf items, calculate total from unit_price/qty/markup if missing,
  // or back-calculate unit_price from total if unit_price is missing.
  const ensureItemTotal = (item) => {
    if (isSubtotalHeader(item.description) || isSpacer(item.description)) return item;
    const qty = item.quantity || 1;
    const markup = item.markup || 0;
    const multiplier = 1 + markup / 100;
    if ((!item.unit_price || item.unit_price === 0) && item.total && item.total > 0) {
      return { ...item, unit_price: item.total / qty / multiplier };
    }
    if (!item.total || item.total === 0) {
      return { ...item, total: qty * (item.unit_price || 0) * multiplier };
    }
    return item;
  };

  // injectBracketTotals: for each bracket header in a section, sum leaf items below it
  // (until the next bracket) and set that as the bracket's total.
  // Always recomputes — does not preserve stale values.
  const injectBracketTotals = (items) => {
    const withLeafTotals = items.map(ensureItemTotal);
    return withLeafTotals.map((item, idx) => {
      if (!isSubtotalHeader(item.description)) return item;
      let sum = 0;
      for (let j = idx + 1; j < withLeafTotals.length; j++) {
        if (isSubtotalHeader(withLeafTotals[j].description)) break;
        if (isSpacer(withLeafTotals[j].description)) continue;
        sum += withLeafTotals[j].total || 0;
      }
      return { ...item, total: sum };
    });
  };

  // ── Named target matchers (flexible spacing/slash variants) ────────────────
  const isLogisticsBracket = (desc) => {
    const n = normalizeDesc(desc);
    return n === 'logistics / shipping' || n === 'logistics/shipping' || n === 'logistic / shipping' || n === 'logistic/shipping';
  };
  const isLogisticsTarget = (desc) => {
    const n = normalizeDesc(desc);
    return n === 'logistic / shipping total' || n === 'logistics / shipping total' || n === 'logistic/shipping total' || n === 'logistics/shipping total';
  };

  // ── PRE-PASS: ensure all leaf totals + bracket totals are fresh ────────────
  // Used as the base for all subsequent passes to avoid stale totals propagating forward.
  const sectionsBase = sections.map(s => ({ ...s, items: injectBracketTotals(s.items) }));

  // ── PASS 1: inject "Total Labour | Logistics Cost" ─────────────────────────
  // = sum of section totals for: Indirects Total + Directs Total + Support and Logistics
  const LABOUR_SOURCES = ['indirects total', 'directs total', 'support and logistics'];
  const LABOUR_TARGET  = 'total labour | logistics cost';
  const labourTotal = sumSectionsByTitle(sectionsBase, LABOUR_SOURCES);

  const sectionsPass1 = sectionsBase.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === LABOUR_TARGET
        ? { ...item, total: labourTotal }
        : item
    ),
  }));

  // ── PASS 2: inject "DCSM Est Total" ────────────────────────────────────────
  // = sum of ALL leaf items (excluding bracketed subtotals) across:
  //   Indirects Total + Directs Total + Support and Logistics + Total Equipment | Consumables Cost
  const DCSM_LEAF_SOURCES = ['indirects total', 'directs total', 'support and logistics', 'total equipment | consumables cost'];
  const DCSM_TARGET  = 'dcsm est total';
  const dcsmTotal = sectionsPass1.reduce((sum, s) => {
    if (!DCSM_LEAF_SOURCES.includes(normalizeDesc(s.title))) return sum;
    return sum + s.items.reduce((itemSum, item) => {
      if (isSubtotalHeader(item.description) || isSpacer(item.description)) return itemSum;
      return itemSum + (item.total || 0);
    }, 0);
  }, 0);

  const sectionsPass2 = sectionsPass1.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === DCSM_TARGET
        ? { ...item, unit_price: dcsmTotal, quantity: 1, markup: 0, total: dcsmTotal }
        : item
    ),
  }));

  // ── PASS 3: inject named bracket summary totals ────────────────────────────
  // These are "mirror" items whose value = sum of leaves under a specific bracket header.
  // Computed from sectionsPass2 (with fresh leaf totals).
  const LEAD_VENT_BRACKET      = 'lead ventilation tech';
  const LEAD_VENT_TARGET       = 'lead ventilation tech total';
  const VENT_TECH_BRACKET      = 'ventilation tech';
  const VENT_TECH_TARGET       = 'ventilation tech total';
  const VENT_EQUIP_TOTAL_TARGET     = 'ventilation equipment total cost';
  const VENT_CONSUMABLES_BRACKET    = 'ventilation consumables';
  const VENT_CONSUMABLES_TARGET     = 'consumables | securement total cost';

  // Helper: sum leaf items under a bracket (identified by a predicate), skipping targetDesc
  const sumBracketLeaves = (sectionList, bracketPredicate, targetNorm) => {
    let value = 0;
    sectionList.forEach(s => {
      s.items.forEach((item, idx) => {
        if (!bracketPredicate(item.description)) return;
        let sum = 0;
        for (let j = idx + 1; j < s.items.length; j++) {
          if (isSubtotalHeader(s.items[j].description)) break;
          if (isSpacer(s.items[j].description)) continue;
          if (targetNorm && normalizeDesc(s.items[j].description) === targetNorm) continue;
          sum += s.items[j].total || 0;
        }
        value += sum;
      });
    });
    return value;
  };

  // Each named mirror value is computed from sectionsPass2 leaves
  const leadVentValue       = sumBracketLeaves(sectionsPass2, d => isSubtotalHeader(d) && normalizeDesc(d) === LEAD_VENT_BRACKET, LEAD_VENT_TARGET);
  const ventTechValue       = sumBracketLeaves(sectionsPass2, d => isSubtotalHeader(d) && normalizeDesc(d) === VENT_TECH_BRACKET, VENT_TECH_TARGET);
  const logisticsValue      = sumBracketLeaves(sectionsPass2, d => isLogisticsBracket(d), null);
  const ventConsumablesValue = sumBracketLeaves(sectionsPass2, d => isSubtotalHeader(d) && normalizeDesc(d) === VENT_CONSUMABLES_BRACKET, VENT_CONSUMABLES_TARGET);

  // Ventilation Equipment: prefer category-sum from linked project, else bracket leaves
  const ventEquipCategoryValue = useMemo(() => {
    if (!linkedProject) return 0;
    const rows = linkedProject.equipment_rows || [];
    const eGrid = linkedProject.equipment_grid || {};
    const tGrid = linkedProject.type_grid || {};
    let total = 0;
    rows.forEach(row => {
      const invItem = inventory.find(i => String(i.id) === String(row.item_id))
        || inventory.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
        || null;
      if (!invItem) return;
      if ((invItem.category || '').toLowerCase() !== 'ventilation equipment') return;
      const col14 = computeCol14(row, eGrid, tGrid, inventory);
      if (col14 != null && col14 > 0) total += col14;
    });
    return total;
  }, [linkedProject, inventory]);

  const ventEquipBracketValue = sumBracketLeaves(
    sectionsPass2,
    d => isSubtotalHeader(d) && normalizeDesc(d).startsWith('ventilation equipment'),
    VENT_EQUIP_TOTAL_TARGET
  );
  const ventEquipValue = linkedProject ? ventEquipCategoryValue : ventEquipBracketValue;

  // Inject all named mirror targets
  const sectionsPass3 = sectionsPass2.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      if (n === LEAD_VENT_TARGET)         return { ...item, total: leadVentValue };
      if (n === VENT_TECH_TARGET)         return { ...item, total: ventTechValue };
      if (isLogisticsTarget(item.description)) return { ...item, total: logisticsValue };
      if (n === VENT_EQUIP_TOTAL_TARGET)  return { ...item, total: ventEquipValue };
      if (n === VENT_CONSUMABLES_TARGET)  return { ...item, total: ventConsumablesValue };
      return item;
    }),
  }));

  // After named mirrors are set, recompute ALL bracket totals from fresh leaves
  // This ensures any bracket that wraps the named mirror items reflects the latest values.
  const sectionsPass3WithBrackets = sectionsPass3.map(s => ({
    ...s,
    items: injectBracketTotals(s.items),
  }));

  // ── PASS 4: inject "Ventilation Total Cost" ────────────────────────────────
  // = sum of ALL leaf items (excluding bracketed subtotals) across:
  //   Ventilation Total Labour | Logistics Cost + Ventilation Total Equipment | Consumable Costs
  const VENT_TOTAL_LEAF_SOURCES = ['ventilation total labour | logistics cost', 'ventilation total equipment | consumable costs'];
  const ventilationSectionTotal = sectionsPass3WithBrackets.reduce((sum, s) => {
    if (!VENT_TOTAL_LEAF_SOURCES.includes(normalizeDesc(s.title))) return sum;
    return sum + s.items.reduce((itemSum, item) => {
      if (isSubtotalHeader(item.description) || isSpacer(item.description)) return itemSum;
      return itemSum + (item.total || 0);
    }, 0);
  }, 0);

  const sectionsPass4 = sectionsPass3WithBrackets.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      if (n === 'ventilation total cost' || n === 'total cost for ventilation') {
        return { ...item, total: ventilationSectionTotal };
      }
      return item;
    }),
  }));

  // ── PASS 5: inject labour hours into "Project Totals" section ──────────────
  const dcsmHoursValue         = col2Sum;
  const ventHoursValue         = ventCol2Sum;
  const totalProjectLabourHours = dcsmHoursValue + ventHoursValue;

  // Auto-create hour bracket items if missing
  const sectionsWithAutoBrackets = sectionsPass4.map(s => {
    if (normalizeDesc(s.title) !== 'project totals') return s;
    const existingDescs = s.items.map(i => normalizeDesc(i.description));
    const newBrackets = [];
    if (!existingDescs.includes('dcsm est total hours') && dcsmHoursValue > 0)
      newBrackets.push({ id: Date.now() + 1, description: '[DCSM Est Total Hours]',           quantity: 1, unit_price: 0, markup: 0, total: 0 });
    if (!existingDescs.includes('total ventilation labour hours') && ventHoursValue > 0)
      newBrackets.push({ id: Date.now() + 2, description: '[Total Ventilation Labour Hours]',  quantity: 1, unit_price: 0, markup: 0, total: 0 });
    if (!existingDescs.includes('total project labour hours') && totalProjectLabourHours > 0)
      newBrackets.push({ id: Date.now() + 3, description: '[Total Project Labour Hours]',      quantity: 1, unit_price: 0, markup: 0, total: 0 });
    return newBrackets.length > 0 ? { ...s, items: [...s.items, ...newBrackets] } : s;
  });

  const sectionsPass5 = sectionsWithAutoBrackets.map(s => ({
    ...s,
    items: s.items.map(item => {
      if (!isSubtotalHeader(item.description)) return item;
      const n = normalizeDesc(item.description);
      if (n === 'dcsm est total hours')          return { ...item, unit_price: dcsmHoursValue,          quantity: 1, markup: 0, total: dcsmHoursValue };
      if (n === 'total ventilation labour hours') return { ...item, unit_price: ventHoursValue,          quantity: 1, markup: 0, total: ventHoursValue };
      if (n === 'total project labour hours')     return { ...item, unit_price: totalProjectLabourHours, quantity: 1, markup: 0, total: totalProjectLabourHours };
      return item;
    }),
  }));

  // ── PASS 6 (Final): inject [Total Project Cost] ───────────────────────────
  // [Total Project Cost] = getSectionTotal("Total Cost for DCSM") + getSectionTotal("Total Cost for Ventilation")
  const PROJECT_COST_BRACKET = 'total project cost';

  // conventionalCostsTotal: still needed for the Summary section display
  let conventionalCostsTotal = 0;
  sectionsPass5.forEach(s => {
    s.items.forEach(item => {
      if (isSubtotalHeader(item.description) || isSpacer(item.description)) return;
      const desc = (item.description || '').toLowerCase();
      const match = inventory.find(i => (i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc);
      if (match && (match.category || '').toLowerCase() === 'conventional costs') {
        conventionalCostsTotal += item.total || 0;
      }
    });
  });

  const PROJECT_COST_SOURCES = ['total cost for dcsm', 'total cost for ventilation', 'total costs for dcsm', 'total costs for ventilation'];
  const projectCostSections = sectionsPass5.filter(s => PROJECT_COST_SOURCES.includes(normalizeDesc(s.title)));
  const projectCostValue = projectCostSections.length > 0
    ? projectCostSections.reduce((sum, s) => sum + getSectionTotal(s.items), 0)
    // Fallback: no DCSM/Ventilation summary sections — use the sum of all
    // non-summary section totals so the bottom total reflects line item costs.
    : sectionsPass5
        .filter(s => !s._isSummary && normalizeDesc(s.title) !== 'summary')
        .reduce((sum, s) => sum + getSectionTotal(s.items), 0);

  const sectionsWithAggregate = sectionsPass5.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      if (isSubtotalHeader(item.description) && n === PROJECT_COST_BRACKET)
        return { ...item, total: projectCostValue };
      if (n === 'ventilation total cost' || n === 'total cost for ventilation')
        return { ...item, total: ventilationSectionTotal };
      if (n === 'dcsm est total')
        return { ...item, total: dcsmTotal };
      return item;
    }),
  }));

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal = projectCostValue;
  const taxAmount = subtotal * (clientInfo.tax_rate / 100);
  const total = subtotal + taxAmount - (clientInfo.discount || 0);

  // ── Save / Update ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const lineItems = [];
      sectionsWithAggregate.forEach(s => {
        lineItems.push({ description: `__SECTION__:${s.title}`, quantity: 0, unit_price: 0, total: 0 });
        s.items.forEach(item => {
          lineItems.push({ description: item.description, quantity: item.quantity, unit_price: item.unit_price, markup: item.markup, total: item.total });
        });
      });
      // Add summary section as a special section with tax/discount info
      const summarySection = sections.find(s => s._isSummary);
      if (summarySection) {
        lineItems.push({ description: `__SECTION__:${summarySection.title}`, quantity: 0, unit_price: 0, total: 0, _isSummary: true, tax_rate: clientInfo.tax_rate, discount: clientInfo.discount });
      }

      const basePayload = {
        client_name: clientInfo.client_name,
        project_name: clientInfo.project_name,
        project_number: clientInfo.project_number,
        client_email: clientInfo.client_email,
        client_phone: clientInfo.client_phone,
        client_address: clientInfo.client_address,
        notes: clientInfo.notes,
        tax_rate: clientInfo.tax_rate,
        discount: clientInfo.discount,
        start_date: clientInfo.start_date || '',
        end_date: clientInfo.end_date || '',
        line_items: lineItems,
        subtotal,
        tax_amount: taxAmount,
        total,
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
        const existing = await base44.entities.Estimate.filter({ project_number: clientInfo.project_number.trim() });
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
        estimate_number: `EST-${Date.now().toString().slice(-6)}`,
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      setActiveEstimate(saved);
      toast.success(activeEstimate ? 'Estimate updated!' : 'Estimate saved as draft!');
    },
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

      {/* Close Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold text-foreground mb-2">Un-Saved Estimate!</h2>
            <p className="text-sm text-muted-foreground mb-6">Do you wish to save the document?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseNo}
                className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                No
              </button>
              <button
                onClick={handleCloseYes}
                disabled={saveMutation.isPending}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                {saveMutation.isPending ? 'Saving…' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {isAdmin && showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold text-foreground mb-1">Save as Estimate Template</h2>
            <p className="text-xs text-muted-foreground mb-4">
              This snapshot will be saved to the Templates page and can be reopened in the Estimate Panel anytime.
              <span className="block mt-1 text-destructive font-medium">Note: "Est_Template" is a reserved name and cannot be used.</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Template Name *</label>
                <input
                  autoFocus
                  className="w-full text-sm bg-secondary border border-border rounded px-3 py-1.5 text-foreground outline-none focus:border-primary transition-colors"
                  placeholder="e.g. KEYERA FT SASK Standard"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
                <textarea
                  className="w-full text-sm bg-secondary border border-border rounded px-3 py-1.5 text-foreground outline-none focus:border-primary transition-colors resize-none h-16"
                  placeholder="What is this template for?"
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || templateSaving}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
              >
                {templateSaving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
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