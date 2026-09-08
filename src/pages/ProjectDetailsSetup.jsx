import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { calculateCostComponents, getShiftHours } from '@/lib/calculations';
import { getErrorMessage } from '@/lib/reliability';
import ProjectDetailsSetupView from '@/components/project-details/ProjectDetailsSetupView';

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

  const fetchStatHolidays = async () => {
    if (!startDate || !endDate) return;
    setLoadingHolidays(true);
    const res = await base44.functions.invoke('getCanadaStatHolidays', { startDate, endDate });
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

  return <ProjectDetailsSetupView model={{ navigate, equipmentInventory, projects, saveProjectMutation, updateProjectMutation, renameProjectMutation, startDate, setStartDate, endDate, setEndDate, dates, setDates, viewMonth, setViewMonth, dateOffset, setDateOffset, equipmentRows, setEquipmentRows, equipmentGrid, setEquipmentGrid, typeGrid, setTypeGrid, selectedProjectId, setSelectedProjectId, search, setSearch, editingName, setEditingName, isEditingName, setIsEditingName, projectNumber, setProjectNumber, projectSite, setProjectSite, projectLocation, setProjectLocation, projectPlant, setProjectPlant, projectPhone, setProjectPhone, projectNotes, setProjectNotes, newEquipmentItemId, setNewEquipmentItemId, newEquipmentCategory, setNewEquipmentCategory, statHolidays, setStatHolidays, loadingHolidays, setLoadingHolidays, expandedSchedule, setExpandedSchedule, showProjectDropdown, setShowProjectDropdown, searchRef, convertingEstimate, setConvertingEstimate, tableScrollRef, bottomScrollRef, isSyncingScroll, tableScrollWidth, setTableScrollWidth, queryClient, handleRenameProject, handleCloseProject, handleLoadProject, getNextSampleNumber, buildTypeGridFromDates, handleCreateDates, autoSaveTimer, isInitialLoad, PAGE_SIZE, visibleDates, canGoPrevPage, canGoNextPage, addEquipmentRow, removeEquipmentRow, handleEquipmentCellChange, calculateEquipmentDayTotal, handleEquipmentDragEnd, sampleProjects, fetchStatHolidays, saSuStList, inventoryValueMap, rowCol4, rowCol5, rowCol6, rowCol7, rowCol8, rowSums, calculateRowCosts, buildCalculationGrid, handleSaveSchedule, handleConvertToEstimate }} />;
}

