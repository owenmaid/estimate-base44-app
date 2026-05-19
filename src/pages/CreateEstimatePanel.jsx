import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PalettePanel from '@/components/estimate-panel/PalettePanel';
import EstimateCanvas from '@/components/estimate-panel/EstimateCanvas';
import EstimateSearchBar from '@/components/estimate-panel/EstimateSearchBar';
import { X, Download } from 'lucide-react';
import { generateEstimatePDF } from '@/lib/generateEstimatePDF';

export default function CreateEstimatePanel() {
  const queryClient = useQueryClient();

  // The estimate being edited (null = new)
  const [activeEstimate, setActiveEstimate] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Sections: [{id, title, items:[{id,description,quantity,unit_price,total,markup}]}]
  const [sections, setSections] = useState([
    { id: Date.now(), title: 'Section 1', items: [] }
  ]);

  // Client info
  const [clientInfo, setClientInfo] = useState({
    client_name: '', project_number: '', client_email: '',
    client_phone: '', client_address: '', notes: '',
    tax_rate: 0, discount: 0,
  });

  // Logo URLs (loaded from settings)
  const [logoUrls, setLogoUrls] = useState({
    infoSignalLogo: '',
    dynaVentLogo: '',
  });

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
      project_number: estimate.project_number || estimate.project_name || '',
      client_email: estimate.client_email || '',
      client_phone: estimate.client_phone || '',
      client_address: estimate.client_address || '',
      notes: estimate.notes || '',
      tax_rate: estimate.tax_rate || 0,
      discount: estimate.discount || 0,
    });
    setLogoUrls({
      infoSignalLogo: estimate.info_signal_logo || '',
      dynaVentLogo: estimate.dyna_vent_logo || '',
    });

    // Reconstruct sections from line_items
    const lineItems = estimate.line_items || [];
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

    setSections(rebuilt.length > 0 ? rebuilt : [{ id: Date.now(), title: 'Section 1', items: [] }]);
    toast.success(`Loaded: ${estimate.project_name || estimate.client_name}`);
  };

  // ── Reset to blank ─────────────────────────────────────────────────────────
  const handleNew = () => {
    setActiveEstimate(null);
    setSections([{ id: Date.now(), title: 'Section 1', items: [] }]);
    setClientInfo({ client_name: '', project_number: '', client_email: '', client_phone: '', client_address: '', notes: '', tax_rate: 0, discount: 0 });
    setLogoUrls({ infoSignalLogo: '', dynaVentLogo: '' });
  };

  const handleCloseEstimate = () => setShowCloseConfirm(true);

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
    setSections(newSections);
  };

  // ── Aggregate helpers ──────────────────────────────────────────────────────
  const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
  const isSpacer = (desc) => (desc || '') === '__SPACER__';
  const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();

  // Compute the display total of a section (mirrors EstimateCanvas logic)
  const getSectionTotal = (sectionItems) => {
    const bracketItems = sectionItems.filter(i => isSubtotalHeader(i.description));
    if (bracketItems.length > 0) {
      const map = {};
      sectionItems.forEach((item, idx) => {
        if (!isSubtotalHeader(item.description)) return;
        let sum = 0;
        for (let j = idx + 1; j < sectionItems.length; j++) {
          if (isSubtotalHeader(sectionItems[j].description)) break;
          if (isSpacer(sectionItems[j].description)) continue;
          sum += sectionItems[j].total || 0;
        }
        map[item.id] = sum;
      });
      return bracketItems.reduce((s, i) => s + (map[i.id] || 0), 0);
    }
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
      // Sum items below this bracket until the next bracket
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
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
        sum += s.items[j].total || 0;
      }
      logisticsValue = sum;
    });
  });

  // Sum of [Ventilation Equipment - (Exp. Blowers. Duct, Hose)] + [Ventilation Equipment - (Blowers, Duct, Hose)] bracket subtotals
  // Use flexible matching since the bracket names contain special chars and may vary slightly
  const isVentEquipBracket = (desc) => {
    const n = normalizeDesc(desc);
    return n.startsWith('ventilation equipment');
  };
  const VENT_EQUIP_TOTAL_TARGET = 'ventilation equipment total cost';

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
        sum += s.items[j].total || 0;
      }
      ventConsumablesValue = sum;
    });
  });

  let ventEquipValue = 0;
  sectionsPass2.forEach(s => {
    s.items.forEach((item, idx) => {
      if (!isSubtotalHeader(item.description)) return;
      if (!isVentEquipBracket(item.description)) return;
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        sum += s.items[j].total || 0;
      }
      ventEquipValue += sum; // accumulate both brackets
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

  // Pass 4: Sum all item totals from "Ventilation" section + "Total Ventilation Equipment | Consumables Cost" section
  // and mirror into the target line item in "Total Cost for Ventilation" section
  const TOTAL_COST_VENT_TARGET = 'total cost for ventilation';

  const isSectionMatch = (title, keywords) => keywords.some(kw => (title || '').toLowerCase().includes(kw));

  const ventilationSectionTotal = sectionsPass3
    .filter(s => isSectionMatch(s.title, ['ventilation']) && !isSectionMatch(s.title, ['total cost for ventilation']))
    .reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.total || 0), 0), 0);

  const sectionsPass4 = sectionsPass3.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === TOTAL_COST_VENT_TARGET
        ? { ...item, total: ventilationSectionTotal }
        : item
    ),
  }));

  // Pass 5: Sum [Total Labour Hours] + [Total Ventilation Labour Hours] bracket subtotals → [Total Project Labour Hours]
  // Find the [Total Labour Hours] and [Total Ventilation Labour Hours] bracket rows anywhere in sections
  let totalLabourHoursValue = 0;
  let totalVentLabourHoursValue = 0;
  
  sectionsPass4.forEach(s => {
    s.items.forEach((item, idx) => {
      if (!isSubtotalHeader(item.description)) return;
      const itemN = normalizeDesc(item.description);
      // Sum items below this bracket until the next bracket
      let sum = 0;
      for (let j = idx + 1; j < s.items.length; j++) {
        if (isSubtotalHeader(s.items[j].description)) break;
        if (isSpacer(s.items[j].description)) continue;
        sum += s.items[j].total || 0;
      }
      if (itemN === 'total labour hours') {
        totalLabourHoursValue = sum;
      }
      if (itemN === 'total ventilation labour hours') {
        totalVentLabourHoursValue = sum;
      }
    });
  });

  const totalProjectLabourHours = totalLabourHoursValue + totalVentLabourHoursValue;
  const TOTAL_PROJECT_LABOUR_HOURS_TARGET = 'total project labour hours';

  const sectionsPass5 = sectionsPass4.map(s => ({
    ...s,
    items: s.items.map(item =>
      normalizeDesc(item.description) === TOTAL_PROJECT_LABOUR_HOURS_TARGET
        ? { ...item, unit_price: totalProjectLabourHours, quantity: 1, markup: 0, total: totalProjectLabourHours }
        : item
    ),
  }));

  // Pass 6: inject hour totals from the linked project's Calculation Engine
  const DCSM_HOURS_TARGET = 'dcsm est total hours';
  const VENT_HOURS_TARGET  = 'total ventilation labour hours'; // ventilation-only Col2 sum

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
    sectionsPass4.forEach(s => {
      s.items.forEach((item) => {
        if (!isSubtotalHeader(item.description)) return;
        if (normalizeDesc(item.description) !== PROJECT_COST_BRACKET) return;
        found = true;
        value = projectCol14Total;
      });
    });
    console.log('[CreateEstimatePanel] Found [Total Project Cost] bracket:', found, 'value:', value);
    return value;
  }, [sectionsPass4, projectCol14Total]);

  const sectionsWithAggregate = sectionsPass5.map(s => ({
    ...s,
    items: s.items.map(item => {
      const n = normalizeDesc(item.description);
      if (n === DCSM_HOURS_TARGET)
        return { ...item, unit_price: col2Sum, quantity: 1, markup: 0, total: col2Sum };
      if (n === VENT_HOURS_TARGET)
        return { ...item, unit_price: ventCol2Sum, quantity: 1, markup: 0, total: ventCol2Sum };
      if (isSubtotalHeader(item.description) && n === PROJECT_COST_BRACKET)
        return { ...item, total: projectCostValue };
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

      // If already editing a known record, always update it
      if (activeEstimate) {
        const payload = {
          ...clientInfo,
          line_items: lineItems,
          subtotal,
          tax_amount: taxAmount,
          total,
          status: activeEstimate.status,
          estimate_number: activeEstimate.estimate_number,
          info_signal_logo: logoUrls.infoSignalLogo,
          dyna_vent_logo: logoUrls.dynaVentLogo,
        };
        return base44.entities.Estimate.update(activeEstimate.id, payload);
      }

      // New save: if project_number is set, check for an existing record with that number first
      if (clientInfo.project_number.trim()) {
        const existing = await base44.entities.Estimate.filter({ project_number: clientInfo.project_number.trim() });
        if (existing && existing.length > 0) {
          // Update the existing record instead of creating a duplicate
          const match = existing[0];
          const payload = {
            ...clientInfo,
            line_items: lineItems,
            subtotal,
            tax_amount: taxAmount,
            total,
            status: match.status || 'draft',
            estimate_number: match.estimate_number,
          };
          return base44.entities.Estimate.update(match.id, payload);
        }
      }

      // Truly new — create
      const payload = {
        ...clientInfo,
        line_items: lineItems,
        subtotal,
        tax_amount: taxAmount,
        total,
        status: 'draft',
        estimate_number: `EST-${Date.now().toString().slice(-6)}`,
        info_signal_logo: logoUrls.infoSignalLogo,
        dyna_vent_logo: logoUrls.dynaVentLogo,
      };
      return base44.entities.Estimate.create(payload);
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

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Tool Palette */}
        <PalettePanel
          inventory={inventory}
          sections={sections}
          onAddSection={addSection}
          onAddItemToSection={addItemToSection}
          projectNumber={clientInfo.project_number}
        />

        {/* RIGHT: Estimate Canvas */}
        <EstimateCanvas
          clientInfo={clientInfo}
          onClientInfoChange={setClientInfo}
          sections={sectionsWithAggregate}
          onRenameSection={renameSection}
          onRemoveSection={removeSection}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onReorderItems={reorderItems}
          onReorderSections={reorderSections}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          inventory={inventory}
        />
      </div>
    </div>
  );
}