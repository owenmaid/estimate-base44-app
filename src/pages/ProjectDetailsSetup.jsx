import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, eachDayOfInterval, parseISO, isWeekend, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { toast } from 'sonner';

export default function ProjectDetailsSetup() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dates, setDates] = useState([]);
  const [grid, setGrid] = useState({}); // { "row_date": skuName }
  const [viewMonth, setViewMonth] = useState(null);
  const [rows, setRows] = useState([{ id: 1, label: 'Row 1' }]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newRowItemId, setNewRowItemId] = useState('');

  const queryClient = useQueryClient();
  
  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-manpower'],
    queryFn: async () => {
      const allItems = await base44.entities.InventoryItem.list();
      return allItems.filter(item => item.category?.toLowerCase() === 'manpower');
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const saveProjectMutation = useMutation({
    mutationFn: async (projectData) => {
      return base44.entities.Project.create(projectData);
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectId(newProject.id);
      toast.success('Project saved successfully');
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return base44.entities.Project.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated successfully');
    },
  });

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }) => {
      return base44.entities.Project.update(id, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project renamed successfully');
      setIsEditingName(false);
    },
  });

  const handleRenameProject = () => {
    if (!selectedProjectId || !editingName.trim()) {
      toast.error('Please enter a project name');
      return;
    }
    renameProjectMutation.mutate({ id: selectedProjectId, name: editingName });
  };

  const handleLoadProject = async (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    setStartDate(project.start_date || '');
    setEndDate(project.end_date || '');
    setGrid(project.schedule_grid || {});
    setRows(project.schedule_rows || [{ id: 1, label: 'Row 1' }]);
    
    const start = parseISO(project.start_date);
    const end = parseISO(project.end_date);
    const allDates = eachDayOfInterval({ start, end });
    setDates(allDates);
    setViewMonth(start);
    setSelectedProjectId(projectId);
  };

  const getNextSampleNumber = () => {
    const sampleProjects = projects.filter(p => p.name?.startsWith('Sample'));
    const numbers = sampleProjects.map(p => {
      const match = p.name.match(/Sample(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `Sample${String(maxNum + 1).padStart(2, '0')}`;
  };

  const handleCreateDates = async () => {
    if (!startDate || !endDate) return;
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    if (end < start) return;
    const allDates = eachDayOfInterval({ start, end });
    setDates(allDates);
    setViewMonth(start);
    setGrid({});

    // Save as new project
    const projectName = getNextSampleNumber();
    const projectData = {
      name: projectName,
      status: 'planning',
      start_date: startDate,
      end_date: endDate,
      description: `Project setup created on ${format(new Date(), 'MMM d, yyyy')}`,
      schedule_grid: {},
      schedule_rows: rows,
    };
    saveProjectMutation.mutate(projectData);
  };

  const handleSaveSchedule = () => {
    if (!selectedProjectId) {
      toast.error('Please load a project first');
      return;
    }
    updateProjectMutation.mutate({
      id: selectedProjectId,
      data: {
        schedule_grid: grid,
        schedule_rows: rows,
      },
    });
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
    if (!newRowItemId) {
      toast.error('Please select a manpower item');
      return;
    }
    const selectedItem = inventory.find(i => i.id === newRowItemId);
    const newId = Math.max(...rows.map(r => r.id), 0) + 1;
    setRows(prev => [...prev, { 
      id: newId, 
      label: selectedItem?.name || selectedItem?.sku || `Row ${newId}`,
      item_id: newRowItemId
    }]);
    setNewRowItemId('');
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

  const sampleProjects = projects.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      {/* Header with Load Project */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Details Setup</h1>
          <p className="text-muted-foreground text-sm mt-1">Define your project timeline and assign manpower to each day.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search or select project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm w-64"
            />
            {search && sampleProjects.length > 0 && (
              <div className="absolute top-full mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-10">
                {sampleProjects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      handleLoadProject(p.id);
                      setSearch('');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-b border-border last:border-b-0 text-sm"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedProjectId && (
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    placeholder="Enter project name"
                    className="w-40 h-9"
                    autoFocus
                  />
                  <Button onClick={handleRenameProject} size="sm" variant="default">
                    Save
                  </Button>
                  <Button onClick={() => setIsEditingName(false)} size="sm" variant="outline">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => {
                    const currentProject = projects.find(p => p.id === selectedProjectId);
                    setEditingName(currentProject?.name || '');
                    setIsEditingName(true);
                  }} size="sm" variant="ghost">
                    Rename
                  </Button>
                  <Button onClick={handleSaveSchedule} variant="outline" size="sm">
                    Save Schedule
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {startDate ? format(parseISO(startDate), 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate ? parseISO(startDate) : undefined}
                    onSelect={date => setStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-44">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {endDate ? format(parseISO(endDate), 'MMM d, yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate ? parseISO(endDate) : undefined}
                    onSelect={date => setEndDate(date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </PopoverContent>
              </Popover>
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
            <CardTitle className="text-base">
              Schedule Spreadsheet
              {selectedProjectId && projects.find(p => p.id === selectedProjectId) && (
                <span className="text-primary ml-2">— {projects.find(p => p.id === selectedProjectId).name}</span>
              )}
            </CardTitle>
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
            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
              <select
                value={newRowItemId}
                onChange={e => setNewRowItemId(e.target.value)}
                className="px-2 py-1 border border-border rounded bg-secondary text-foreground text-sm"
              >
                <option value="">Select manpower...</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name || item.sku}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={addRow} disabled={!newRowItemId}>
                + Add Row
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}