import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, eachDayOfInterval, parseISO, isWeekend, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';

export default function ProjectDetailsSetup() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dates, setDates] = useState([]);
  const [grid, setGrid] = useState({}); // { "row_date": skuName }
  const [viewMonth, setViewMonth] = useState(null);
  const [rows, setRows] = useState([{ id: 1, label: 'Row 1' }]);

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-manpower'],
    queryFn: async () => {
      const allItems = await base44.entities.InventoryItem.list();
      return allItems.filter(item => item.category?.toLowerCase() === 'manpower');
    },
  });

  const handleCreateDates = () => {
    if (!startDate || !endDate) return;
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (end < start) return;
    const allDates = eachDayOfInterval({ start, end });
    setDates(allDates);
    setViewMonth(start);
    setGrid({});
  };

  const visibleDates = viewMonth
    ? dates.filter(d => isSameMonth(d, viewMonth))
    : dates;

  const totalMonths = viewMonth ? Math.ceil(dates.length / 30) : 0;

  const handleCellChange = (rowId, dateStr, value) => {
    setGrid(prev => ({
      ...prev,
      [`${rowId}_${dateStr}`]: value,
    }));
  };

  const addRow = () => {
    setRows(prev => [...prev, { id: prev.length + 1, label: `Row ${prev.length + 1}` }]);
  };

  const removeRow = (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setGrid(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${id}_`)) delete next[k];
      });
      return next;
    });
  };

  const canGoPrev = viewMonth && dates.length > 0 && viewMonth > dates[0];
  const canGoNext = viewMonth && dates.length > 0 && viewMonth < dates[dates.length - 1];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Details Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">Define your project timeline and assign manpower to each day.</p>
      </div>

      {/* Date Range Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Set Project Dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={handleCreateDates} disabled={!startDate || !endDate}>
              Create Dates
            </Button>
          </div>
          {dates.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {dates.length} days generated — {format(dates[0], 'MMM d, yyyy')} to {format(dates[dates.length - 1], 'MMM d, yyyy')}
            </p>
          )}
          {inventory.length === 0 && (
            <p className="text-xs text-amber-400 mt-2">
              No manpower items found in Inventory. Add items with category "manpower" to populate the dropdown options.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Spreadsheet */}
      {dates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Schedule Spreadsheet</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMonth(m => subMonths(m, 1))}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[110px] text-center">
                {viewMonth ? format(viewMonth, 'MMMM yyyy') : ''}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMonth(m => addMonths(m, 1))}
                disabled={!canGoNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/60 border-b border-border">
                    <th className="sticky left-0 z-10 bg-secondary/80 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[120px] border-r border-border">
                      Row
                    </th>
                    {visibleDates.map(d => {
                      const weekend = isWeekend(d);
                      return (
                        <th
                          key={d.toISOString()}
                          className={`px-1.5 py-2.5 text-center font-medium min-w-[90px] border-r border-border last:border-r-0 ${weekend ? 'text-muted-foreground/50' : 'text-foreground'}`}
                        >
                          <div>{format(d, 'EEE')}</div>
                          <div className="font-bold">{format(d, 'd')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate max-w-[80px]">{row.label}</span>
                          {rows.length > 1 && (
                            <button
                              onClick={() => removeRow(row.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors text-xs ml-auto"
                              title="Remove row"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      {visibleDates.map(d => {
                        const dateStr = format(d, 'yyyy-MM-dd');
                        const key = `${row.id}_${dateStr}`;
                        const weekend = isWeekend(d);
                        return (
                          <td
                            key={dateStr}
                            className={`px-1 py-1 border-r border-border last:border-r-0 ${weekend ? 'bg-secondary/30' : ''}`}
                          >
                            <select
                              value={grid[key] || ''}
                              onChange={e => handleCellChange(row.id, dateStr, e.target.value)}
                              className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all"
                              style={{ minWidth: '80px' }}
                            >
                              <option value="">—</option>
                              {inventory.map(item => (
                                <option key={item.id} value={item.id}>{item.name || item.sku}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={addRow}>
                + Add Row
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}