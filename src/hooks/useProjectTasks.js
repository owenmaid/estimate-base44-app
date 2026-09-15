import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateEstimateSummary, roundMoney } from '@/lib/calculations';
import { createNumericId, getErrorMessage } from '@/lib/reliability';
import { toast } from 'sonner';

export const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

export const calcTask = (t) => {
  const qty = toNum(t.quantity);
  const cost = toNum(t.cost);
  const markup = toNum(t.markup);
  const taxPct = toNum(t.tax_pct);
  const subtotal = roundMoney(qty * cost * (1 + markup / 100));
  const { taxAmount, total } = calculateEstimateSummary(subtotal, taxPct);
  return {
    ...t,
    quantity: t.quantity,
    cost: t.cost,
    markup: t.markup,
    tax_pct: t.tax_pct,
    subtotal,
    tax_amount: taxAmount,
    total,
  };
};

const GROUP_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'category', label: 'Category' },
  { value: 'sub_group_01', label: 'Sub Group 01' },
  { value: 'sub_group_02', label: 'Sub Group 02' },
];

export function useProjectTasks(id) {
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => base44.entities.Project.get(id),
    enabled: !!id,
  });

  const [form, setForm] = useState(null);
  const [taskList, setTaskList] = useState([]);
  const [groupBy, setGroupBy] = useState('none');

  // New item form state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskType, setNewTaskType] = useState('');
  const [newTaskInventoryItem, setNewTaskInventoryItem] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newMarkup, setNewMarkup] = useState('');
  const [newTaxPct, setNewTaxPct] = useState('');

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list('name'),
  });

  const labourItems = inventoryItems.filter(i =>
    i.category?.toUpperCase() === 'DIRECT LABOUR' || i.category?.toUpperCase() === 'INDIRECT LABOUR'
  );

  const inventoryCategories = [...new Set(inventoryItems.map(i => i.category).filter(Boolean))].sort();

  const inventoryByName = useMemo(() => {
    const map = {};
    inventoryItems.forEach(i => { if (i.name) map[i.name.toLowerCase()] = i; });
    return map;
  }, [inventoryItems]);

  const manpowerInventoryNames = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach(i => {
      if (i.item_group?.toUpperCase() === 'MANPOWER GROUP' && i.name) set.add(i.name.toLowerCase());
    });
    return set;
  }, [inventoryItems]);

  const manpowerCategories = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach(i => {
      if (i.item_group?.toUpperCase() === 'MANPOWER GROUP' && i.category) set.add(i.category.toUpperCase());
    });
    return set;
  }, [inventoryItems]);

  const isManpowerTask = (task) => {
    if (manpowerInventoryNames.has((task.name || '').toLowerCase())) return true;
    if (manpowerCategories.has((task.type || '').toUpperCase())) return true;
    const t = (task.type || '').toUpperCase();
    return t === 'DIRECT LABOUR' || t === 'INDIRECT LABOUR';
  };

  const scheduledManpowerLabels = useMemo(() => {
    if (!project) return new Set();
    const rows = project.equipment_rows || [];
    const grid = project.equipment_grid || {};
    const set = new Set();
    rows.forEach(row => {
      const inv = inventoryByName[(row.label || '').toLowerCase()];
      if (!inv || inv.item_group?.toUpperCase() !== 'MANPOWER GROUP') return;
      const hasScheduled = Object.entries(grid).some(([key, val]) =>
        key.startsWith(`${row.id}_`) && val !== '' && val != null && Number(val) !== 0
      );
      if (hasScheduled) set.add((row.label || '').toLowerCase());
    });
    return set;
  }, [project, inventoryByName]);

  const taskGroupKey = (task) => {
    if (groupBy === 'category') return task.type || 'Uncategorized';
    if (groupBy === 'sub_group_01' || groupBy === 'sub_group_02') {
      const inv = inventoryByName[(task.name || '').toLowerCase()];
      return (inv && inv[groupBy]) || 'Uncategorized';
    }
    return 'All';
  };

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups = [];
    const seen = {};
    taskList.forEach(task => {
      const key = taskGroupKey(task);
      if (!seen[key]) { seen[key] = { key, tasks: [] }; groups.push(seen[key]); }
      seen[key].tasks.push(task);
    });
    return groups;
  }, [taskList, groupBy, inventoryByName]);

  const filteredInventoryItems = newTaskType
    ? inventoryItems.filter(i => i.category?.toLowerCase() === newTaskType.toLowerCase())
    : inventoryItems;

  const handleNewTaskTypeChange = (val) => {
    setNewTaskType(val);
    setNewTaskInventoryItem('');
    setNewTaskName('');
  };

  const handleInventoryItemSelect = (itemName) => {
    setNewTaskInventoryItem(itemName);
    setNewTaskName(itemName);
    const item = inventoryItems.find(i => i.name === itemName);
    if (item && item.unit_cost != null) setNewCost(String(item.unit_cost));
  };

  useEffect(() => {
    if (project && !form) {
      setForm({
        name: project.name || '',
        project_number: project.project_number || '',
        client: project.client || '',
        status: project.status || 'planning',
        start_date: project.start_date || project.due || '',
        end_date: project.end_date || '',
        description: project.description || '',
        progress: project.progress || 0,
      });
      setTaskList((project.task_list || []).map(calcTask));
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      toast.success('Project saved!');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to save the project.')),
  });

  const saveTaskList = (list) => {
    const done = list.filter(t => t.done).length;
    const autoProgress = list.length > 0 ? Math.round((done / list.length) * 100) : form.progress;
    const cleanedTaskList = list.map(t => ({
      id: t.id, name: t.name, type: t.type || null, assignee: t.assignee || null, done: !!t.done,
      quantity: toNum(t.quantity), cost: roundMoney(t.cost), markup: toNum(t.markup), tax_pct: toNum(t.tax_pct),
      subtotal: roundMoney(t.subtotal), tax_amount: roundMoney(t.tax_amount), total: roundMoney(t.total),
    }));
    updateMutation.mutate({ ...form, task_list: cleanedTaskList, tasks: cleanedTaskList.length, done, progress: autoProgress });
  };

  const resetNewForm = () => {
    setNewTaskName(''); setNewTaskType(''); setNewTaskInventoryItem(''); setNewAssignee('');
    setNewQty(''); setNewCost(''); setNewMarkup(''); setNewTaxPct('');
  };

  const addTask = () => {
    if (!newTaskName.trim()) { toast.error('Enter a line item name.'); return; }
    if ([newQty, newCost, newMarkup, newTaxPct].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      toast.error('Quantity, cost, markup and tax must be non-negative numbers.'); return;
    }
    const raw = {
      id: createNumericId(), name: newTaskName.trim(), type: newTaskType || null,
      assignee: newAssignee.trim() || null, done: false,
      quantity: newQty, cost: newCost, markup: newMarkup, tax_pct: newTaxPct,
    };
    setTaskList(prev => { const next = [...prev, calcTask(raw)]; saveTaskList(next); return next; });
    resetNewForm();
  };

  const toggleTask = (taskId) => {
    setTaskList(prev => { const next = prev.map(t => t.id === taskId ? { ...t, done: !t.done } : t); saveTaskList(next); return next; });
  };

  const removeTask = (taskId) => {
    setTaskList(prev => { const next = prev.filter(t => t.id !== taskId); saveTaskList(next); return next; });
  };

  const updateTaskField = (taskId, field, value) => {
    setTaskList(prev => {
      const next = prev.map(t => t.id !== taskId ? t : calcTask({ ...t, [field]: value }));
      saveTaskList(next); return next;
    });
  };

  const doneTasks = taskList.filter(t => t.done).length;
  const progress = taskList.length > 0 ? Math.round((doneTasks / taskList.length) * 100) : (form?.progress || 0);

  const newCalc = calcTask({ quantity: newQty, cost: newCost, markup: newMarkup, tax_pct: newTaxPct });

  return {
    project, isLoading, form, setForm, taskList,
    inventoryItems, updateMutation, doneTasks, progress,
    groupBy, setGroupBy, groupedTasks, GROUP_OPTIONS,
    newTaskName, setNewTaskName, newTaskType, newTaskInventoryItem, newAssignee, setNewAssignee,
    newQty, setNewQty, newCost, setNewCost, newMarkup, setNewMarkup, newTaxPct, setNewTaxPct,
    newCalc, addTask, toggleTask, removeTask, updateTaskField,
    isManpowerTask, scheduledManpowerLabels,
    labourItems, inventoryCategories, filteredInventoryItems,
    handleNewTaskTypeChange, handleInventoryItemSelect,
  };
}