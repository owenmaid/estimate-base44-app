import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { computeCol14 } from '@/lib/computeCol14';
import { Search, TrendingDown, TrendingUp, Minus, X } from 'lucide-react';

const SERIF = { fontFamily: "'Playfair Display', Georgia, serif" };

const GROUP_STYLES = {
  'Manpower Group': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Equipment Group': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Service Group': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Totals Group': 'bg-muted text-muted-foreground border-border',
};

// Resolve the inventory entry for a row (mirrors computeCol14's lookup).
const rowInventoryEntry = (row, inventoryItems) =>
  inventoryItems.find(i => String(i.id) === String(row.item_id))
  || inventoryItems.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
  || null;

export default function ItemCostComparison() {
  const [search, setSearch] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Per-project, per-inventory-item cost map: { projectId: { itemId: cost } }
  const projectItemCosts = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      const perItem = {};
      const rows = p.equipment_rows || [];
      const eGrid = p.equipment_grid || {};
      const tGrid = p.type_grid || {};
      rows.forEach(row => {
        const entry = rowInventoryEntry(row, inventoryItems);
        if (!entry) return;
        const val = computeCol14(row, eGrid, tGrid, inventoryItems);
        if (val == null || val <= 0) return;
        perItem[entry.id] = (perItem[entry.id] || 0) + val;
      });
      map[p.id] = perItem;
    });
    return map;
  }, [projects, inventoryItems]);

  // Default: select up to 5 most recent projects
  const activeProjectIds = useMemo(() => {
    if (selectedProjectIds.length > 0) return selectedProjectIds;
    return projects.slice(0, 5).map(p => p.id);
  }, [selectedProjectIds, projects]);

  const activeProjects = useMemo(
    () => projects.filter(p => activeProjectIds.includes(p.id)),
    [projects, activeProjectIds]
  );

  // Build the unified row list: inventory items that have a cost in at least one active project
  const rows = useMemo(() => {
    const itemIds = new Set();
    activeProjectIds.forEach(pid => {
      const perItem = projectItemCosts[pid] || {};
      Object.keys(perItem).forEach(id => itemIds.add(id));
    });
    let items = Array.from(itemIds)
      .map(id => inventoryItems.find(i => String(i.id) === String(id)))
      .filter(Boolean);

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.sku || '').toLowerCase().includes(q) ||
        (i.item_group || '').toLowerCase().includes(q) ||
        (i.sub_group_01 || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [activeProjectIds, projectItemCosts, inventoryItems, search]);

  const toggleProject = (id) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const clearProjects = () => setSelectedProjectIds([]);

  const fmt = (v) => v != null && v > 0
    ? `$${v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

  // For each row, compute min/max across active projects (only non-zero values)
  const rowTrend = (item) => {
    const vals = activeProjectIds
      .map(pid => (projectItemCosts[pid] || {})[item.id])
      .filter(v => v != null && v > 0);
    if (vals.length < 2) return { min: null, max: null, spread: 0, increasing: null };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const spread = max - min;
    const avg = (min + max) / 2;
    const spreadPct = avg > 0 ? (spread / avg) * 100 : 0;
    // increasing if later projects cost more (by created_date order = activeProjects order)
    return { min, max, spread, spreadPct };
  };

  return (
    <div className="min-h-full bg-background p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={SERIF}>Item Cost Comparison</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compare per-item costs across projects side-by-side to spot price trends
          </p>
        </div>
      </div>

      {/* Project selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base" style={SERIF}>Projects to Compare</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{activeProjectIds.length} selected</Badge>
              {selectedProjectIds.length > 0 && (
                <Button size="sm" variant="ghost" onClick={clearProjects} className="h-7 px-2 text-xs">
                  <X className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {projects.map(p => {
              const selected = activeProjectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
            {projects.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects available</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base" style={SERIF}>Cost Breakdown by Item</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search items..."
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : activeProjectIds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Select at least one project to compare
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No matching items with costs across the selected projects
            </p>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="min-w-max text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b border-border text-[11px] uppercase tracking-wider bg-muted/30">
                    <th className="text-left px-4 py-3.5 font-medium sticky left-0 bg-muted/30 z-10">Item</th>
                    <th className="text-left px-4 py-3.5 font-medium">Group</th>
                    <th className="text-left px-4 py-3.5 font-medium">Sub Group</th>
                    {activeProjects.map(p => (
                      <th key={p.id} className="text-right px-4 py-3.5 font-medium whitespace-nowrap" title={p.name}>
                      <div className="truncate max-w-[160px]">{p.name}</div>
                    </th>
                    ))}
                    <th className="text-right px-4 py-3.5 font-medium">Trend</th>
                    <th className="text-right px-4 py-3.5 font-medium">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => {
                    const trend = rowTrend(item);
                    return (
                      <tr key={item.id} className="border-b border-border/40 hover:bg-muted/25 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground sticky left-0 bg-card z-10">
                          <div className="truncate max-w-[220px]">{item.name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] border ${GROUP_STYLES[item.item_group] || 'bg-muted text-muted-foreground border-border'}`}>
                            {(item.item_group || '—').replace(' Group', '')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {item.sub_group_01 || '—'}
                        </td>
                        {activeProjects.map(p => {
                          const v = (projectItemCosts[p.id] || {})[item.id];
                          const isMin = trend.min != null && v === trend.min;
                          const isMax = trend.max != null && v === trend.max;
                          return (
                            <td
                              key={p.id}
                              className={`px-4 py-3 text-right tabular-nums ${
                                isMin ? 'text-emerald-400 font-semibold' :
                                isMax ? 'text-red-400 font-semibold' :
                                v != null && v > 0 ? 'text-foreground' : 'text-muted-foreground'
                              }`}
                            >
                              {fmt(v)}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          {trend.min == null ? (
                            <Minus className="h-4 w-4 text-muted-foreground inline" />
                          ) : trend.spreadPct < 1 ? (
                            <span className="inline-flex items-center text-muted-foreground text-xs">
                              <Minus className="h-4 w-4 mr-1" /> stable
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-xs">
                              <TrendingUp className="h-4 w-4 mr-1 text-amber-400" />
                              {trend.spreadPct.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">
                          {trend.spread > 0 ? fmt(trend.spread) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                      <td colSpan={3} className="px-4 py-3.5 text-right text-muted-foreground uppercase text-[11px] tracking-wider sticky left-0 bg-muted/20">
                        Project Total
                      </td>
                      {activeProjects.map(p => {
                        const total = Object.values(projectItemCosts[p.id] || {}).reduce((s, v) => s + v, 0);
                        return (
                          <td key={p.id} className="px-4 py-3.5 text-right text-primary tabular-nums">
                            {fmt(total)}
                          </td>
                        );
                      })}
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Lowest price in row
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Highest price in row
        </span>
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> Spread % (price variation across projects)
        </span>
      </div>
    </div>
  );
}