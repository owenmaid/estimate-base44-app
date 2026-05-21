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

  // ── Auto-reprice: fires whenever linkedProject changes ──────────────────────
  // • First project link (null → project): reprice only zero-cost items
  // • Project switch (projectA → projectB): zero ALL regular items first, then reprice from new Col14
  // • Deselect (project → null): zero ALL regular items
  useEffect(() => {
    const prevId = prevLinkedProjectIdRef.current;
    const currId = linkedProject?.id ?? null;

    // Update ref for next render
    prevLinkedProjectIdRef.current = currId;

    const isSwitch = prevId !== null && currId !== prevId; // switched from one project to another (or to none)

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
        if (!isSwitch && (item.unit_price || 0) !== 0) return item;

        const col14 = lookupCol14(item.description, col14Map, inventory);
        if (col14 == null || col14 <= 0) {
          // If switching, zero items that have no col14 match in the new project
          return isSwitch ? { ...item, unit_price: 0, total: 0 } : item;
        }

        const markup = item.markup || 0;
        const qty = item.quantity || 1;
        const markedUp = col14 * (1 + markup / 100);
        return { ...item, unit_price: col14, total: markedUp * qty };
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

  // ── Load an existing estimate into the canvas ──────────────────────────────
  const loadEstimate = (estimate) => {
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

    // Reconstruct sections from line_items
    const lineItems = estimate.line_items || [];
    const rebuilt = [];
    let current = null;

    lineItems.forEach((item) => {
      if (item.description && item.description.startsWith('__SECTION__:')) {
        const title = item.description.slice('__SECTION__:'.length);
        // Check if this is a summary section marker
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

    // Ensure summary section exists
    const hasSummary = rebuilt.some(s => s._isSummary);
    if (!hasSummary) {
      rebuilt.push({ id: 'summary', title: 'Summary', _isSummary: true, items: [] });
    }
    setSections(rebuilt);
    toast.success(`Loaded: ${estimate.project_name || estimate.client_name}`);
  };

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

  // Simplified section total: sum ONLY bracket subtotals, ignoring all leaf items
  // This avoids double-counting injected summary rows
  const getSectionTotal = (sectionItems) => {
    const bracketItems = sectionItems.filter(i => isSubtotalHeader(i.description));
    if (bracketItems.length > 0) {
      // Sum bracket subtotals directly (they already contain the aggregated values)
      return bracketItems.reduce((s, i) => s + (i.total || 0), 0);
    }
    // No brackets: sum raw leaf items
    return sectionItems.filter(i => !isSpacer(i.description)).reduce((s, i) => s + (i.total || 0), 0);
  };

  // Helper: sum section totals by matching section titles
  const sumSectionsByTitle = (sectionList, titleList) =>
    sectionList.reduce((sum, s) => {
      const title = normalizeDesc(s.title);
      return titleList.includes(title) ? sum + getSectionTotal(s.items) : sum;
    }, 0);

  // Pass 1: inject "Total Labour | Logistics Cost" = sum of Indirects + Directs + Support & Logistics
  const LABOUR_SOURCES = ['indirects total', 'directs total', 'support and logistics'];
  const LABOUR_TARGET  = 'total labour | logistics cost';
  const labourTotal = sumSectionsByTitle(sections, LABOUR_SOURCES);

  const sectionsPass1 = sections.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === LABOUR_TARGET
        ? { ...item, total: labourTotal }
        : item
    ),
  }));

  // Pass 2: inject "DCSM Est Total" = sum of "Total Labour | Logistics Cost" + "Total Equipment | Consumables Cost" sections
  // Use sectionsPass1 so the Labour value is already updated
  const DCSM_SOURCES = ['total labour | logistics cost', 'total equipment | consumables cost'];
  const DCSM_TARGET  = 'dcsm est total';
  const dcsmTotal = sumSectionsByTitle(sectionsPass1, DCSM_SOURCES);


  const sectionsPass2 = sectionsPass1.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === DCSM_TARGET
        ? { ...item, unit_price: dcsmTotal, quantity: 1, markup: 0, total: dcsmTotal }
        : item
    ),
  }));

  // Pass 3: inject "Lead Ventilation Tech Total" = the bracketed [Lead Ventilation Tech] subtotal
  // Find the [Lead Ventilation Tech] bracket row in any section and compute its subtotal
  const LEAD_VENT_BRACKET = 'lead ventilation tech';
  const LEAD_VENT_TARGET  = 'lead ventilation tech total';

  let leadVentValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (normalizeDesc(item.description) !== LEAD_VENT_BRACKET) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        if (normalizeDesc(s.items[j].description) === LEAD_VENT_TARGET) continue;
        sum += s.items[j].total || 0;
      }
      leadVentValue = sum;
    });
  });

  // Also inject "Ventilation Tech Total" = the bracketed [Ventilation Tech] subtotal
  const VENT_TECH_BRACKET = 'ventilation tech';
  const VENT_TECH_TARGET  = 'ventilation tech total';

  let ventTechValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (normalizeDesc(item.description) !== VENT_TECH_BRACKET) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        if (normalizeDesc(s.items[j].description) === VENT_TECH_TARGET) continue;
        sum += s.items[j].total || 0;
      }
      ventTechValue = sum;
    });
  });

  // Also inject "Logistic / Shipping Total" = the bracketed [Logistics / Shipping] subtotal
  // Use flexible matching to handle spacing variations around '/'
  const LOGISTICS_TARGET = 'logistic / shipping total';

  const isLogisticsBracket = (desc) => {
    const n = normalizeDesc(desc);
    return n === 'logistics / shipping' || n === 'logistics/shipping' || n === 'logistic / shipping' || n === 'logistic/shipping';
  };
  const isLogisticsTarget = (desc) => {
    const n = normalizeDesc(desc);
    return n === 'logistic / shipping total' || n === 'logistics / shipping total' || n === 'logistic/shipping total' || n === 'logistics/shipping total';
  };

  let logisticsValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (!isSubtotalHeader(item.description)) return;
      if (!isLogisticsBracket(item.description)) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        if (isLogisticsTarget(s.items[j].description)) continue;
        sum += s.items[j].total || 0;
      }
      logisticsValue = sum;
    });
  });

  // "Ventilation Equipment Total Cost" = sum of Col14 for all inventory items in "Ventilation Equipment" category on the linked project
  const VENT_EQUIP_TOTAL_TARGET = 'ventilation equipment total cost';

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

  // Keep bracket-matching for ventEquipValue as fallback when no project is linked
  const isVentEquipBracket = (desc) => {
    const n = normalizeDesc(desc);
    return n.startsWith('ventilation equipment');
  };

  let ventEquipBracketValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (!isSubtotalHeader(item.description)) return;
      if (!isVentEquipBracket(item.description)) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        if (normalizeDesc(s.items[j].description) === VENT_EQUIP_TOTAL_TARGET) continue;
        sum += s.items[j].total || 0;
      }
      ventEquipBracketValue += sum;
    });
  });

  // Use the category-based value when a project is linked, otherwise fall back to bracket sum
  const ventEquipValue = linkedProject ? ventEquipCategoryValue : ventEquipBracketValue;

  // Mirror [Ventilation Consumables] bracket subtotal → "Consumables | Securement Total Cost"
  const VENT_CONSUMABLES_BRACKET = 'ventilation consumables';
  const VENT_CONSUMABLES_TARGET  = 'consumables | securement total cost';

  let ventConsumablesValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (!isSubtotalHeader(item.description)) return;
      if (normalizeDesc(item.description) !== VENT_CONSUMABLES_BRACKET) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        // Exclude the target summary line itself to prevent circular compounding
        if (normalizeDesc(s.items[j].description) === VENT_CONSUMABLES_TARGET) continue;
        sum += s.items[j].total || 0;
      }
      ventConsumablesValue = sum;
    });
  });

  const sectionsPass3 = sectionsPass2.map(s => ({
    ...s,
    items: s.items.map(item => {
      if (normalizeDesc(item.description) === LEAD_VENT_TARGET)
        return { ...item, total: leadVentValue };
      if (normalizeDesc(item.description) === VENT_TECH_TARGET)
        return { ...item, total: ventTechValue };
      if (isLogisticsTarget(item.description))
        return { ...item, total: logisticsValue };
      if (normalizeDesc(item.description) === VENT_EQUIP_TOTAL_TARGET)
        return { ...item, total: ventEquipValue };
      if (normalizeDesc(item.description) === VENT_CONSUMABLES_TARGET)
        return { ...item, total: ventConsumablesValue };
      return item;
    }),
  }));

  // Pass 4: "Ventilation Total Cost" = simplified formula
  // Sum the two source section totals directly by their exact titles
  const ventLabourSection = sectionsPass3.find(s => 
    normalizeDesc(s.title) === 'ventilation total labour | logistics cost'
  );
  const equipConsumableSection = sectionsPass3.find(s => 
    normalizeDesc(s.title) === 'total equipment | consumable costs'
  );

  const ventilationSectionTotal = (ventLabourSection ? getSectionTotal(ventLabourSection.items) : 0) +
                                   (equipConsumableSection ? getSectionTotal(equipConsumableSection.items) : 0);
  console.log('[Pass4] Ventilation Total Labour | Logistics Cost section total:', ventLabourSection ? getSectionTotal(ventLabourSection.items) : 0);
  console.log('[Pass4] Total Equipment | Consumable Costs section total:', equipConsumableSection ? getSectionTotal(equipConsumableSection.items) : 0);
  console.log('[Pass4] Ventilation Total Cost:', ventilationSectionTotal);

  const sectionsPass4 = sectionsPass3.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      if (n === 'ventilation total cost' || n === 'total cost for ventilation') {
        return { ...item, total: ventilationSectionTotal };
      }
      return item;
    }),
  }));

  // Pass 5: Auto-create brackets in Project Totals section first, then inject values
  const dcsmHoursValue = col2Sum;
  const ventHoursValue = ventCol2Sum;
  const totalProjectLabourHours = dcsmHoursValue + ventHoursValue;
  console.log('[CreateEstimatePanel] Total Project Labour Hours:', totalProjectLabourHours, '= DCSM:', dcsmHoursValue, '+ Vent:', ventHoursValue);

  // Auto-create brackets in Project Totals section if missing (do this BEFORE injecting values)
  const sectionsWithAutoBrackets = sectionsPass4.map(s => {
    if (normalizeDesc(s.title) !== 'project totals') return s;
    const existingDescs = s.items.map(i => normalizeDesc(i.description));
    const newBrackets = [];
    
    if (!existingDescs.includes('dcsm est total hours') && dcsmHoursValue > 0) {
      newBrackets.push({
        id: Date.now() + 1,
        description: '[DCSM Est Total Hours]',
        quantity: 1,
        unit_price: 0,
        markup: 0,
        total: 0,
      });
    }
    if (!existingDescs.includes('total ventilation labour hours') && ventHoursValue > 0) {
      newBrackets.push({
        id: Date.now() + 2,
        description: '[Total Ventilation Labour Hours]',
        quantity: 1,
        unit_price: 0,
        markup: 0,
        total: 0,
      });
    }
    if (!existingDescs.includes('total project labour hours') && totalProjectLabourHours > 0) {
      newBrackets.push({
        id: Date.now() + 3,
        description: '[Total Project Labour Hours]',
        quantity: 1,
        unit_price: 0,
        markup: 0,
        total: 0,
      });
    }
    
    if (newBrackets.length > 0) {
      console.log('[CreateEstimatePanel] Auto-creating brackets:', newBrackets.map(b => b.description));
      return { ...s, items: [...s.items, ...newBrackets] };
    }
    return s;
  });

  // Pass 5: Inject mirrored values into Project Totals section (now includes auto-created brackets)
  const sectionsPass5 = sectionsWithAutoBrackets.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      // Inject DCSM Est Total Hours
      if (isSubtotalHeader(item.description) && n === 'dcsm est total hours') {
        return { ...item, unit_price: dcsmHoursValue, quantity: 1, markup: 0, total: dcsmHoursValue };
      }
      // Inject Total Ventilation Labour Hours
      if (isSubtotalHeader(item.description) && n === 'total ventilation labour hours') {
        return { ...item, unit_price: ventHoursValue, quantity: 1, markup: 0, total: ventHoursValue };
      }
      // Inject [Total Project Labour Hours] (sum of the two above)
      if (isSubtotalHeader(item.description) && n === 'total project labour hours') {
        return { ...item, unit_price: totalProjectLabourHours, quantity: 1, markup: 0, total: totalProjectLabourHours };
      }
      return item;
    }),
  }));

  // Compute Col 14 total from the linked project's calculation_grid (sum of all Col14 values)
  const projectCol14Total = useMemo(() => {
    if (!linkedProject) {
      console.log('[CreateEstimatePanel] No linked project');
      return 0;
    }
    const calcGrid = linkedProject.calculation_grid || {};
    console.log('[CreateEstimatePanel] Full calculation_grid:', calcGrid);
    let total = 0;
    Object.entries(calcGrid).forEach(([key, value]) => {
      if (key.includes('_col14')) {
        total += (value || 0);
      }
    });
    console.log('[CreateEstimatePanel] Col14 total:', total, 'from keys:', Object.keys(calcGrid).filter(k => k.includes('_col14')), 'calcGrid keys count:', Object.keys(calcGrid).length);
    return total;
  }, [linkedProject]);

  // Inject "[Total Project Cost]" = Col 14 total from Calculation Engine
  const PROJECT_COST_BRACKET = 'total project cost';
  const projectCostValue = useMemo(() => {
    let value = 0;
    let found = false;
    sectionsPass5.forEach(s => {
      s.items.forEach((item) => {
        if (!isSubtotalHeader(item.description)) return;
        if (normalizeDesc(item.description) !== PROJECT_COST_BRACKET) return;
        found = true;
        value = projectCol14Total;
      });
    });
    console.log('[CreateEstimatePanel] Found [Total Project Cost] bracket:', found, 'value:', value);
    return value;
  }, [sectionsPass5, projectCol14Total]);

  const sectionsWithAggregate = sectionsPass5.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      // Preserve hour injections from Pass 5 (they were already set in sectionsPass5)
      // Inject Total Project Cost
      if (isSubtotalHeader(item.description) && n === PROJECT_COST_BRACKET) {
        return { ...item, total: projectCostValue };
      }
      // Preserve Ventilation Total Cost from Pass 4 (it's not a bracket header)
      if (n === 'ventilation total cost' || n === 'total cost for ventilation') {
        const origSection = sectionsPass4.find(ps => ps.id === s.id);
        const origItem = origSection?.items.find(oi => oi.id === item.id);
        if (origItem?.total != null) {
          return { ...item, total: origItem.total };
        }
      }
      return item;
    }),
  }));

  // ── Totals ─────────────────────────────────────────────────────────────────
  // Use [Total Project Cost] bracket value as the subtotal (not sum of all items)
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
          <button
            onClick={() => { setTemplateName(''); setTemplateDesc(''); setShowSaveTemplate(true); }}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
            title="Save as Estimate Template"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save as Template
          </button>
          <button
            onClick={async () => {
              await generateEstimatePDF({ clientInfo, sections: sectionsWithAggregate, subtotal, taxAmount, total, estimateNumber: activeEstimate?.estimate_number, logoUrls });
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
      {showSaveTemplate && (
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
        />
      </div>
    </div>
  );
}