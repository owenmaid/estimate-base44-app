import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, X, SlidersHorizontal, Search, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format, eachDayOfInterval, parseISO, isWeekend } from 'date-fns';
import { toast } from 'sonner';

export default function ProjectDetailsSetup() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dates, setDates] = useState([]);
  const [viewMonth, setViewMonth] = useState(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [equipmentRows, setEquipmentRows] = useState([]);
  const [equipmentGrid, setEquipmentGrid] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newEquipmentItemId, setNewEquipmentItemId] = useState('');

  const queryClient = useQueryClient();
  


  const { data: equipmentInventory = [] } = useQuery({
    queryKey: ['inventory-equipment'],
    queryFn: () => base44.entities.InventoryItem.list(),
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
      console.log('Mutation starting with id:', id, 'data:', data);
      const result = await base44.entities.Project.update(id, data);
      console.log('Mutation result:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('onSuccess callback fired:', data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated successfully');
    },
    onError: (error) => {
      console.error('onError callback fired:', error);
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

  const handleCloseProject = () => {
    setSelectedProjectId('');
    setStartDate('');
    setEndDate('');
    setDates([]);
    setEquipmentRows([]);
    setEquipmentGrid({});
    setEditingName('');
    localStorage.removeItem('activeProjectId');
    toast.success('Project closed');
  };

  useEffect(() => {
    const activeProjectId = localStorage.getItem('activeProjectId');
    if (activeProjectId && projects.length > 0) {
      const project = projects.find(p => p.id === activeProjectId);
      if (project) {
        handleLoadProject(activeProjectId);
      }
    }
  }, [projects.length]);

  const handleLoadProject = async (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    setStartDate(project.start_date || '');
    setEndDate(project.end_date || '');
    setEquipmentGrid(project.equipment_grid || {});
    setEquipmentRows(project.equipment_rows || []);
    
    const start = parseISO(project.start_date);
    const end = parseISO(project.end_date);
    const allDates = eachDayOfInterval({ start, end });
    setDates(allDates);
    setViewMonth(start);
    setDateOffset(0);
    setSelectedProjectId(projectId);
    localStorage.setItem('activeProjectId', projectId);
    isInitialLoad.current = true;
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
    setDateOffset(0);
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
        equipment_grid: equipmentGrid,
        equipment_rows: equipmentRows,
      },
    });
  };

  // Auto-save debounced on grid/rows changes
  const autoSaveTimer = useRef(null);
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (!selectedProjectId) return;
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      base44.entities.Project.update(selectedProjectId, {
        equipment_grid: equipmentGrid,
        equipment_rows: equipmentRows,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      });
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [equipmentGrid, equipmentRows, selectedProjectId]);

  const PAGE_SIZE = 15;
  const visibleDates = dates.slice(dateOffset, dateOffset + PAGE_SIZE);
  const canGoPrevPage = dateOffset > 0;
  const canGoNextPage = dateOffset + PAGE_SIZE < dates.length;

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

  const handleEquipmentDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(equipmentRows);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setEquipmentRows(reordered);
  };



  const sampleProjects = projects.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));

  const [statHolidays, setStatHolidays] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);

  const fetchStatHolidays = async () => {
    if (!startDate || !endDate) return;
    setLoadingHolidays(true);
    const res = await base44.functions.invoke('getCanadaStatHolidays', { startDate, endDate });
    setStatHolidays(res.data?.holidays || []);
    setLoadingHolidays(false);
  };

  // Load Sa_Su_St list from localStorage (managed on Control Page)
  const saSuStList = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('sa_su_st_list');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header with Load Project */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Details Setup</h1>
          <p className="text-muted-foreground text-sm mt-1">Define your project timeline and assign manpower to each day.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/control-page">
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Control Page
            </Button>
          </Link>
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
                  <Button onClick={handleCloseProject} size="sm" variant="ghost">
                    <X className="h-4 w-4" /> Close
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
            {selectedProjectId && (
              <span className="text-primary font-bold">— {projects.find(p => p.id === selectedProjectId)?.name}</span>
            )}
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
            <Button
              variant="outline"
              onClick={fetchStatHolidays}
              disabled={!startDate || !endDate || loadingHolidays}
            >
              {loadingHolidays ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Find Stat Holidays
            </Button>
          </div>
          {dates.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {dates.length} days generated — {format(dates[0], 'MMM d, yyyy')} to {format(dates[dates.length - 1], 'MMM d, yyyy')}
            </p>
          )}

        </CardContent>
      </Card>

      {/* Stat Holidays Results */}
      {statHolidays.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Canadian Stat Holidays
              <span className="text-xs text-muted-foreground font-normal ml-1">
                {format(parseISO(startDate), 'MMM d, yyyy')} – {format(parseISO(endDate), 'MMM d, yyyy')}
              </span>
              <Badge variant="secondary" className="ml-auto">{statHolidays.length} found</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/60 border-b border-border">
                  <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Holiday</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Provinces / Scope</th>
                </tr>
              </thead>
              <tbody>
                {statHolidays.map((h, i) => (
                  <tr key={i} className="border-b border-border hover:bg-secondary/20">
                    <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">
                      {(() => { try { return h.date ? format(parseISO(h.date), 'EEE, MMM d yyyy') : '—'; } catch { return h.date || '—'; } })()}
                    </td>
                    <td className="px-4 py-2 text-foreground">{h.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{h.provinces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

{/* Equipment Spreadsheet + Calculations */}
      {dates.length > 0 && (
        <div className="flex gap-4 items-start">
        <Card className="flex-1 min-w-0">
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Equipment Schedule</CardTitle>
              <span className="text-xs text-muted-foreground">
                {dates.length > 0 && visibleDates.length > 0
                  ? `${format(visibleDates[0], 'MMM d')} – ${format(visibleDates[visibleDates.length - 1], 'MMM d, yyyy')}`
                  : ''}
              </span>
            </div>
            {dates.length > PAGE_SIZE && (
              <div className="flex items-center gap-2 mt-2">
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setDateOffset(o => Math.max(0, o - PAGE_SIZE))} disabled={!canGoPrevPage}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, dates.length - PAGE_SIZE)}
                  step={1}
                  value={dateOffset}
                  onChange={e => setDateOffset(Number(e.target.value))}
                  className="flex-1 accent-primary h-1.5 cursor-pointer"
                />
                <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setDateOffset(o => Math.min(dates.length - PAGE_SIZE, o + PAGE_SIZE))} disabled={!canGoNextPage}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Type row — references Sa_Su_St list from Control Page */}
                  <tr className="bg-secondary/40 border-b border-border" style={{ height: '36px' }}>
                    <th className="sticky left-0 z-10 bg-secondary/60 px-4 py-2 text-left font-semibold text-primary min-w-[100px] border-r border-border text-xs">
                      Type
                    </th>
                    {visibleDates.map((d, i) => (
                      <th key={d.toISOString()} className="px-1 py-1 text-center border-r border-border last:border-r-0 w-[100px]">
                        <select
                          className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 text-xs text-foreground outline-none cursor-pointer"
                          defaultValue=""
                        >
                          <option value="">—</option>
                          {saSuStList.map((item, idx) => (
                            <option key={idx} value={item}>{item}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-secondary/60 border-b border-border" style={{ height: '40px' }}>
                    <th className="sticky left-0 z-10 bg-secondary/100 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[100px] border-r border-border">
                      Equipment
                    </th>
                    {visibleDates.map(d => {
                      const weekend = isWeekend(d);
                      return (
                        <th
                          key={d.toISOString()}
                          className={`px-1.5 py-2.5 text-center font-medium w-[100px] border-r border-border last:border-r-0 ${weekend ? 'text-muted-foreground/50' : 'text-foreground'}`}
                        >
                          <div>{format(d, 'EEE')}</div>
                          <div className="font-bold">{format(d, 'd')}</div>
                        </th>
                        );
                        })}
                        </tr>
                        </thead>
                        <DragDropContext onDragEnd={handleEquipmentDragEnd}>
                        <Droppable droppableId="equipment-rows">
                          {(provided) => (
                            <tbody ref={provided.innerRef} {...provided.droppableProps}>
                        {equipmentRows.map((row, rIdx) => (
                    <Draggable key={String(row.id)} draggableId={String(row.id)} index={rIdx}>
                      {(dragProvided, dragSnapshot) => (
                      <tr
                       ref={dragProvided.innerRef}
                       {...dragProvided.draggableProps}
                       className={`border-b border-border hover:bg-secondary/20 transition-colors ${dragSnapshot.isDragging ? 'bg-secondary/40' : ''}`}
                       style={{ ...dragProvided.draggableProps.style, height: '40px' }}
                      >
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-1">
                          <span {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium text-foreground truncate max-w-[80px]" title={row.label}>{row.label}</span>
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
                              <input
                                 type="number"
                                 min="0"
                                 max="30"
                                 value={equipmentGrid[key] || ''}
                                 onChange={e => handleEquipmentCellChange(row.id, dateStr, e.target.value)}
                                 className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all"
                                 placeholder="—"
                               />
                          </td>
                        );
                      })}
                    </tr>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  </tbody>
                  )}
                  </Droppable>
                  </DragDropContext>
                  <tbody>
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
                  <option key={item.id} value={item.id}>{item.sku || item.name}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={addEquipmentRow} disabled={!newEquipmentItemId}>
                + Add Equipment
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Equipment Calculations Panel */}
         <Card className="w-72 shrink-0 self-start">
           <CardHeader className="pb-2">
             <CardTitle style={{ fontSize: '20.5px' }}>Equipment Calculations</CardTitle>
           </CardHeader>
           <CardContent className="p-0">
             <table className="w-full text-xs border-collapse">
               <thead>
                 <tr className="bg-secondary/60 border-b border-border" style={{ height: '40px' }}>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground">Total</th>
                 </tr>
               </thead>
               <tbody>
                 <tr style={{ height: '45px', backgroundColor: 'rgba(249, 115, 22, 0.2)' }}>
                   <td className="px-4 py-2"></td>
                 </tr>
                 {equipmentRows.map((row, idx) => {
                   const rowTotal = Object.entries(equipmentGrid).reduce((sum, [key, value]) => {
                     return key.startsWith(`${row.id}_`) ? sum + (parseInt(value) || 0) : sum;
                   }, 0);
                   return (
                     <React.Fragment key={row.id}>
                       {idx === 7 && (
                         <tr style={{ height: '45px', backgroundColor: 'rgba(249, 115, 22, 0.2)' }}>
                           <td className="px-4 py-2"></td>
                         </tr>
                       )}
                       <tr className="border-b border-border hover:bg-secondary/20 transition-colors" style={{ height: '40px' }}>
                         <td className="px-4 py-2 text-foreground font-semibold">{rowTotal}</td>
                       </tr>
                     </React.Fragment>
                   );
                 })}
                 <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                   <td className="px-4 py-2 text-foreground">
                     {Object.values(equipmentGrid).reduce((sum, val) => sum + (parseInt(val) || 0), 0)}
                   </td>
                 </tr>
               </tbody>
             </table>
           </CardContent>
         </Card>
        </div>
      )}
    </div>
  );
}