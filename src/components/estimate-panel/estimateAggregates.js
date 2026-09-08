import { computeCol14 } from '@/lib/computeCol14';
import { calculateEstimateSummary } from '@/lib/calculations';
import { createStableId } from '@/lib/reliability';

export function buildEstimateAggregates({ sections, inventory, linkedProject, col2Sum, ventCol2Sum, clientInfo }) {
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
  const ventEquipCategoryValue = (() => {
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
  })();
  
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
      newBrackets.push({ id: createStableId('item'), description: '[DCSM Est Total Hours]',           quantity: 1, unit_price: 0, markup: 0, total: 0 });
    if (!existingDescs.includes('total ventilation labour hours') && ventHoursValue > 0)
      newBrackets.push({ id: createStableId('item'), description: '[Total Ventilation Labour Hours]',  quantity: 1, unit_price: 0, markup: 0, total: 0 });
    if (!existingDescs.includes('total project labour hours') && totalProjectLabourHours > 0)
      newBrackets.push({ id: createStableId('item'), description: '[Total Project Labour Hours]',      quantity: 1, unit_price: 0, markup: 0, total: 0 });
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
  const { subtotal, taxAmount, total } = calculateEstimateSummary(
    projectCostValue,
    clientInfo.tax_rate,
    clientInfo.discount,
  );
  
  
  return { sectionsWithAggregate, conventionalCostsTotal, subtotal, taxAmount, total };
}

