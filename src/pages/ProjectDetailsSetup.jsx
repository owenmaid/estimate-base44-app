import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, X, SlidersHorizontal, Search, Loader2, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { format, eachDayOfInterval, parseISO, isWeekend } from 'date-fns';
import { toast } from 'sonner';
import { calculateCostComponents, getShiftHours } from '@/lib/calculations';
import { getErrorMessage } from '@/lib/reliability';
import { ProjectCostSummary, StatHolidaySummary } from '@/components/project-details/ProjectDetailsSummaries';

export default function ProjectDetailsSetup() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dates, setDates] = useState([]);
  const [viewMonth, setViewMonth] = useState(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [equipmentRows, setEquipmentRows] = useState([]);
  const [equipmentGrid, setEquipmentGrid] = useState({});
  const [typeGrid, setTypeGrid] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectNumber, setProjectNumber] = useState('');
  const [projectSite, setProjectSite] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [projectPlant, setProjectPlant] = useState('');
  const [projectPhone, setProjectPhone] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [newEquipmentItemId, setNewEquipmentItemId] = useState('');
  const [newEquipmentCategory, setNewEquipmentCategory] = useState('');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentResults, setShowEquipmentResults] = useState(false);
  const [equipmentFilter, setEquipmentFilter] = useState(null);
  const equipmentSearchRef = useRef(null);
  const [statHolidays, setStatHolidays] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [expandedSchedule, setExpandedSchedule] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const searchRef = useRef(null);
  const [convertingEstimate, setConvertingEstimate] = useState(false);
  const tableScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const isSyncingScroll = useRef(false);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

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
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to save the project.')),
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
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to rename the project.')),
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
    setProjectNumber('');
    setProjectSite('');
    setProjectLocation('');
    setProjectPlant('');
    setProjectPhone('');
    setProjectNotes('');
    setStartDate('');
    setEndDate('');
    setDates([]);
    setEquipmentRows([]);
    setEquipmentGrid({});
    setTypeGrid({});
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
    
    setProjectNumber(project.project_number || '');
    setProjectSite(project.site || '');
    setProjectLocation(project.location || '');
    setProjectPlant(project.plant || '');
    setProjectPhone(project.phone || '');
    setProjectNotes(project.notes || '');
    setStartDate(project.start_date || '');
    setEndDate(project.end_date || '');
    const rawGrid = project.equipment_grid;
    const parsedGrid = (typeof rawGrid === 'string') ? {} : (rawGrid || {});
    setEquipmentGrid(parsedGrid);
    setEquipmentRows(project.equipment_rows || []);

    if (project.start_date && project.end_date) {
      const start = parseISO(project.start_date);
      const end = parseISO(project.end_date);
      const allDates = eachDayOfInterval({ start, end });
      setDates(allDates);
      const mergedTypeGrid = buildTypeGridFromDates(allDates, project.type_grid || {}, statHolidays);
      setTypeGrid(mergedTypeGrid);
      setViewMonth(start);
    } else {
      setDates([]);
      setTypeGrid({});
    }
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

  const buildTypeGridFromDates = (allDates, existingTypeGrid = {}, holidays = []) => {
    const grid = { ...existingTypeGrid };
    allDates.forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (grid[dateStr] === undefined) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 6) {
          grid[dateStr] = 'Sa';
        } else if (dayOfWeek === 0) {
          grid[dateStr] = 'Su';
        } else {
          const isHoliday = holidays.some(h => {
            try { return format(parseISO(h.date), 'yyyy-MM-dd') === dateStr; }
            catch { return false; }
          });
          grid[dateStr] = isHoliday ? 'St' : 'N';
        }
      }
    });
    return grid;
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
    const newTypeGrid = buildTypeGridFromDates(allDates, {}, statHolidays);
    setTypeGrid(newTypeGrid);

    // Save as new project
    const projectName = getNextSampleNumber();
    const projectData = {
      name: projectName,
      project_number: '',
      status: 'planning',
      start_date: startDate,
      end_date: endDate,
      description: `Project setup created on ${format(new Date(), 'MMM d, yyyy')}`,
      equipment_grid: {},
      equipment_rows: [],
    };
    saveProjectMutation.mutate(projectData);
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
      const gridToSave = (typeof equipmentGrid === 'object' && equipmentGrid !== null) ? equipmentGrid : {};
      base44.entities.Project.update(selectedProjectId, {
        project_number: projectNumber,
        site: projectSite,
        location: projectLocation,
        plant: projectPlant,
        phone: projectPhone,
        notes: projectNotes,
        equipment_grid: gridToSave,
        equipment_rows: equipmentRows,
        type_grid: typeGrid,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      });
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [equipmentGrid, equipmentRows, typeGrid, selectedProjectId, projectNumber, projectSite, projectLocation, projectPlant]);

  const PAGE_SIZE = 15;
  const visibleDates = dates.slice(dateOffset, dateOffset + PAGE_SIZE);
  const canGoPrevPage = dateOffset > 0;
  const canGoNextPage = dateOffset + PAGE_SIZE < dates.length;

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const update = () => setTableScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dates, equipmentRows]);

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
    setNewEquipmentCategory('');
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
    return filteredEquipmentRows.reduce((sum, row) => {
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

  const equipmentSearchResults = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return [];
    return equipmentInventory
      .filter(i =>
        (i.sku || '').toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [equipmentSearch, equipmentInventory]);

  const selectEquipmentFilter = (item) => {
    setEquipmentFilter(item.id);
    setEquipmentSearch('');
    setShowEquipmentResults(false);
  };

  const filteredEquipmentRows = useMemo(() => {
    if (!equipmentFilter) return equipmentRows;
    return equipmentRows.filter(r => String(r.item_id) === String(equipmentFilter));
  }, [equipmentRows, equipmentFilter]);

  const PROVINCE_PATTERNS = [
    { code: 'AB', names: ['alberta'] },
    { code: 'BC', names: ['british columbia', 'b.c.'] },
    { code: 'MB', names: ['manitoba'] },
    { code: 'NB', names: ['new brunswick'] },
    { code: 'NL', names: ['newfoundland', 'newfoundland and labrador'] },
    { code: 'NS', names: ['nova scotia'] },
    { code: 'NT', names: ['northwest territories'] },
    { code: 'NU', names: ['nunavut'] },
    { code: 'ON', names: ['ontario'] },
    { code: 'PE', names: ['prince edward island', 'p.e.i.'] },
    { code: 'QC', names: ['quebec', 'québec'] },
    { code: 'SK', names: ['saskatchewan'] },
    { code: 'YT', names: ['yukon'] },
  ];

  const detectProvince = (loc) => {
    const s = (loc || '').trim().toLowerCase();
    if (!s) return null;
    for (const p of PROVINCE_PATTERNS) {
      if (new RegExp(`\\b${p.code.toLowerCase()}\\b`).test(s)) return p.code;
      for (const name of p.names) {
        if (s.includes(name)) return p.code;
      }
    }
    return null;
  };

  const fetchStatHolidays = async () => {
    if (!startDate || !endDate) return;
    const province = detectProvince(projectLocation);
    if (!province) {
      toast.info('Could not detect a Canadian province in the Location field. Please include a province (e.g. "Edmonton, AB" or "Toronto, Ontario").');
      return;
    }
    setLoadingHolidays(true);
    const res = await base44.functions.invoke('getCanadaStatHolidays', { startDate, endDate, province });
    const holidays = res.data?.holidays || [];
    setStatHolidays(holidays);
    setLoadingHolidays(false);
    if (dates.length > 0) {
      // Automatically apply Auto-fill with the fetched holidays so the user doesn't have to do it manually
      const newTypeGrid = { ...typeGrid };
      dates.forEach(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 6) {
          newTypeGrid[dateStr] = 'Sa';
        } else if (dayOfWeek === 0) {
          newTypeGrid[dateStr] = 'Su';
        } else {
          const isHoliday = holidays.some(h => {
            try { return format(parseISO(h.date), 'yyyy-MM-dd') === dateStr; }
            catch { return false; }
          });
          newTypeGrid[dateStr] = isHoliday ? 'St' : 'N';
        }
      });
      setTypeGrid(newTypeGrid);
    }
  };

  // Load Sa_Su_St list from localStorage (managed on Control Page)
  const saSuStList = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('sa_su_st_list');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  // Map inventory items by id/name for lookup (reg, OT values, and item_group)
  const inventoryValueMap = useMemo(() => {
    const byId = {};
    const byName = {};
    equipmentInventory.forEach(item => {
      const regVal = item.reg_value === '' || item.reg_value === undefined ? null : Number(item.reg_value);
      const otVal = item.ot_value === '' || item.ot_value === undefined ? null : Number(item.ot_value);
      const entry = { reg: isNaN(regVal) ? null : regVal, ot: isNaN(otVal) ? null : otVal, item_group: item.item_group };
      if (item.id) byId[item.id] = entry;
      if (item.name) byName[item.name.toLowerCase()] = entry;
      if (item.sku) byName[item.sku.toLowerCase()] = entry;
    });
    return { byId, byName };
  }, [equipmentInventory]);

  // Calculate Col 4: sum of (N days × 8) + (Sa days × 4)
  const rowCol4 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      let nSum = 0, saSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        const type = typeGrid[dateStr];
        if (type === 'N') nSum += num;
        else if (type === 'Sa') saSum += num;
      });
      result[row.id] = (nSum * 8) + (saSum * 4);
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Calculate Col 5: N days × (Shift - 8)
  const rowCol5 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const overtimeHrs = Math.max(0, shiftHrs - 8);
      let nSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'N') nSum += num;
      });
      result[row.id] = nSum * overtimeHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Calculate Col 6: Sa days × max(Shift - 4, 0)
  const rowCol6 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      const multiplier = Math.max(shiftHrs - 4, 0);
      let saSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'Sa') saSum += num;
      });
      result[row.id] = saSum * multiplier;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Calculate Col 7: Su days × Shift
  const rowCol7 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      let suSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'Su') suSum += num;
      });
      result[row.id] = suSum * shiftHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Calculate Col 8: St days × Shift
  const rowCol8 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const shiftHrs = label.includes('pre-work') || label.includes('post-work') ? 10 : 12;
      let stSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'St') stSum += num;
      });
      result[row.id] = stSum * shiftHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Calculate Col1 (total sum per row) — mirrors CalculationEngine
  const rowSums = useMemo(() => {
    const sums = {};
    equipmentRows.forEach(row => {
      let sum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (key.startsWith(`${row.id}_`)) {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) sum += num;
        }
      });
      sums[row.id] = sum;
    });
    return sums;
  }, [equipmentRows, equipmentGrid]);

  // Calculate all cost components through the shared calculation engine.
  const calculateRowCosts = useMemo(() => {
    const costs = {};
    equipmentRows.forEach(row => {
      const inventoryEntry = inventoryValueMap.byId[row.item_id]
        ?? inventoryValueMap.byName[row.label?.toLowerCase()]
        ?? null;
      const isManpower = inventoryEntry?.item_group === 'Manpower Group';
      const result = calculateCostComponents({
        isManpower,
        shiftHours: getShiftHours(row.label),
        col1: rowSums[row.id] || 0,
        col4: rowCol4[row.id] || 0,
        col5: rowCol5[row.id] || 0,
        col6: rowCol6[row.id] || 0,
        col7: rowCol7[row.id] || 0,
        col8: rowCol8[row.id] || 0,
        regRate: inventoryEntry?.reg,
        otRate: inventoryEntry?.ot,
      });
      costs[row.id] = {
        regCost: result.regularCost,
        otCost: result.overtimeCost,
        specialCost: result.specialCost,
      };
    });
    return costs;
  }, [equipmentRows, rowSums, rowCol4, rowCol5, rowCol6, rowCol7, rowCol8, inventoryValueMap]);

  const buildCalculationGrid = () => {
    const calculationGrid = {};
    equipmentRows.forEach(row => {
      const inventoryEntry = inventoryValueMap.byId[row.item_id]
        ?? inventoryValueMap.byName[row.label?.toLowerCase()]
        ?? null;
      const isManpower = inventoryEntry?.item_group === 'Manpower Group';
      const costs = calculateCostComponents({
        isManpower,
        shiftHours: getShiftHours(row.label),
        col1: rowSums[row.id] || 0,
        col4: rowCol4[row.id] || 0,
        col5: rowCol5[row.id] || 0,
        col6: rowCol6[row.id] || 0,
        col7: rowCol7[row.id] || 0,
        col8: rowCol8[row.id] || 0,
        regRate: inventoryEntry?.reg,
        otRate: inventoryEntry?.ot,
      });
      calculationGrid[`${row.id}_col11`] = costs.regularCost;
      calculationGrid[`${row.id}_col12`] = costs.overtimeCost;
      calculationGrid[`${row.id}_col13`] = costs.specialCost;
      calculationGrid[`${row.id}_col14`] = costs.totalCost;
    });
    return calculationGrid;
  };

  const handleSaveSchedule = () => {
    if (!selectedProjectId) {
      toast.error('Please load a project first');
      return;
    }
    const gridToSave = (typeof equipmentGrid === 'object' && equipmentGrid !== null) ? equipmentGrid : {};
    updateProjectMutation.mutate({
      id: selectedProjectId,
      data: {
        project_number: projectNumber,
        site: projectSite,
        location: projectLocation,
        plant: projectPlant,
        phone: projectPhone,
        notes: projectNotes,
        equipment_grid: gridToSave,
        equipment_rows: equipmentRows,
        type_grid: typeGrid,
      },
    });
  };

  const handleConvertToEstimate = async () => {
    if (!selectedProjectId) {
      toast.error('Please load a project first');
      return;
    }
    setConvertingEstimate(true);
    try {
      const currentProject = projects.find(p => p.id === selectedProjectId);

      // Fetch the "NEW ESTIMATE TEMPLATE 100" template
      const templates = await base44.entities.EstimateTemplate.filter({ name: 'NEW ESTIMATE TEMPLATE 100' });
      const template = templates && templates.length > 0 ? templates[0] : null;
      if (!template) {
        toast.error('Template "NEW ESTIMATE TEMPLATE 100" not found. Please create it first.');
        setConvertingEstimate(false);
        return;
      }

      const siteParts = [currentProject?.site, currentProject?.location, currentProject?.plant].filter(Boolean);
      const preload = {
        _isTemplatePreload: true,
        project_number: currentProject?.project_number || '',
        project_name: currentProject?.name || '',
        client_name: currentProject?.client || '',
        client_address: siteParts.join(' / '),
        client_phone: currentProject?.phone || '',
        notes: currentProject?.notes || '',
        start_date: currentProject?.start_date || '',
        end_date: currentProject?.end_date || '',
        line_items: template.line_items || [],
      };

      sessionStorage.setItem('estimateToLoad', JSON.stringify(preload));
      window.location.href = '/create-estimate-panel';
    } catch (err) {
      toast.error('Failed to load template');
      setConvertingEstimate(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header with Load Project */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Details Setup</h1>
          <p className="text-muted-foreground text-sm mt-1">Define your project timeline and assign manpower to each day.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/control-page">
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Control Page
            </Button>
          </Link>
          {dates.length > 0 && (
            <div className="relative" ref={equipmentSearchRef}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search SKU / description..."
                  value={equipmentSearch}
                  onChange={e => { setEquipmentSearch(e.target.value); setShowEquipmentResults(true); }}
                  onFocus={() => setShowEquipmentResults(true)}
                  onBlur={() => setTimeout(() => setShowEquipmentResults(false), 150)}
                  className="pl-7 pr-3 py-2 border border-border rounded-md bg-white/25 text-foreground text-sm w-full sm:w-56 outline-none focus:border-primary"
                />
                {equipmentFilter && (
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setEquipmentFilter(null)}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] leading-none shadow"
                    title="Clear filter"
                  >
                    ×
                  </button>
                )}
              </div>
              {showEquipmentResults && equipmentSearch.trim() && (
                <div className="absolute top-full mt-1 w-72 bg-card border border-border rounded-md shadow-lg z-20 max-h-72 overflow-y-auto">
                  {equipmentSearchResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No matches found</div>
                  ) : (
                    equipmentSearchResults.map(item => (
                      <button
                        key={item.id}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectEquipmentFilter(item)}
                        className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-b border-border last:border-b-0 text-sm"
                      >
                        <div className="font-medium text-foreground truncate">{item.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {item.sku && <span className="font-mono">{item.sku}</span>}
                          {item.category && <span className="truncate">{item.category}</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              placeholder="Search or select project..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowProjectDropdown(true); }}
              onFocus={() => setShowProjectDropdown(true)}
              onBlur={() => setTimeout(() => setShowProjectDropdown(false), 150)}
              className="px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm w-full sm:w-64"
            />
            {showProjectDropdown && sampleProjects.length > 0 && (
              <div className="absolute top-full mt-1 w-full sm:w-64 bg-card border border-border rounded-md shadow-lg z-10 max-h-72 overflow-y-auto">
                {sampleProjects.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      handleLoadProject(p.id);
                      setSearch('');
                      setShowProjectDropdown(false);
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
                  <Button onClick={handleSaveSchedule} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-orange-500">
                    Save Schedule
                  </Button>
                  <Button
                    onClick={handleConvertToEstimate}
                    size="sm"
                    disabled={convertingEstimate}
                    className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-red-600"
                  >
                    {convertingEstimate ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Convert to Estimate
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
              <div className="flex items-center gap-2 ml-auto">
                <Input
                  value={projectNumber}
                  onChange={e => {
                    setProjectNumber(e.target.value);
                    base44.entities.Project.update(selectedProjectId, { project_number: e.target.value, site: projectSite, location: projectLocation, plant: projectPlant });
                  }}
                  placeholder="Project #"
                  className="w-32 h-8"
                />
                <Input
                  value={projects.find(p => p.id === selectedProjectId)?.name || ''}
                  onChange={e => {
                    const newName = e.target.value;
                    base44.entities.Project.update(selectedProjectId, { name: newName });
                  }}
                  placeholder="Project Name"
                  className="w-48 h-8"
                />
              </div>
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
              className="bg-white/25"
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

          {/* Site / Location / Plant / Phone / Notes fields */}
          <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-border">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Site</label>
              <Input
                value={projectSite}
                onChange={e => setProjectSite(e.target.value)}
                placeholder="Site name…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input
                value={projectLocation}
                onChange={e => setProjectLocation(e.target.value)}
                placeholder="Location…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Plant</label>
              <Input
                value={projectPlant}
                onChange={e => setProjectPlant(e.target.value)}
                placeholder="Plant…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input
                value={projectPhone}
                onChange={e => setProjectPhone(e.target.value)}
                placeholder="Phone…"
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-48">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input
                value={projectNotes}
                onChange={e => setProjectNotes(e.target.value)}
                placeholder="Notes…"
                className="w-full h-9"
              />
            </div>
          </div>

        </CardContent>
      </Card>

      <StatHolidaySummary holidays={statHolidays} startDate={startDate} endDate={endDate} />
      <ProjectCostSummary
        selectedProjectId={selectedProjectId}
        equipmentRows={equipmentRows}
        equipmentInventory={equipmentInventory}
        rowCosts={calculateRowCosts}
      />

      {/* Equipment Spreadsheet + Calculations */}
      {dates.length > 0 && (
        <div className={expandedSchedule ? "fixed inset-0 z-50 bg-background p-4 overflow-auto flex gap-4 items-start" : "flex gap-4 items-start"}>
        <Card className="flex-1 min-w-0">
          <CardHeader className={`pb-2${expandedSchedule ? ' sticky top-0 z-30 bg-card border-b border-border' : ''}`}>
            <div className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Equipment Schedule</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/25"
                  onClick={() => setExpandedSchedule(e => !e)}
                >
                  {expandedSchedule ? 'Collapse' : 'Expand Equip Schedule'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="bg-white/25"
                  onClick={() => {
                    const newTypeGrid = { ...typeGrid };
                    dates.forEach(d => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const dayOfWeek = d.getDay();
                      let type = 'N'; // default to weekday
                      
                      if (dayOfWeek === 6) {
                        type = 'Sa'; // Saturday
                      } else if (dayOfWeek === 0) {
                        type = 'Su'; // Sunday
                      } else {
                        // Check if it's a stat holiday
                        const isHoliday = statHolidays.some(h => {
                          try {
                            const hDate = format(parseISO(h.date), 'yyyy-MM-dd');
                            return hDate === dateStr;
                          } catch {
                            return false;
                          }
                        });
                        if (isHoliday) type = 'St';
                      }
                      newTypeGrid[dateStr] = type;
                    });
                    setTypeGrid(newTypeGrid);
                  }}
                >
                  Auto-fill Types
                </Button>
              </div>
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
            <div
              ref={tableScrollRef}
              className="overflow-x-auto"
              onScroll={e => {
                if (isSyncingScroll.current) return;
                isSyncingScroll.current = true;
                if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = e.target.scrollLeft;
                isSyncingScroll.current = false;
              }}
            >
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Type row — references Sa_Su_St list from Control Page */}
                  <tr className="bg-secondary/40 border-b border-border" style={{ height: '36px', ...(expandedSchedule ? { position: 'sticky', top: 0, zIndex: 20 } : {}) }}>
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold text-primary border-r border-border text-xs min-w-[50px] w-[50px]" style={expandedSchedule ? { backgroundColor: 'hsl(var(--card))' } : {}}>
                    </th>
                    <th className="sticky bg-card px-2 py-2 text-left font-semibold text-primary border-r border-border text-xs min-w-[90px] w-[90px]" style={{ left: '50px', ...(expandedSchedule ? { backgroundColor: 'hsl(var(--card))' } : {}) }}>
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-primary min-w-[260px] border-r border-border text-xs" style={expandedSchedule ? { backgroundColor: 'hsl(var(--secondary) / 0.6)' } : {}}>
                     Type
                    </th>
                    {visibleDates.map((d) => {
                      const dateStr = format(d, 'yyyy-MM-dd');
                      const typeVal = typeGrid[dateStr] !== undefined ? typeGrid[dateStr] : '';
                      return (
                        <th key={d.toISOString()} className="px-1 py-1 text-center border-r border-border last:border-r-0 w-[100px]">
                          <select
                            className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 text-xs text-foreground outline-none cursor-pointer appearance-none"
                            style={{ backgroundImage: 'none' }}
                            value={typeVal}
                            onChange={e => setTypeGrid(prev => ({ ...prev, [dateStr]: e.target.value }))}
                          >
                            <option value=""></option>
                            <option value="N">N</option>
                            <option value="Sa">Sa</option>
                            <option value="Su">Su</option>
                            <option value="St">St</option>
                            {saSuStList.map((item, idx) => (
                              <option key={idx} value={item}>{item}</option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="bg-secondary/60 border-b border-border" style={{ height: '40px', ...(expandedSchedule ? { position: 'sticky', top: '36px', zIndex: 20 } : {}) }}>
                    <th className="sticky left-0 z-10 bg-secondary/100 px-2 py-2.5 text-left font-semibold text-muted-foreground border-r border-border min-w-[50px] w-[50px]">
                     Line_ID
                   </th>
                    <th className="sticky bg-secondary/100 px-2 py-2.5 text-left font-semibold text-muted-foreground border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}>
                     Item_ID
                   </th>
                   <th className="bg-secondary/100 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[260px] border-r border-border">
                    Services
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
                        {filteredEquipmentRows.map((row, rIdx) => (
                    <Draggable key={String(row.id)} draggableId={String(row.id)} index={rIdx}>
                      {(dragProvided, dragSnapshot) => (
                      <tr
                       ref={dragProvided.innerRef}
                       {...dragProvided.draggableProps}
                       className={`border-b border-border hover:bg-secondary/20 transition-colors ${dragSnapshot.isDragging ? 'bg-secondary/40' : ''}`}
                       style={{ ...dragProvided.draggableProps.style, height: '40px' }}
                      >
                      <td className="sticky left-0 z-10 bg-card px-2 py-2 border-r border-border min-w-[50px] w-[50px] text-center">
                       <span className="font-mono text-xs text-muted-foreground">{rIdx + 1}</span>
                      </td>
                      <td className="sticky bg-card px-2 py-2 border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}>
                       <span className="font-mono text-xs text-primary truncate block max-w-[80px]" title={row.item_id || '—'}>
                         {row.item_id ? row.item_id.slice(-8) : <span className="opacity-30">—</span>}
                       </span>
                      </td>
                      <td className="bg-card px-4 py-2 border-r border-border">
                        <div className="flex items-center gap-1">
                          <span {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                            <GripVertical className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-medium text-foreground truncate max-w-[220px]" title={row.label}>{row.label}</span>
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
                                 max="999"
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
                    <td className="sticky left-0 z-10 bg-secondary/40 px-2 py-2 border-r border-border min-w-[50px] w-[50px]"></td>
                    <td className="sticky bg-secondary/40 px-2 py-2 border-r border-border min-w-[90px] w-[90px]" style={{ left: '50px' }}></td>
                    <td className="bg-secondary/40 px-4 py-2 border-r border-border text-muted-foreground min-w-[260px]">
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
            {/* Mirror scrollbar — syncs with the table above */}
            <div
              ref={bottomScrollRef}
              className="overflow-x-auto border-t border-border"
              style={{ height: '12px' }}
              onScroll={e => {
                if (isSyncingScroll.current) return;
                isSyncingScroll.current = true;
                if (tableScrollRef.current) tableScrollRef.current.scrollLeft = e.target.scrollLeft;
                isSyncingScroll.current = false;
              }}
            >
              <div style={{ width: tableScrollWidth || '100%', height: '1px' }} />
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center gap-2">
              <select
                value={newEquipmentCategory}
                onChange={e => { setNewEquipmentCategory(e.target.value); setNewEquipmentItemId(''); }}
                className="px-2 py-1 border border-border rounded bg-white/25 text-primary text-sm"
              >
                <option value="">Select category...</option>
                {[...new Set(equipmentInventory.map(i => i.category).filter(Boolean))].sort().map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={newEquipmentItemId}
                onChange={e => setNewEquipmentItemId(e.target.value)}
                className="px-2 py-1 border border-border rounded bg-white/25 text-primary text-sm"
                disabled={!newEquipmentCategory}
              >
                <option value="">Select item...</option>
                {equipmentInventory
                  .filter(i => i.category === newEquipmentCategory)
                  .map(item => (
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
         <Card className="w-96 shrink-0 self-start">
           <CardHeader className="pb-2">
             <CardTitle style={{ fontSize: '20.5px' }}>Equipment Calculations</CardTitle>
           </CardHeader>
           <CardContent className="p-0">
             <table className="w-full text-xs border-collapse">
               <thead>
                 <tr className="bg-secondary/60 border-b border-border" style={{ height: '36px' }}>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">Reg Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">OT Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground border-r border-border">Spec Cost</th>
                   <th className="px-4 py-2.5 font-semibold text-muted-foreground">Total</th>
                 </tr>
               </thead>
               <tbody>
                 <tr style={{ height: '34px' }}>
                   <td colSpan={4} className="px-0 py-0"></td>
                 </tr>
                 <tr style={{ height: '36px', backgroundColor: 'rgba(249, 115, 22, 0.2)' }}>
                   <td colSpan={4} className="px-4 py-2 text-center font-bold text-foreground leading-tight" style={{ fontSize: '18px' }}>
                     <div>Calculation</div>
                     <div>Engine</div>
                   </td>
                 </tr>
                 {equipmentRows.map((row, idx) => {
                   const rowTotal = Object.entries(equipmentGrid).reduce((sum, [key, value]) => {
                     return key.startsWith(`${row.id}_`) ? sum + (parseInt(value) || 0) : sum;
                   }, 0);
                   const costs = calculateRowCosts[row.id] || {};
                   return (
                     <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors" style={{ height: '40px' }}>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.regCost != null && costs.regCost > 0 ? costs.regCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.otCost != null && costs.otCost > 0 ? costs.otCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold border-r border-border text-right">{costs.specialCost != null && costs.specialCost > 0 ? costs.specialCost.toFixed(2) : '—'}</td>
                         <td className="px-4 py-2 text-foreground font-semibold text-right">{(costs.regCost || 0) + (costs.otCost || 0) + (costs.specialCost || 0) > 0 ? ((costs.regCost || 0) + (costs.otCost || 0) + (costs.specialCost || 0)).toFixed(2) : '—'}</td>
                         </tr>
                         );
                         })}
                 <tr className="bg-secondary/40 border-t-2 border-border font-semibold" style={{ height: '36px' }}>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.regCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.otCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground border-r border-border text-right">
                     {equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.specialCost || 0), 0).toFixed(2)}
                   </td>
                   <td className="px-4 py-2 text-foreground text-right">
                     {(equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.regCost || 0), 0) + 
                       equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.otCost || 0), 0) + 
                       equipmentRows.reduce((sum, row) => sum + (calculateRowCosts[row.id]?.specialCost || 0), 0)).toFixed(2)}
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