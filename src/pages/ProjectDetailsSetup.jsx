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
  const [viewMonth, setViewMonth] = useState(null);
  const [manpowerRows, setManpowerRows] = useState([]);
  const [manpowerGrid, setManpowerGrid] = useState({});
  const [equipmentRows, setEquipmentRows] = useState([]);
  const [equipmentGrid, setEquipmentGrid] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newManpowerItemId, setNewManpowerItemId] = useState('');
  const [newEquipmentItemId, setNewEquipmentItemId] = useState('');

  const queryClient = useQueryClient();
  


  const { data: manpowerInventory = [] } = useQuery({
    queryKey: ['inventory-manpower'],
    queryFn: async () => {
      const allItems = await base44.entities.InventoryItem.list();
      return allItems.filter(item => item.category?.toLowerCase() === 'manpower');
    },
  });

  const { data: equipmentInventory = [] } = useQuery({
    queryKey: ['inventory-equipment'],
    queryFn: async () => {
      const allItems = await base44.entities.InventoryItem.list();
      return allItems.filter(item => item.category?.toLowerCase() === 'equipment');
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
    onError: (error) => {
      console.error('Update failed:', error);
      toast.error('Failed to save schedule');
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
    setManpowerGrid(project.manpower_grid || {});
    setManpowerRows(project.manpower_rows || []);
    setEquipmentGrid(project.equipment_grid || {});
    setEquipmentRows(project.equipment_rows || []);
    
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
    setManpowerGrid({});
    setManpowerRows([]);
    setEquipmentGrid({});
    setEquipmentRows([]);

    // Save as new project
    const projectName = getNextSampleNumber();
    const projectData = {
      name: projectName,
      status: 'planning',
      start_date: startDate,
      end_date: endDate,
      description: `Project setup created on ${format(new Date(), 'MMM d, yyyy')}`,
      manpower_grid: {},
      manpower_rows: [],
      equipment_grid: {},
      equipment_rows: [],
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
        manpower_grid: manpowerGrid,
        manpower_rows: manpowerRows,
        equipment_grid: equipmentGrid,
        equipment_rows: equipmentRows,
      },
    });
  };

  const visibleDates = viewMonth
    ? dates.filter(d => isSameMonth(d, viewMonth))
    : dates;

  const totalMonths = viewMonth ? Math.ceil(dates.length / 30) : 0;

  const addManpowerRow = () => {
    if (!newManpowerItemId) {
      toast.error('Please select a manpower item');
      return;
    }
    const selectedItem = manpowerInventory.find(i => i.id === newManpowerItemId);
    const newId = Math.max(...manpowerRows.map(r => r.id), 0) + 1;
    setManpowerRows(prev => [...prev, { 
      id: newId, 
      label: selectedItem?.name || selectedItem?.sku || `Manpower ${newId}`,
      item_id: newManpowerItemId
    }]);
    setNewManpowerItemId('');
  };

  const removeManpowerRow = (id) => {
    setManpowerRows(prev => prev.filter(r => r.id !== id));
    setManpowerGrid(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${id}_`)) delete next[k];
      });
      return next;
    });
  };

  const handleManpowerCellChange = (rowId, dateStr, value) => {
    setManpowerGrid(prev => ({
      ...prev,
      [`${rowId}_${dateStr}`]: value,
    }));
  };

  const calculateManpowerDayTotal = (dateStr) => {
    return manpowerRows.reduce((sum, row) => {
      const val = manpowerGrid[`${row.id}_${dateStr}`];
      return sum + (val ? parseInt(val) : 0);
    }, 0);
  };

  const addEquipmentRow = () => {
    if (!newEquipmentItemId) {
      toast.error('Please select an equipment item');
      return;
    }
    const selectedItem = equipmentInventory.find(i => i.id === newEquipmentItemId);
    const newId = Math.max(...equipmentRows.map(r => r.id), 0) + 1;
    setEquipmentRows(prev => [...prev, { 
      id: newId, 
      label: selectedItem?.name || selectedItem?.sku || `Equipment ${newId}`,
      item_id: newEquipmentItemId
    }]);
    setNewEquipmentItemId('');
  };

  const removeEquipmentRow = (id) => {
    setEquipmentRows(prev => prev.filter(r => r.id !== id));
    setEquipmentGrid(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${id}_`)) delete next[k];
      });
      return next;
    });
  };

  const handleEquipmentCellChange = (rowId, dateStr, value) => {
    setEquipmentGrid(prev => ({
      ...prev,
      [`${rowId}_${dateStr}`]: value,
    }));
  };



  const calculateEquipmentDayTotal = (dateStr) => {
    return equipmentRows.reduce((sum, row) => {
      const val = equipmentGrid[`${row.id}_${dateStr}`];
      return sum + (val ? parseInt(val) : 0);
    }, 0);
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

        </CardContent>
      </Card>

      {/* Manpower Spreadsheet */}
      {dates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              Manpower Schedule
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
              <span className="text-sm font-medium min-w-[90px] text-center">
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
                    <th className="sticky left-0 z-10 bg-secondary/80 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[90px] border-r border-border">
                      Manpower
                    </th>
                    {visibleDates.map(d => {
                      const weekend = isWeekend(d);
                      return (
                        <th
                          key={d.toISOString()}
                          className={`px-1.5 py-2.5 text-center font-medium w-[90px] border-r border-border last:border-r-0 ${weekend ? 'text-muted-foreground/50' : 'text-foreground'}`}
                        >
                          <div>{format(d, 'EEE')}</div>
                          <div className="font-bold">{format(d, 'd')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {manpowerRows.map((row, rIdx) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate max-w-[80px]">{row.label}</span>
                          {manpowerRows.length > 0 && (
                            <button
                              onClick={() => removeManpowerRow(row.id)}
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
                            className={`px-1 py-1 border-r border-border last:border-r-0 w-[90px] ${weekend ? 'bg-secondary/30' : ''}`}
                          >
                            <select
                              value={manpowerGrid[key] || ''}
                              onChange={e => handleManpowerCellChange(row.id, dateStr, e.target.value)}
                              className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all appearance-none bg-no-repeat"
                              style={{ backgroundImage: 'none', paddingRight: '0.25rem' }}
                            >
                              <option value="">—</option>
                              {Array.from({ length: 31 }, (_, i) => (
                                <option key={i} value={i}>{i}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                    <td className="sticky left-0 z-10 bg-secondary/40 px-4 py-2 border-r border-border text-muted-foreground">
                      Daily Total
                    </td>
                    {visibleDates.map(d => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const weekend = isWeekend(d);
                      return (
                        <td
                          key={dateStr}
                          className={`px-1.5 py-2 text-center border-r border-border last:border-r-0 text-foreground w-[90px] ${weekend ? 'bg-secondary/30' : ''}`}
                        >
                          {calculateManpowerDayTotal(dateStr)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
              <select
                value={newManpowerItemId}
                onChange={e => setNewManpowerItemId(e.target.value)}
                className="px-2 py-1 border border-border rounded bg-secondary text-foreground text-sm"
              >
                <option value="">Select manpower...</option>
                {manpowerInventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name || item.sku}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={addManpowerRow} disabled={!newManpowerItemId}>
                + Add Row
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipment Spreadsheet */}
      {dates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              Equipment Schedule
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
              <span className="text-sm font-medium min-w-[90px] text-center">
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
                    <th className="sticky left-0 z-10 bg-secondary/80 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[90px] border-r border-border">
                      Equipment
                    </th>
                    {visibleDates.map(d => {
                      const weekend = isWeekend(d);
                      return (
                        <th
                          key={d.toISOString()}
                          className={`px-1.5 py-2.5 text-center font-medium w-[90px] border-r border-border last:border-r-0 ${weekend ? 'text-muted-foreground/50' : 'text-foreground'}`}
                        >
                          <div>{format(d, 'EEE')}</div>
                          <div className="font-bold">{format(d, 'd')}</div>
                        </th>
                        );
                        })}
                        </tr>
                        </thead>
                        <tbody>
                        {equipmentRows.map((row, rIdx) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate max-w-[80px]">{row.label}</span>
                          {equipmentRows.length > 0 && (
                            <button
                              onClick={() => removeEquipmentRow(row.id)}
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
                            className={`px-1 py-1 border-r border-border last:border-r-0 w-[200px] ${weekend ? 'bg-secondary/30' : ''}`}
                            >
                              <select
                                value={equipmentGrid[key] || ''}
                                onChange={e => handleEquipmentCellChange(row.id, dateStr, e.target.value)}
                                className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all appearance-none bg-no-repeat"
                              style={{ backgroundImage: 'none', paddingRight: '0.25rem' }}
                            >
                              <option value="">—</option>
                              {Array.from({ length: 31 }, (_, i) => (
                                <option key={i} value={i}>{i}</option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                    <td className="sticky left-0 z-10 bg-secondary/40 px-4 py-2 border-r border-border text-muted-foreground">
                      Daily Total
                    </td>
                    {visibleDates.map(d => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const weekend = isWeekend(d);
                      return (
                        <td
                          key={dateStr}
                          className={`px-1.5 py-2 text-center border-r border-border last:border-r-0 text-foreground w-[200px] ${weekend ? 'bg-secondary/30' : ''}`}
                        >
                          {calculateEquipmentDayTotal(dateStr)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
              <select
                value={newEquipmentItemId}
                onChange={e => setNewEquipmentItemId(e.target.value)}
                className="px-2 py-1 border border-border rounded bg-secondary text-foreground text-sm"
              >
                <option value="">Select equipment...</option>
                {equipmentInventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name || item.sku}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={addEquipmentRow} disabled={!newEquipmentItemId}>
                + Add Equipment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}