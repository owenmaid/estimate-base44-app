import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { calculateCostComponents, calculateScheduleHours } from '@/lib/calculations';
import ProjectCostDashboardView from '@/components/project-cost/ProjectCostDashboardView';

export default function ProjectCostDashboard() {
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chartGranularity, setChartGranularity] = useState('month'); // 'month' | 'day'
  const [equipChartType, setEquipChartType] = useState('line'); // 'line' | 'area'
  const [totalChartType, setTotalChartType] = useState('area'); // 'line' | 'area'

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-equipment'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates-all'],
    queryFn: () => base44.entities.Estimate.list(),
  });

  // Build a lookup: project_number (lowercase) → estimate subtotal + parsed KPI buckets
  const estimateMap = useMemo(() => {
    const map = {};

    const isHeader = (desc) => /[\[\]]/.test(desc || '');
    const isSpacer = (desc) => (desc || '') === '__SPACER__';
    const norm = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();

    // Section title groupings matching CreateEstimatePanel logic
    const EQUIPMENT_SECTIONS = ['total equipment | consumables cost'];
    // Logistics includes Support and Logistics section plus the Logistics bracket
    const LOGISTICS_SECTIONS = ['support and logistics'];
    const LOGISTICS_BRACKET = ['logistics / shipping', 'logistics/shipping', 'logistic / shipping', 'logistic/shipping'];
    const CONSUMABLES_BRACKET = ['ventilation consumables'];

    estimates.forEach(e => {
      const pn = (e.project_number || '').trim().toLowerCase();
      if (!pn) return;
      const subtotal = e.subtotal != null ? Number(e.subtotal) : null;

      // Parse line_items into sections
      const lineItems = e.line_items || [];
      const sections = [];
      let current = null;
      lineItems.forEach(item => {
        if ((item.description || '').startsWith('__SECTION__:')) {
          const title = item.description.slice('__SECTION__:'.length);
          current = { title: norm(title), items: [] };
          sections.push(current);
        } else if (current) {
          current.items.push(item);
        }
      });

      // Sum leaf items for a list of section titles
      const sumSections = (titleList) =>
        sections.reduce((sum, s) => {
          if (!titleList.includes(s.title)) return sum;
          return sum + s.items.reduce((a, item) => {
            if (isHeader(item.description) || isSpacer(item.description)) return a;
            return a + (item.total || 0);
          }, 0);
        }, 0);

      // Sum leaves under a specific bracket header across all sections
      const sumBracket = (bracketNames) => {
        let total = 0;
        sections.forEach(s => {
          s.items.forEach((item, idx) => {
            if (!isHeader(item.description)) return;
            if (!bracketNames.includes(norm(item.description))) return;
            for (let j = idx + 1; j < s.items.length; j++) {
              if (isHeader(s.items[j].description)) break;
              if (isSpacer(s.items[j].description)) continue;
              total += s.items[j].total || 0;
            }
          });
        });
        return total;
      };

      // Manpower = sum of ALL leaf items whose description matches an inventory item with sub_group_02 === 'MANPOWER'
      let kpiManpower = 0;
      sections.forEach(s => {
        s.items.forEach(item => {
          if (isHeader(item.description) || isSpacer(item.description)) return;
          const desc = (item.description || '').toLowerCase();
          const invMatch = inventory.find(i => 
            ((i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc) &&
            (i.sub_group_02 || '').toUpperCase() === 'MANPOWER'
          );
          if (invMatch) {
            kpiManpower += item.total || 0;
          }
        });
      });

      // Equipment = sum of ALL leaf items whose description matches an inventory item with sub_group_02 === 'EQUIPMENT'
      let kpiEquipment = 0;
      sections.forEach(s => {
        s.items.forEach(item => {
          if (isHeader(item.description) || isSpacer(item.description)) return;
          const desc = (item.description || '').toLowerCase();
          const invMatch = inventory.find(i => 
            ((i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc) &&
            (i.sub_group_02 || '').toUpperCase() === 'EQUIPMENT'
          );
          if (invMatch) {
            kpiEquipment += item.total || 0;
          }
        });
      });

      // Logistics = sum of ALL leaf items whose description matches an inventory item with sub_group_02 === 'LOGISTICS'
      let kpiLogistics = 0;
      sections.forEach(s => {
        s.items.forEach(item => {
          if (isHeader(item.description) || isSpacer(item.description)) return;
          const desc = (item.description || '').toLowerCase();
          const invMatch = inventory.find(i => 
            ((i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc) &&
            (i.sub_group_02 || '').toUpperCase() === 'LOGISTICS'
          );
          if (invMatch) {
            kpiLogistics += item.total || 0;
          }
        });
      });

      // Consumables = sum of ALL leaf items whose description matches an inventory item with sub_group_02 === 'CONSUMABLES'
      let kpiConsumables = 0;
      sections.forEach(s => {
        s.items.forEach(item => {
          if (isHeader(item.description) || isSpacer(item.description)) return;
          const desc = (item.description || '').toLowerCase();
          const invMatch = inventory.find(i => 
            ((i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc) &&
            (i.sub_group_02 || '').toUpperCase() === 'CONSUMABLES'
          );
          if (invMatch) {
            kpiConsumables += item.total || 0;
          }
        });
      });

      map[pn] = { subtotal, kpiManpower, kpiEquipment, kpiLogistics, kpiConsumables };
    });
    return map;
  }, [estimates, inventory]);

  // Keep a simple subtotal-only map for backwards compat
  const estimateTotalMap = useMemo(() => {
    const map = {};
    Object.entries(estimateMap).forEach(([pn, v]) => {
      if (v.subtotal != null) map[pn] = v.subtotal;
    });
    return map;
  }, [estimateMap]);

  // Build inventory lookup map
  const inventoryValueMap = useMemo(() => {
    const byId = {};
    const byName = {};
    inventory.forEach(item => {
      const regVal = item.reg_value === '' || item.reg_value === undefined ? null : Number(item.reg_value);
      const otVal = item.ot_value === '' || item.ot_value === undefined ? null : Number(item.ot_value);
      const entry = {
        reg: isNaN(regVal) ? null : regVal,
        ot: isNaN(otVal) ? null : otVal,
        item_group: item.item_group,
        category: item.category,
        sub_group_01: item.sub_group_01 || '',
        sub_group_02: item.sub_group_02 || '',
        name: item.name,
      };
      if (item.id) byId[item.id] = entry;
      if (item.name) byName[item.name.toLowerCase()] = entry;
      if (item.sku) byName[item.sku.toLowerCase()] = entry;
    });
    return { byId, byName };
  }, [inventory]);

  // Compute costs for any project
  const computeProjectCosts = (project) => {
    const equipmentRows = project.equipment_rows || [];
    const equipmentGrid = project.equipment_grid || {};
    const typeGrid = project.type_grid || {};

    const rowCosts = equipmentRows.map(row => {
      const inv = inventoryValueMap.byId[row.item_id] ?? inventoryValueMap.byName[row.label?.toLowerCase()] ?? null;
      const isManpower = inv?.item_group === 'Manpower Group';
      const hours = calculateScheduleHours(row, equipmentGrid, typeGrid, isManpower);
      const costs = calculateCostComponents({
        isManpower,
        shiftHours: hours.shiftHours,
        col1: hours.col1,
        col4: hours.col4,
        col5: hours.col5,
        col6: hours.col6,
        col7: hours.col7,
        col8: hours.col8,
        regRate: inv?.reg,
        otRate: inv?.ot,
      });
      const regCost = costs.regularCost;
      const otCost = costs.overtimeCost;
      const specialCost = costs.specialCost;

      const sg1 = (inv?.sub_group_01 || '').trim().toUpperCase();
      const isConventional = sg1 === 'CONVENTIONAL';

      return {
        rowId: row.id,
        label: row.label,
        item_group: inv?.item_group || 'Unknown',
        category: inv?.category || 'Uncategorized',
        sub_group_01: sg1,
        isConventional,
        regCost,
        otCost,
        specialCost,
        total: costs.totalCost,
      };
    });

    // Exclude CONVENTIONAL sub_group_01 rows from the summary totals
    const includedRows = rowCosts.filter(r => !r.isConventional);
    const totalReg = includedRows.reduce((s, r) => s + r.regCost, 0);
    const totalOT = includedRows.reduce((s, r) => s + r.otCost, 0);
    const totalSpec = includedRows.reduce((s, r) => s + r.specialCost, 0);
    const grandTotal = totalReg + totalOT + totalSpec;

    // Equipment total = DCSM Equipment + Ventilation Equipment
    const totalEquipment = rowCosts
      .filter(r => {
        const sg1 = r.sub_group_01;
        const inv = inventoryValueMap.byId[r.rowId] ?? inventoryValueMap.byName[r.label?.toLowerCase()] ?? null;
        const sg2 = (inv?.sub_group_02 || '').trim().toUpperCase();
        return (sg1 === 'DCSM' || sg1 === 'VENTILATION') && (sg2 === 'EQUIPMENT' || sg2 === 'LOGISTICS');
      })
      .reduce((s, r) => s + r.total, 0);

    return { rowCosts, totalReg, totalOT, totalSpec, grandTotal, totalEquipment };
  };

  // All-projects summary for the overview cards
  const allProjectsSummary = useMemo(() => {
    return projects.map(p => {
      const costs = computeProjectCosts(p);
      const pn = (p.project_number || '').trim().toLowerCase();
      const estimateTotal = estimateTotalMap[pn] ?? null;
      return { ...p, costs, estimateTotal };
    });
  }, [projects, inventoryValueMap, estimateTotalMap]);

  // Total across all projects — use estimate total where available, else grid total
  const totalGrandRevenue = allProjectsSummary.reduce((s, p) => s + (p.estimateTotal ?? p.costs.grandTotal), 0);

  // Filtered projects for search dropdown
  const filteredProjects = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.project_number?.toLowerCase().includes(q) ||
      p.client?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  // Bar chart data — top projects by cost
  const barData = useMemo(() => {
    return allProjectsSummary
      .filter(p => p.costs.grandTotal > 0)
      .sort((a, b) => b.costs.grandTotal - a.costs.grandTotal)
      .slice(0, 8)
      .map(p => ({
        name: p.project_number || p.name?.slice(0, 12) || 'N/A',
        fullName: p.name,
        total: p.costs.grandTotal,
        reg: p.costs.totalReg,
        ot: p.costs.totalOT,
        spec: p.costs.totalSpec,
      }));
  }, [allProjectsSummary]);

  const fmt = (n) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Build monthly area data by computing exact per-date costs for a single project
  const buildMonthlyAreaDataForProject = (project) => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const equipmentRows = project.equipment_rows || [];
    const equipmentGrid = project.equipment_grid || {};
    const typeGrid = project.type_grid || {};

    // Accumulate cost per date string (YYYY-MM-DD or however the key is stored)
    const dateTotals = {}; // { dateStr: { reg, ot, spec } }

    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const inv = inventoryValueMap.byId[row.item_id] ?? inventoryValueMap.byName[row.label?.toLowerCase()] ?? null;
      const regRate = inv?.reg ?? null;
      const otRate = inv?.ot ?? null;
      const isManpower = inv?.item_group === 'Manpower Group';

      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;

        const type = typeGrid[dateStr];
        let regUnits = 0, otUnits = 0, specUnits = 0;

        if (type === 'N') {
          regUnits = isManpower ? num * 8 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 8, 0) : 0;
        } else if (type === 'Sa') {
          regUnits = isManpower ? num * 4 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 4, 0) : 0;
        } else if (type === 'Su') {
          otUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else if (type === 'St') {
          // Special day
          specUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else {
          // No type set — treat like a normal day
          regUnits = isManpower ? num * shiftHrs : num;
        }

        const reg = regRate != null ? regUnits * regRate : 0;
        const ot = otRate != null ? otUnits * otRate : 0;
        const spec = otRate != null && specUnits > 0
          ? (specUnits * 2 * (4 / (shiftHrs * 2)) * otRate) + (specUnits * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
          : 0;

        if (!dateTotals[dateStr]) dateTotals[dateStr] = { reg: 0, ot: 0, spec: 0 };
        dateTotals[dateStr].reg += reg;
        dateTotals[dateStr].ot += ot;
        dateTotals[dateStr].spec += spec;
      });
    });

    // Bucket date totals by month
    const monthBuckets = {};
    Object.entries(dateTotals).forEach(([dateStr, costs]) => {
      // dateStr format: YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length < 2) return;
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (isNaN(year) || isNaN(month)) return;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!monthBuckets[key]) {
        monthBuckets[key] = { label: `${MONTHS[month - 1]} ${year}`, sortKey: key, total: 0, reg: 0, ot: 0, spec: 0 };
      }
      monthBuckets[key].reg += costs.reg;
      monthBuckets[key].ot += costs.ot;
      monthBuckets[key].spec += costs.spec;
      monthBuckets[key].total += costs.reg + costs.ot + costs.spec;
    });

    return Object.values(monthBuckets)
      .filter(b => b.total > 0)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  // Build daily area data for a single project (exact per-date costs, one point per day)
  const buildDailyAreaDataForProject = (project) => {
    const equipmentRows = project.equipment_rows || [];
    const equipmentGrid = project.equipment_grid || {};
    const typeGrid = project.type_grid || {};

    const dateTotals = {};

    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const inv = inventoryValueMap.byId[row.item_id] ?? inventoryValueMap.byName[row.label?.toLowerCase()] ?? null;
      const regRate = inv?.reg ?? null;
      const otRate = inv?.ot ?? null;
      const isManpower = inv?.item_group === 'Manpower Group';

      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;

        const type = typeGrid[dateStr];
        let regUnits = 0, otUnits = 0, specUnits = 0;

        if (type === 'N') {
          regUnits = isManpower ? num * 8 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 8, 0) : 0;
        } else if (type === 'Sa') {
          regUnits = isManpower ? num * 4 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 4, 0) : 0;
        } else if (type === 'Su') {
          otUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else if (type === 'St') {
          specUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else {
          regUnits = isManpower ? num * shiftHrs : num;
        }

        const reg = regRate != null ? regUnits * regRate : 0;
        const ot = otRate != null ? otUnits * otRate : 0;
        const spec = otRate != null && specUnits > 0
          ? (specUnits * 2 * (4 / (shiftHrs * 2)) * otRate) + (specUnits * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
          : 0;

        if (!dateTotals[dateStr]) dateTotals[dateStr] = { reg: 0, ot: 0, spec: 0 };
        dateTotals[dateStr].reg += reg;
        dateTotals[dateStr].ot += ot;
        dateTotals[dateStr].spec += spec;
      });
    });

    return Object.entries(dateTotals)
      .filter(([, c]) => c.reg + c.ot + c.spec > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, c]) => ({
        label: dateStr, // YYYY-MM-DD — shown on X axis
        reg: c.reg,
        ot: c.ot,
        spec: c.spec,
        total: c.reg + c.ot + c.spec,
      }));
  };

  // Build monthly area data (even-spread) for a list of projects — used for all-projects view
  const buildMonthlyAreaDataAllProjects = (projectList) => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();
    const allYears = new Set([currentYear]);
    projectList.forEach(p => {
      if (p.start_date) allYears.add(new Date(p.start_date).getFullYear());
      if (p.end_date) allYears.add(new Date(p.end_date).getFullYear());
    });
    const minYear = Math.min(...allYears);
    const maxYear = Math.max(...allYears);

    const monthBuckets = {};
    for (let y = minYear; y <= maxYear; y++) {
      for (let m = 0; m < 12; m++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        monthBuckets[key] = { label: `${MONTHS[m]} ${y}`, total: 0, reg: 0, ot: 0, spec: 0 };
      }
    }

    projectList.forEach(p => {
      if (!p.start_date || !p.end_date || p.costs.grandTotal <= 0) return;
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      if (end < start) return;

      const projectMonths = [];
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= endMonth) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        if (monthBuckets[key] !== undefined) projectMonths.push(key);
        cur.setMonth(cur.getMonth() + 1);
      }
      if (projectMonths.length === 0) return;

      const perMonth = p.costs.grandTotal / projectMonths.length;
      const perReg = p.costs.totalReg / projectMonths.length;
      const perOT = p.costs.totalOT / projectMonths.length;
      const perSpec = p.costs.totalSpec / projectMonths.length;

      projectMonths.forEach(key => {
        monthBuckets[key].total += perMonth;
        monthBuckets[key].reg += perReg;
        monthBuckets[key].ot += perOT;
        monthBuckets[key].spec += perSpec;
      });
    });

    return Object.values(monthBuckets).filter(b => b.total > 0);
  };

  // The 5 cost buckets matching ProjectDetailsSetup logic
  const EQUIP_SERIES = ['DCSM_EQUIP', 'VENT_EQUIP'];
  const isEquipOrLogistics = (sg2) => sg2 === 'EQUIPMENT' || sg2 === 'LOGISTICS';

  // Build equipment cost chart data split by sub_group_01 + sub_group_02 (matches ProjectDetailsSetup Cost Summary)
  const buildEquipmentAreaDataForProject = (project, granularity) => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const equipmentRows = project.equipment_rows || [];
    const equipmentGrid = project.equipment_grid || {};
    const typeGrid = project.type_grid || {};

    const emptyBuckets = () => ({ DCSM_MANPOWER: 0, VENT_MANPOWER: 0, DCSM_EQUIP: 0, VENT_EQUIP: 0, CONVENTIONAL: 0 });
    const dateTotals = {}; // { dateStr: emptyBuckets() }

    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const inv = inventoryValueMap.byId[row.item_id] ?? inventoryValueMap.byName[row.label?.toLowerCase()] ?? null;
      if (!inv) return;
      const sg1 = (inv.sub_group_01 || '').trim().toUpperCase();
      const sg2 = (inv.sub_group_02 || '').trim().toUpperCase();
      const isManpower = inv.item_group === 'Manpower Group';
      const regRate = inv.reg ?? null;
      const otRate = inv.ot ?? null;

      // Determine which series bucket this row belongs to
      let bucket = null;
      if (sg1 === 'DCSM' && sg2 === 'MANPOWER') return; // excluded
      else if (sg1 === 'VENTILATION' && sg2 === 'MANPOWER') return; // excluded
      else if (sg1 === 'DCSM' && isEquipOrLogistics(sg2)) bucket = 'DCSM_EQUIP';
      else if (sg1 === 'VENTILATION' && isEquipOrLogistics(sg2)) bucket = 'VENT_EQUIP';
      if (!bucket) return; // skip unclassified rows

      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;

        const type = typeGrid[dateStr];
        let regUnits = 0, otUnits = 0, specUnits = 0;
        if (type === 'N') {
          regUnits = isManpower ? num * 8 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 8, 0) : 0;
        } else if (type === 'Sa') {
          regUnits = isManpower ? num * 4 : num;
          otUnits = isManpower ? num * Math.max(shiftHrs - 4, 0) : 0;
        } else if (type === 'Su') {
          otUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else if (type === 'St') {
          specUnits = isManpower ? num * shiftHrs : 0;
          regUnits = isManpower ? 0 : num;
        } else {
          regUnits = isManpower ? num * shiftHrs : num;
        }
        const reg = regRate != null ? regUnits * regRate : 0;
        const ot = otRate != null ? otUnits * otRate : 0;
        const spec = otRate != null && specUnits > 0
          ? (specUnits * 2 * (4 / (shiftHrs * 2)) * otRate) + (specUnits * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
          : 0;

        if (!dateTotals[dateStr]) dateTotals[dateStr] = emptyBuckets();
        dateTotals[dateStr][bucket] += reg + ot + spec;
      });
    });

    const hasData = (c) => EQUIP_SERIES.some(g => c[g] > 0);

    if (granularity === 'day') {
      return Object.entries(dateTotals)
        .filter(([, c]) => hasData(c))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateStr, c]) => ({ label: dateStr, ...c }));
    }

    const monthBuckets = {};
    Object.entries(dateTotals).forEach(([dateStr, costs]) => {
      const parts = dateStr.split('-');
      if (parts.length < 2) return;
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (isNaN(year) || isNaN(month)) return;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!monthBuckets[key]) monthBuckets[key] = { label: `${MONTHS[month - 1]} ${year}`, sortKey: key, ...emptyBuckets() };
      EQUIP_SERIES.forEach(g => { monthBuckets[key][g] += costs[g]; });
    });

    return Object.values(monthBuckets)
      .filter(b => hasData(b))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  // Area chart data — respects granularity toggle; day view only available for selected project
  const monthlyAreaData = useMemo(() => {
    if (!selectedProject) return [];
    if (chartGranularity === 'day') {
      return buildDailyAreaDataForProject(selectedProject);
    }
    return buildMonthlyAreaDataForProject(selectedProject);
  }, [selectedProject?.id, inventoryValueMap, chartGranularity]);

  const equipmentAreaData = useMemo(() => {
    if (!selectedProject) return [];
    return buildEquipmentAreaDataForProject(selectedProject, chartGranularity);
  }, [selectedProject?.id, inventoryValueMap, chartGranularity]);

  const selectedCosts = selectedProject ? computeProjectCosts(selectedProject) : null;

  return <ProjectCostDashboardView search={search} setSearch={setSearch} selectedProject={selectedProject} setSelectedProject={setSelectedProject} showDropdown={showDropdown} setShowDropdown={setShowDropdown} chartGranularity={chartGranularity} setChartGranularity={setChartGranularity} equipChartType={equipChartType} setEquipChartType={setEquipChartType} totalChartType={totalChartType} setTotalChartType={setTotalChartType} loadingProjects={loadingProjects} estimateMap={estimateMap} allProjectsSummary={allProjectsSummary} totalGrandRevenue={totalGrandRevenue} filteredProjects={filteredProjects} barData={barData} fmt={fmt} monthlyAreaData={monthlyAreaData} equipmentAreaData={equipmentAreaData} selectedCosts={selectedCosts} />;
}

