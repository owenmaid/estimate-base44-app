import React, { useMemo, useRef, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { eachDayOfInterval, format, parseISO, isWeekend } from 'date-fns';
import { Package, CalendarRange, BarChart3 } from 'lucide-react';

const COL_WIDTH = 50; // px per day column
const GROUP_ORDER = ['Manpower Group', 'Equipment Group', 'Service Group', 'Totals Group'];

export default function DetailedProjectGantt() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const topScrollRef = useRef(null);
  const headerScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const [syncing, setSyncing] = useState(false);

  // Sync horizontal scroll across top scrollbar, date header, and body table
  const syncScroll = (source) => {
    if (syncing) return;
    setSyncing(true);
    const left = source.scrollLeft;
    if (topScrollRef.current && topScrollRef.current !== source) topScrollRef.current.scrollLeft = left;
    if (headerScrollRef.current && headerScrollRef.current !== source) headerScrollRef.current.scrollLeft = left;
    if (tableScrollRef.current && tableScrollRef.current !== source) tableScrollRef.current.scrollLeft = left;
    requestAnimationFrame(() => setSyncing(false));
  };

  // Reset scroll position when project changes
  useEffect(() => {
    if (topScrollRef.current) topScrollRef.current.scrollLeft = 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = 0;
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  }, [selectedProjectId]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const { dates, groups } = useMemo(() => {
    if (!selectedProject || !selectedProject.start_date || !selectedProject.end_date) {
      return { dates: [], rows: [] };
    }
    const start = parseISO(selectedProject.start_date);
    const end = parseISO(selectedProject.end_date);
    const allDates = eachDayOfInterval({ start, end });

    const equipmentRows = selectedProject.equipment_rows || [];
    const grid = selectedProject.equipment_grid || {};

    const rowData = equipmentRows.map(row => {
      let firstDate = null;
      let lastDate = null;
      const activeMask = allDates.map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const key = `${row.id}_${dateStr}`;
        const val = Number(grid[key] || 0);
        const active = val > 0;
        if (active) {
          if (!firstDate) firstDate = d;
          lastDate = d;
        }
        return active;
      });
      const invItem = inventory.find(i => i.id === row.item_id);
      return { row, firstDate, lastDate, activeMask, invItem };
    });

    // Sort: assigned items chronologically by first active date, unassigned at end
    const sorted = [...rowData].sort((a, b) => {
      if (!a.firstDate && !b.firstDate) return 0;
      if (!a.firstDate) return 1;
      if (!b.firstDate) return -1;
      return a.firstDate - b.firstDate;
    });

    // Group rows by their inventory item_group
    const groupsMap = {};
    sorted.forEach(r => {
      const g = r.invItem?.item_group || 'Uncategorized';
      (groupsMap[g] = groupsMap[g] || []).push(r);
    });
    const groups = [
      ...GROUP_ORDER.filter(g => groupsMap[g]).map(g => ({ name: g, rows: groupsMap[g] })),
      ...(groupsMap['Uncategorized'] ? [{ name: 'Uncategorized', rows: groupsMap['Uncategorized'] }] : [])
    ];

    return { dates: allDates, groups };
  }, [selectedProject, inventory]);

  const hasDateRange = selectedProject?.start_date && selectedProject?.end_date;

  const showGantt = selectedProjectId && hasDateRange && groups.length > 0;

  return (
    <div className="space-y-0">
      {/* Sticky header: title + project selector + top scrollbar */}
      <div className="sticky top-0 z-30 bg-background border-b border-border px-4 sm:px-6 pt-4 pb-3 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Detailed Project Gantt</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Inventory line items across the project timeline</p>
        </div>

        {/* Project selector */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 max-w-md">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select Project</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedProject && hasDateRange && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
                  <CalendarRange className="h-4 w-4 shrink-0" />
                  {format(parseISO(selectedProject.start_date), 'MMM d, yyyy')} — {format(parseISO(selectedProject.end_date), 'MMM d, yyyy')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top scrollbar synced with table below */}
        {showGantt && (
          <div
            ref={topScrollRef}
            onScroll={(e) => syncScroll(e.target)}
            className="overflow-x-auto overflow-y-hidden"
          >
            <div style={{ width: `${260 + dates.length * COL_WIDTH}px`, height: '1px' }} />
          </div>
        )}

        {/* Frozen date header (month + day rows) */}
        {showGantt && (
          <Card className="overflow-hidden rounded-b-none border-b-0">
            <div
              ref={headerScrollRef}
              onScroll={(e) => syncScroll(e.target)}
              className="overflow-x-auto gantt-table-scroll"
            >
            <table className="w-full text-xs border-collapse" style={{ minWidth: `${260 + dates.length * COL_WIDTH}px` }}>
              <thead>
                {/* Month row */}
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-1 font-medium text-muted-foreground sticky left-0 bg-card z-20 w-60">
                    Inventory Item
                  </th>
                  {dates.map((d, i) => {
                    const showMonth = i === 0 || d.getMonth() !== dates[i - 1].getMonth();
                    const showYear = i === 0 || d.getFullYear() !== dates[i - 1].getFullYear();
                    return (
                      <th key={`m-${i}`} className="text-center px-0.5 py-1 font-medium text-muted-foreground text-[10px] whitespace-nowrap" style={{ width: `${COL_WIDTH}px` }}>
                        {showMonth ? (showYear ? format(d, 'MMM yy') : format(d, 'MMM')) : ''}
                      </th>
                    );
                  })}
                </tr>
                {/* Day row */}
                <tr className="border-b border-border bg-muted/20">
                  <th className="sticky left-0 bg-card z-20 w-60 px-4 py-1.5"></th>
                  {dates.map((d, i) => {
                    const weekend = isWeekend(d);
                    return (
                      <th key={`d-${i}`} className={`text-center px-0.5 py-1.5 font-medium ${weekend ? 'text-muted-foreground/40' : 'text-muted-foreground'}`} style={{ width: `${COL_WIDTH}px` }}>
                        <div className="text-[9px]">{format(d, 'EEE').substring(0, 1)}</div>
                        <div className="font-bold">{format(d, 'd')}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
            </table>
            </div>
          </Card>
        )}
      </div>

      {/* Scrollable body */}
      <div className="px-4 sm:px-6 pb-4 space-y-4">
      {/* Gantt */}
      {!selectedProjectId ? (
        <EmptyState icon={BarChart3} message="Select a project above to view its inventory timeline." />
      ) : !hasDateRange ? (
        <EmptyState icon={CalendarRange} message="This project has no start/end date range set." />
      ) : groups.length === 0 ? (
        <EmptyState icon={Package} message="No inventory items assigned to this project." />
      ) : (
        <Card className="overflow-hidden rounded-t-none">
          <CardContent
            ref={tableScrollRef}
            onScroll={(e) => syncScroll(e.target)}
            className="p-0 overflow-x-auto gantt-table-scroll"
          >
            <table className="w-full text-xs border-collapse" style={{ minWidth: `${260 + dates.length * COL_WIDTH}px` }}>
              <tbody>
                {groups.map(group => (
                  <React.Fragment key={group.name}>
                    <tr className="border-b border-border bg-white/25">
                      <td colSpan={dates.length + 1} className="px-4 py-1.5 font-semibold text-[11px] uppercase tracking-wide text-secondary-foreground sticky left-0 z-20">
                        {group.name} <span className="ml-1 text-muted-foreground font-normal normal-case tracking-normal">({group.rows.length})</span>
                      </td>
                    </tr>
                    {group.rows.map(({ row, firstDate, activeMask, invItem }, ri) => (
                      <tr key={row.id} className={`border-b border-border/50 ${ri % 2 === 0 ? '' : 'bg-muted/10'} hover:bg-muted/20 transition-colors`}>
                        <td className="px-4 py-[3px] sticky left-0 bg-inherit z-10 w-60">
                          <div className="font-medium truncate" title={row.label}>{row.label}</div>
                          {invItem?.sku && <div className="text-muted-foreground text-[10px]">{invItem.sku}</div>}
                        </td>
                        {dates.map((d, ci) => {
                          const active = activeMask[ci];
                          const weekend = isWeekend(d);
                          return (
                            <td key={ci} className={`py-[3px] relative ${weekend ? 'bg-secondary/20' : ''}`} style={{ width: `${COL_WIDTH}px` }}>
                              {active && (
                                <div className="absolute top-0 bottom-0 left-[2px] right-[2px] rounded-full bg-primary/35 z-10" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {selectedProjectId && groups.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {groups.reduce((n, g) => n + g.rows.length, 0)} inventory items · {dates.length} days · {groups.reduce((n, g) => n + g.rows.filter(r => r.firstDate).length, 0)} active
        </p>
      )}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <Card>
      <CardContent className="py-20 text-center space-y-3">
        <Icon className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}