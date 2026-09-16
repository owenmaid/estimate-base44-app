import React, { useMemo, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { addDays, format, startOfWeek, differenceInDays, parseISO, isValid, isSameDay } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_COLORS = {
  active:    'bg-green-500',
  planning:  'bg-primary',
  on_hold:   'bg-yellow-500',
  completed: 'bg-muted-foreground',
};

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

// Total scrollable range: 52 weeks back to 52 weeks forward = 104 weeks
const SCROLL_RANGE_WEEKS = 104;
const SCROLL_ORIGIN_WEEKS = 52; // how many weeks before "today" the scroll starts

const ZOOM_OPTIONS = [
  { value: '16', label: '16 weeks', colWidth: 52 },
  { value: '26', label: '26 weeks', colWidth: 36 },
  { value: '52', label: '52 weeks', colWidth: 22 },
];

export default function GanttPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [zoom, setZoom] = useState('16');
  const zoomConfig = ZOOM_OPTIONS.find(z => z.value === zoom) || ZOOM_OPTIONS[0];
  const TOTAL_WEEKS = Number(zoomConfig.value);
  const colWidth = zoomConfig.colWidth;

  const maxOffset = SCROLL_RANGE_WEEKS - SCROLL_ORIGIN_WEEKS - TOTAL_WEEKS;
  const minOffset = -SCROLL_ORIGIN_WEEKS;

  React.useEffect(() => {
    if (weekOffset > maxOffset) setWeekOffset(maxOffset);
    if (weekOffset < minOffset) setWeekOffset(minOffset);
  }, [maxOffset, minOffset]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  // Anchor: start of current week + offset
  const anchorDate = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  // Build array of week-start dates
  const weeks = useMemo(() =>
    Array.from({ length: TOTAL_WEEKS }, (_, i) => addDays(anchorDate, i * 7)),
    [anchorDate]
  );

  // Filter projects that have at least a start_date or end_date, and are active/planning/on_hold
  const visibleProjects = useMemo(() => {
    return projects.filter(p => p.start_date || p.end_date);
  }, [projects]);

  const today = new Date();

  // Today's column index (0-based week)
  const todayColIndex = useMemo(() => {
    return weeks.findIndex((w, i) => {
      const next = weeks[i + 1] ? weeks[i + 1] : addDays(w, 7);
      return today >= w && today < next;
    });
  }, [weeks, today]);

  const getBar = (project) => {
    const start = project.start_date ? parseISO(project.start_date) : null;
    const end = project.end_date ? parseISO(project.end_date) : null;
    if (!start && !end) return null;

    const rangeStart = addDays(anchorDate, 0);
    const rangeEnd = addDays(anchorDate, TOTAL_WEEKS * 7 - 1);

    const effectiveStart = start || end;
    const effectiveEnd = end || start;

    // No overlap with visible range
    if (effectiveEnd < rangeStart || effectiveStart > rangeEnd) return null;

    const clampedStart = effectiveStart < rangeStart ? rangeStart : effectiveStart;
    const clampedEnd = effectiveEnd > rangeEnd ? rangeEnd : effectiveEnd;

    // Convert to column positions (each col = 7 days = 1 week)
    const startOffset = differenceInDays(clampedStart, anchorDate);
    const endOffset = differenceInDays(clampedEnd, anchorDate);

    const startCol = Math.floor(startOffset / 7);
    const endCol = Math.floor(endOffset / 7);

    return { startCol, endCol, clipped: effectiveStart < rangeStart || effectiveEnd > rangeEnd };
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gantt Chart</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Project timelines by start & end date</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>
          <span className="text-sm text-muted-foreground min-w-max">
            {format(weeks[0], 'MMM d')} – {format(addDays(weeks[TOTAL_WEEKS - 1], 6), 'MMM d, yyyy')}
          </span>
          <Select value={zoom} onValueChange={setZoom}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ZOOM_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Horizontal scroll bar for date navigation */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -SCROLL_ORIGIN_WEEKS * 7), 'MMM yyyy')}
        </span>
        <input
          type="range"
          min={minOffset}
          max={maxOffset}
          value={weekOffset}
          onChange={e => setWeekOffset(Number(e.target.value))}
          className="flex-1 accent-primary cursor-pointer h-1.5"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), (SCROLL_RANGE_WEEKS - SCROLL_ORIGIN_WEEKS) * 7), 'MMM yyyy')}
        </span>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 animate-pulse bg-muted rounded" />)}
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No projects with start/end dates found.</p>
              <p className="text-muted-foreground text-xs">Add start and end dates to your projects in Project Planning.</p>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ minWidth: `${200 + TOTAL_WEEKS * colWidth}px` }}>
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground sticky left-0 bg-card z-10 w-52">Project</th>
                  {weeks.map((w, i) => (
                    <th
                      key={i}
                      style={{ width: `${colWidth}px` }}
                      className={`text-center py-3 px-0.5 font-medium ${i === todayColIndex ? 'text-primary' : 'text-muted-foreground'} ${colWidth < 30 ? 'text-[9px]' : ''}`}
                    >
                      <div>{format(w, colWidth < 30 ? 'M/d' : 'MMM d')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map((project, ri) => {
                  const bar = getBar(project);
                  return (
                    <tr key={project.id} className={`border-b border-border/50 ${ri % 2 === 0 ? '' : 'bg-muted/10'} hover:bg-muted/20 transition-colors`}>
                      {/* Project label */}
                      <td className="px-4 py-2.5 sticky left-0 bg-inherit z-10">
                        <div className="flex items-center gap-2">
                          <Link to={`/project-planning?id=${project.id}`} className="font-medium truncate hover:text-primary transition-colors max-w-[130px]">
                            {project.name}
                          </Link>
                          <Badge className={`text-[10px] border shrink-0 ${STATUS_STYLES[project.status]}`}>
                            {STATUS_LABELS[project.status]}
                          </Badge>
                        </div>
                        {project.client && (
                          <div className="text-muted-foreground truncate mt-0.5">{project.client}</div>
                        )}
                      </td>

                      {/* Week cells */}
                      {weeks.map((w, ci) => {
                        const isToday = ci === todayColIndex;
                        const inBar = bar && ci >= bar.startCol && ci <= bar.endCol;
                        const isBarStart = bar && ci === bar.startCol;
                        const isBarEnd = bar && ci === bar.endCol;
                        const color = STATUS_COLORS[project.status] || 'bg-primary';

                        return (
                          <td key={ci} className={`py-2.5 px-0.5 relative ${isToday ? 'bg-primary/5' : ''}`}>
                            {isToday && (
                              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-px w-0.5 bg-primary/40 z-0" />
                            )}
                            {inBar && (
                              <div
                                className={`relative z-10 h-6 ${color} opacity-85 ${isBarStart ? 'rounded-l-full ml-1' : ''} ${isBarEnd ? 'rounded-r-full mr-1' : ''}`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${STATUS_COLORS[key]} opacity-85`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-primary/60" />
          Today
        </div>
      </div>
    </div>
  );
}