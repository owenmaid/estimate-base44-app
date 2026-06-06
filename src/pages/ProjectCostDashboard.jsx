import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, FolderKanban, DollarSign, TrendingUp, Users, Wrench, Truck, Package, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area, LineChart, Line } from 'recharts';
import ProjectCostBreakdown from '@/components/projects/ProjectCostBreakdown';

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

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
    const MANPOWER_SECTIONS = ['indirects total', 'directs total'];
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

      const kpiManpower = sumSections(MANPOWER_SECTIONS);
      const kpiLogistics = sumSections(LOGISTICS_SECTIONS) + sumBracket(LOGISTICS_BRACKET);
      const kpiConsumables = sumBracket(CONSUMABLES_BRACKET);
      const kpiEquipRaw = sumSections(EQUIPMENT_SECTIONS);
      // Equipment = equipment section total minus logistics and consumables (which live inside it)
      const kpiEquipment = kpiEquipRaw - kpiLogistics - kpiConsumables;

      map[pn] = { subtotal, kpiManpower, kpiEquipment, kpiLogistics, kpiConsumables };
    });
    return map;
  }, [estimates]);

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
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const inv = inventoryValueMap.byId[row.item_id] ?? inventoryValueMap.byName[row.label?.toLowerCase()] ?? null;
      const regRate = inv?.reg ?? null;
      const otRate = inv?.ot ?? null;
      const isManpower = inv?.item_group === 'Manpower Group';

      let col1 = 0, col4 = 0, col5 = 0, col6 = 0, col7 = 0, col8 = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        col1 += num;
        const type = typeGrid[dateStr];
        if (type === 'N') { col4 += num * 8; col5 += num * Math.max(shiftHrs - 8, 0); }
        else if (type === 'Sa') { col4 += num * 4; col6 += num * Math.max(shiftHrs - 4, 0); }
        else if (type === 'Su') col7 += num * shiftHrs;
        else if (type === 'St') col8 += num * shiftHrs;
      });

      const effCol5 = isManpower ? col5 : 0;
      const effCol6 = isManpower ? col6 : 0;
      const effCol7 = isManpower ? col7 : 0;
      const effCol8 = isManpower ? col8 : 0;
      const regCost = regRate != null ? ((isManpower ? col4 : col1) * regRate) : 0;
      const otCost = otRate != null ? ((effCol5 + effCol6 + effCol7) * otRate) : 0;
      const specialCost = otRate != null
        ? (effCol8 * 2 * (4 / (shiftHrs * 2)) * otRate) + (effCol8 * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
        : 0;

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
        total: regCost + otCost + specialCost,
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

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Project Cost Dashboard</h1>
          <p className="text-muted-foreground text-[9px] mt-1">Interactive cost breakdown across all projects</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/projects"><FolderKanban className="h-4 w-4 mr-1.5" /> All Projects</Link>
        </Button>
      </div>

      {/* Overview KPI Cards */}
      {(() => {
        const isFiltered = !!selectedProject && !!selectedCosts;
        const getEstEntry = (p) => estimateMap[(p.project_number || '').trim().toLowerCase()] ?? null;

        // All KPIs are driven purely by the estimate — no grid fallback
        const kpiCostValue = isFiltered
          ? (getEstEntry(selectedProject)?.subtotal ?? 0)
          : allProjectsSummary.reduce((s, p) => s + (getEstEntry(p)?.subtotal ?? 0), 0);
        const kpiManpower = isFiltered
          ? (getEstEntry(selectedProject)?.kpiManpower ?? 0)
          : allProjectsSummary.reduce((s, p) => s + (getEstEntry(p)?.kpiManpower ?? 0), 0);
        const kpiLogistics = isFiltered
          ? (getEstEntry(selectedProject)?.kpiLogistics ?? 0)
          : allProjectsSummary.reduce((s, p) => s + (getEstEntry(p)?.kpiLogistics ?? 0), 0);
        const kpiConsumables = isFiltered
          ? (getEstEntry(selectedProject)?.kpiConsumables ?? 0)
          : allProjectsSummary.reduce((s, p) => s + (getEstEntry(p)?.kpiConsumables ?? 0), 0);
        const kpiEquipment = isFiltered
          ? (getEstEntry(selectedProject)?.kpiEquipment ?? 0)
          : allProjectsSummary.reduce((s, p) => s + (getEstEntry(p)?.kpiEquipment ?? 0), 0);

        return (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {isFiltered && (
              <div className="col-span-2 lg:col-span-5 flex items-center gap-2 text-xs text-primary bg-primary/8 border border-primary/20 rounded-lg px-3 py-2">
                <FolderKanban className="h-3.5 w-3.5 flex-shrink-0" />
                Showing values for: <span className="font-semibold">{selectedProject.name}</span>
                {selectedProject.project_number && <span className="text-muted-foreground">#{selectedProject.project_number}</span>}
              </div>
            )}
            <Card className={isFiltered ? 'border-green-500/30' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Cost Value</span>
                  <div className="h-8 w-8 rounded-lg bg-green-500/15 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-green-400" />
                  </div>
                </div>
                <div className="text-xl font-bold">{fmt(kpiCostValue)}</div>
                <div className="text-xs text-muted-foreground mt-1">{isFiltered ? 'from estimate' : 'all estimates'}</div>
              </CardContent>
            </Card>
            <Card className={isFiltered ? 'border-blue-500/30' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Manpower Cost</span>
                  <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
                <div className="text-xl font-bold">{fmt(kpiManpower)}</div>
                <div className="text-xs text-muted-foreground mt-1">from estimate</div>
              </CardContent>
            </Card>
            <Card className={isFiltered ? 'border-orange-500/30' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Equipment Cost</span>
                  <div className="h-8 w-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <Wrench className="h-4 w-4 text-orange-400" />
                  </div>
                </div>
                <div className="text-xl font-bold">{fmt(kpiEquipment)}</div>
                <div className="text-xs text-muted-foreground mt-1">from estimate</div>
              </CardContent>
            </Card>
            <Card className={isFiltered ? 'border-purple-500/30' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Logistics Cost</span>
                  <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                    <Truck className="h-4 w-4 text-purple-400" />
                  </div>
                </div>
                <div className="text-xl font-bold">{fmt(kpiLogistics)}</div>
                <div className="text-xs text-muted-foreground mt-1">from estimate</div>
              </CardContent>
            </Card>
            <Card className={isFiltered ? 'border-teal-500/30' : ''}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Consumables</span>
                  <div className="h-8 w-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
                    <Package className="h-4 w-4 text-teal-400" />
                  </div>
                </div>
                <div className="text-xl font-bold">{fmt(kpiConsumables)}</div>
                <div className="text-xs text-muted-foreground mt-1">from estimate</div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Project Selector */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Select a Project to View Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 pr-10"
              placeholder="Search by project name, number, or client..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(''); setShowDropdown(false); }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showDropdown && (search || true) && filteredProjects.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 max-h-72 overflow-y-auto">
                {filteredProjects.map(p => {
                  const pEntry = allProjectsSummary.find(s => s.id === p.id) || p;
                  const displayTotal = pEntry.estimateTotal ?? pEntry.costs?.grandTotal ?? 0;
                  return (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0 flex items-center justify-between gap-3"
                      onClick={() => {
                        setSelectedProject(pEntry);
                        setSearch(p.name || '');
                        setShowDropdown(false);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.project_number && <span className="mr-2">#{p.project_number}</span>}
                          {p.client && <span>{p.client}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={`text-xs border ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                        {displayTotal > 0 && (
                          <span className="text-xs font-semibold text-primary">{fmt(displayTotal)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedProject && selectedCosts && (
            <div className="mt-6 border-t border-border pt-6">
              <ProjectCostBreakdown
                project={selectedProject}
                costs={selectedCosts}
                fmt={fmt}
                onClose={() => { setSelectedProject(null); setSearch(''); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Cost Over Time Chart */}
      {selectedProject && equipmentAreaData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm">
                  Equipment Cost Over Time ({chartGranularity === 'day' ? 'by Day' : 'by Month'})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {chartGranularity === 'day'
                    ? `Equipment group costs per working day for: ${selectedProject.name}`
                    : `Equipment group costs grouped by month for: ${selectedProject.name}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                  <button onClick={() => setChartGranularity('month')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Month</button>
                  <button onClick={() => setChartGranularity('day')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Day</button>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                  <button onClick={() => setEquipChartType('line')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipChartType === 'line' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Line</button>
                  <button onClick={() => setEquipChartType('area')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipChartType === 'area' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Area</button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {equipChartType === 'line' ? (
                <LineChart key={`equip-line-${selectedProject?.id}-${chartGranularity}`} data={equipmentAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(equipmentAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`]} />
                  <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => ({ DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[v] || v)} />
                  <Line type="monotone" dataKey="DCSM_EQUIP" name="DCSM_EQUIP" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="VENT_EQUIP" name="VENT_EQUIP" stroke="#eab308" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart key={`equip-area-${selectedProject?.id}-${chartGranularity}`} data={equipmentAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="areaEquipDE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.4} /><stop offset="95%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaEquipVE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#eab308" stopOpacity={0.4} /><stop offset="95%" stopColor="#eab308" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(equipmentAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, { DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[name] || name]} />
                  <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => ({ DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[v] || v)} />
                  <Area type="monotone" dataKey="DCSM_EQUIP" name="DCSM_EQUIP" stackId="1" stroke="#f97316" strokeWidth={2} fill="url(#areaEquipDE)" />
                  <Area type="monotone" dataKey="VENT_EQUIP" name="VENT_EQUIP" stackId="1" stroke="#eab308" strokeWidth={2} fill="url(#areaEquipVE)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Monthly / Daily Cost Area Chart */}
      {selectedProject && monthlyAreaData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm">
                  Total Project Cost Over Time ({chartGranularity === 'day' ? 'by Day' : 'by Month'})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedProject
                    ? chartGranularity === 'day'
                      ? `Exact cost per working day for: ${selectedProject.name}`
                      : `Exact daily costs grouped by month for: ${selectedProject.name}`
                    : "Each project's cost is distributed evenly across its scheduled months and summed per month across all projects."}
                </p>
              </div>
              {selectedProject && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                    <button onClick={() => setChartGranularity('month')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Month</button>
                    <button onClick={() => setChartGranularity('day')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Day</button>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                    <button onClick={() => setTotalChartType('line')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${totalChartType === 'line' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Line</button>
                    <button onClick={() => setTotalChartType('area')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${totalChartType === 'area' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Area</button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {totalChartType === 'line' ? (
                <LineChart key={`total-line-${selectedProject?.id}-${chartGranularity}`} data={monthlyAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(monthlyAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : 'Special']} />
                  <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} wrapperStyle={{ fontSize: 9 }} />
                  <Line type="monotone" dataKey="reg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ot" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spec" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart key={`total-area-${selectedProject?.id}-${chartGranularity}`} data={monthlyAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="areaReg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaOT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaSpec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(monthlyAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : 'Special']} />
                  <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} wrapperStyle={{ fontSize: 9 }} />
                  <Area type="monotone" dataKey="reg" stackId="1" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#areaReg)" />
                  <Area type="monotone" dataKey="ot" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#areaOT)" />
                  <Area type="monotone" dataKey="spec" stackId="1" stroke="#f59e0b" strokeWidth={2} fill="url(#areaSpec)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bar Chart — Top Projects by Cost */}
      {barData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top Projects by Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={(props) => {
                  const { x, y, payload, index } = props;
                  const item = barData[index];
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={0} y={0} dy={10} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={9} fontWeight={600}>{payload.value}</text>
                      {item?.fullName && <text x={0} y={0} dy={20} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{item.fullName.slice(0, 14)}</text>}
                    </g>
                  );
                }} height={40} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : name === 'spec' ? 'Special' : 'Total']}
                />
                <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} />
                <Bar dataKey="reg" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ot" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="spec" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* All Projects Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">All Projects — Cost Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/60 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Number</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Reg Cost</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">OT Cost</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Special</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Equipment</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {loadingProjects ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading projects...</td></tr>
                ) : allProjectsSummary.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">No projects found</td></tr>
                ) : (
                  allProjectsSummary.map(p => (
                    <tr
                      key={p.id}
                      className={`border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer ${selectedProject?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      onClick={() => { setSelectedProject(p); setSearch(p.name || ''); setShowDropdown(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    >
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.project_number || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.client || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs border ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalReg > 0 ? fmt(p.costs.totalReg) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalOT > 0 ? fmt(p.costs.totalOT) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalSpec > 0 ? fmt(p.costs.totalSpec) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{p.costs.totalEquipment > 0 ? fmt(p.costs.totalEquipment) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-primary">
                        {p.estimateTotal != null
                          ? <>{fmt(p.estimateTotal)}<span className="ml-1 text-[9px] text-muted-foreground">(est.)</span></>
                          : p.costs.grandTotal > 0 ? fmt(p.costs.grandTotal) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild onClick={e => e.stopPropagation()}>
                          <Link to={`/project-planning/${p.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {allProjectsSummary.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-muted-foreground">Totals</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalReg, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalOT, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalSpec, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalEquipment, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-primary">{fmt(totalGrandRevenue)}<span className="ml-1 text-[9px] text-muted-foreground">(est.)</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}