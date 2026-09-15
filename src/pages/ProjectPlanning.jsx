import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Trash2, Plus, CheckCircle2, Circle, Maximize2, X, Lock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { calculateEstimateSummary, calculateScheduleRow, roundMoney } from '@/lib/calculations';
import { createNumericId, getErrorMessage } from '@/lib/reliability';

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const calcTask = (t) => {
  const qty = toNum(t.quantity);
  const cost = toNum(t.cost);
  const markup = toNum(t.markup);
  const taxPct = toNum(t.tax_pct);
  const subtotal = roundMoney(qty * cost * (1 + markup / 100));
  const { taxAmount, total } = calculateEstimateSummary(subtotal, taxPct);
  return {
    ...t,
    // preserve raw input strings so inputs don't fight the user while typing
    quantity: t.quantity,
    cost: t.cost,
    markup: t.markup,
    tax_pct: t.tax_pct,
    subtotal,
    tax_amount: taxAmount,
    total,
  };
};

const numInput = (val, onChange) => (
  <input
    type="number"
    className="w-full bg-transparent text-xs text-right outline-none border-b border-transparent focus:border-border px-0.5"
    value={val ?? ''}
    onChange={onChange}
    min="0"
    step="any"
  />
);

export default function ProjectPlanning() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => base44.entities.Project.get(id),
  });

  const [form, setForm] = useState(null);
  const [taskList, setTaskList] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [groupBy, setGroupBy] = useState('none');
  const [viewFilter, setViewFilter] = useState('manpower_excl_conventional');

  // New item form state
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskType, setNewTaskType] = useState('');
  const [newTaskInventoryItem, setNewTaskInventoryItem] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newMarkup, setNewMarkup] = useState('');
  const [newTaxPct, setNewTaxPct] = useState('');

  const { data: taskTypes = [] } = useQuery({
    queryKey: ['taskTypes'],
    queryFn: () => base44.entities.TaskType.list('name'),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list('name'),
  });

  const labourItems = inventoryItems.filter(i =>
    i.category?.toUpperCase() === 'DIRECT LABOUR' || i.category?.toUpperCase() === 'INDIRECT LABOUR'
  );

  const inventoryCategories = [...new Set(inventoryItems.map(i => i.category).filter(Boolean))].sort();

  // Lookup inventory item by name (case-insensitive) to resolve sub-groups for grouping
  const inventoryByName = useMemo(() => {
    const map = {};
    inventoryItems.forEach(i => {
      if (i.name) map[i.name.toLowerCase()] = i;
    });
    return map;
  }, [inventoryItems]);

  const GROUP_OPTIONS = [
    { value: 'none', label: 'No grouping' },
    { value: 'category', label: 'Category' },
    { value: 'sub_group_01', label: 'Sub Group 01' },
    { value: 'sub_group_02', label: 'Sub Group 02' },
  ];

  const VIEW_OPTIONS = [
    { value: 'all', label: 'All items' },
    { value: 'manpower_excl_conventional', label: 'Manpower (excl. Conventional)' },
  ];

  // Set of inventory item names belonging to the Manpower Group (reliable manpower detection)
  const manpowerInventoryNames = useMemo(() => {
    const set = new Set();
    inventoryItems.forEach(i => {
      if (i.item_group?.toUpperCase() === 'MANPOWER GROUP' && i.name) {
        set.add(i.name.toLowerCase());
      }
    });
    return set;
  }, [inventoryItems]);

  const isManpowerTask = (task) => {
    // Primary: match by inventory item group lookup
    if (manpowerInventoryNames.has((task.name || '').toLowerCase())) return true;
    // Fallback: by task type category
    const t = (task.type || '').toUpperCase();
    return t === 'DIRECT LABOUR' || t === 'INDIRECT LABOUR';
  };

  // Tasks filtered by the selected view (e.g. manpower excluding CONVENTIONAL)
  const viewTasks = useMemo(() => {
    if (viewFilter === 'all') return taskList;
    if (viewFilter === 'manpower_excl_conventional') {
      return taskList.filter(task => {
        if (!isManpowerTask(task)) return false;
        const inv = inventoryByName[(task.name || '').toLowerCase()];
        const sg = (inv && inv.sub_group_01 || '').trim().toUpperCase();
        return sg !== 'CONVENTIONAL';
      });
    }
    return taskList;
  }, [taskList, viewFilter, inventoryByName, manpowerInventoryNames]);

  const taskGroupKey = (task) => {
    if (groupBy === 'category') return task.type || 'Uncategorized';
    if (groupBy === 'sub_group_01' || groupBy === 'sub_group_02') {
      const inv = inventoryByName[(task.name || '').toLowerCase()];
      return (inv && inv[groupBy]) || 'Uncategorized';
    }
    return 'All';
  };

  // Group tasks when a grouping is selected (preserves order of first appearance)
  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups = [];
    const seen = {};
    viewTasks.forEach(task => {
      const key = taskGroupKey(task);
      if (!seen[key]) {
        seen[key] = { key, tasks: [] };
        groups.push(seen[key]);
      }
      seen[key].tasks.push(task);
    });
    return groups;
  }, [viewTasks, groupBy, inventoryByName]);

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
    if (item) {
      if (item.unit_cost != null) setNewCost(String(item.unit_cost));
    }
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
      toast.success('Project saved!');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to save the project.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Project.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      navigate('/projects');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to delete the project.')),
  });

  const handleLoad = async () => {
    setIsLoadingData(true);
    const fresh = await base44.entities.Project.get(id);
    if (fresh && fresh.task_list?.length > 0) {
      setTaskList(fresh.task_list.map(t => calcTask({
        ...t,
        quantity: t.quantity != null ? parseFloat(t.quantity) : 0,
        cost: t.cost != null ? parseFloat(t.cost) : 0,
        markup: t.markup != null ? parseFloat(t.markup) : 0,
        tax_pct: t.tax_pct != null ? parseFloat(t.tax_pct) : 0,
      })));
      toast.success('Line items loaded from database');
    } else {
      toast.info('No line items found in database for this project');
    }
    setIsLoadingData(false);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Enter a project name before saving.');
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      toast.error('End date cannot be earlier than start date.');
      return;
    }
    const done = taskList.filter(t => t.done).length;
    const autoProgress = taskList.length > 0 ? Math.round((done / taskList.length) * 100) : form.progress;
    // Clean task list: ensure all numeric fields are proper numbers before saving
    const cleanedTaskList = taskList.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type || null,
      assignee: t.assignee || null,
      done: !!t.done,
      quantity: toNum(t.quantity),
      cost: roundMoney(t.cost),
      markup: toNum(t.markup),
      tax_pct: toNum(t.tax_pct),
      subtotal: roundMoney(t.subtotal),
      tax_amount: roundMoney(t.tax_amount),
      total: roundMoney(t.total),
    }));
    updateMutation.mutate({
      ...form,
      task_list: cleanedTaskList,
      tasks: cleanedTaskList.length,
      done,
      progress: autoProgress,
    });
  };

  const resetNewForm = () => {
    setNewTaskName('');
    setNewTaskType('');
    setNewTaskInventoryItem('');
    setNewAssignee('');
    setNewQty('');
    setNewCost('');
    setNewMarkup('');
    setNewTaxPct('');
  };

  const addTask = () => {
    if (!newTaskName.trim()) {
      toast.error('Enter a line item name.');
      return;
    }
    if ([newQty, newCost, newMarkup, newTaxPct].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      toast.error('Quantity, cost, markup and tax must be non-negative numbers.');
      return;
    }
    const raw = {
      id: createNumericId(),
      name: newTaskName.trim(),
      type: newTaskType || null,
      assignee: newAssignee.trim() || null,
      done: false,
      quantity: newQty,
      cost: newCost,
      markup: newMarkup,
      tax_pct: newTaxPct,
    };
    setTaskList(prev => {
      const next = [...prev, calcTask(raw)];
      saveTaskList(next);
      return next;
    });
    resetNewForm();
  };

  const saveTaskList = (list) => {
    const done = list.filter(t => t.done).length;
    const autoProgress = list.length > 0 ? Math.round((done / list.length) * 100) : form.progress;
    const cleanedTaskList = list.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type || null,
      assignee: t.assignee || null,
      done: !!t.done,
      quantity: toNum(t.quantity),
      cost: roundMoney(t.cost),
      markup: toNum(t.markup),
      tax_pct: toNum(t.tax_pct),
      subtotal: roundMoney(t.subtotal),
      tax_amount: roundMoney(t.tax_amount),
      total: roundMoney(t.total),
    }));
    updateMutation.mutate({ ...form, task_list: cleanedTaskList, tasks: cleanedTaskList.length, done, progress: autoProgress });
  };

  const toggleTask = (taskId) => {
    setTaskList(prev => {
      const next = prev.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
      saveTaskList(next);
      return next;
    });
  };

  const removeTask = (taskId) => {
    setTaskList(prev => {
      const next = prev.filter(t => t.id !== taskId);
      saveTaskList(next);
      return next;
    });
  };

  const updateTaskField = (taskId, field, value) => {
    setTaskList(prev => {
      const next = prev.map(t => {
        if (t.id !== taskId) return t;
        return calcTask({ ...t, [field]: value });
      });
      saveTaskList(next);
      return next;
    });
  };

  // ── Equipment rows from Project Details Setup (read-only) ──────────────────
  const equipmentSetupRows = useMemo(() => {
    if (!project) return [];
    const rows = project.equipment_rows || [];
    const eGrid = project.equipment_grid || {};
    const tGrid = project.type_grid || {};

    return rows.map(row => {
      const result = calculateScheduleRow(row, eGrid, tGrid, inventoryItems);
      if (!result) return null;
      return {
        id: row.id,
        label: row.label,
        category: result.inventoryItem.category || '—',
        isManpower: result.isManpower,
        col1: result.col1,
        regCost: result.regularCost,
        otCost: result.overtimeCost,
        specialCost: result.specialCost,
        rowTotal: result.totalCost,
      };
    }).filter(row => row && (row.col1 > 0 || row.rowTotal > 0));
  }, [project, inventoryItems]);

  if (isLoading || !form) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const doneTasks = taskList.filter(t => t.done).length;
  const progress = taskList.length > 0 ? Math.round((doneTasks / taskList.length) * 100) : form.progress;

  // New row computed values
  const newRaw = { quantity: newQty, cost: newCost, markup: newMarkup, tax_pct: newTaxPct };
  const newCalc = calcTask(newRaw);

  const fmt = (n) => (n != null && !isNaN(n)) ? parseFloat(n).toFixed(2) : '—';

  const renderTaskRow = (task) => (
    <tr key={task.id} className="group border-b border-border/30 hover:bg-muted/20 transition-colors">
      <td className="py-2 pr-1">
        <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
          {task.done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
        </button>
      </td>
      <td className="py-1 pr-2 whitespace-nowrap">
        {task.type && <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{task.type}</span>}
      </td>
      <td className="py-1 pr-2 text-xs text-muted-foreground whitespace-nowrap">{task.name}</td>
      <td className="py-1 pr-2 whitespace-nowrap">
        <input
          className={`w-full bg-transparent text-xs outline-none border-b border-transparent focus:border-border px-0.5 ${task.done ? 'line-through text-muted-foreground' : ''}`}
          value={task.name}
          onChange={e => updateTaskField(task.id, 'name', e.target.value)}
        />
      </td>
      <td className="py-1 pr-2">
        <div className="flex items-center gap-1.5">
          <Select value={task.assignee || ''} onValueChange={v => updateTaskField(task.id, 'assignee', v)}>
            <SelectTrigger className="h-7 text-xs px-1.5 flex-1"><SelectValue placeholder="Assignee..." /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {labourItems.map(item => (
                <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isManpowerTask(task) && (
            task.assignee
              ? <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 whitespace-nowrap">Applied</span>
              : <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 whitespace-nowrap">No resource</span>
          )}
        </div>
      </td>
      <td className="py-1 pr-1">{numInput(task.quantity ?? '', e => updateTaskField(task.id, 'quantity', e.target.value))}</td>
      <td className="py-1 pr-1">{numInput(task.cost ?? '', e => updateTaskField(task.id, 'cost', e.target.value))}</td>
      <td className="py-1 pr-1">{numInput(task.markup ?? '', e => updateTaskField(task.id, 'markup', e.target.value))}</td>
      <td className="py-1 pr-1">{numInput(task.tax_pct ?? '', e => updateTaskField(task.id, 'tax_pct', e.target.value))}</td>
      <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(task.tax_amount)}</td>
      <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(task.subtotal)}</td>
      <td className="py-1 text-right font-medium">{fmt(task.total)}</td>
      <td className="py-1 pl-1">
        <button onClick={() => removeTask(task.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Project Planning</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{form.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsExpanded(true)}>
            <Maximize2 className="h-4 w-4 mr-1.5" /> Update Manpower Resources
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{form.name}" and all its line items, schedules, and equipment data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Progress summary */}
      <Card>
        <CardContent className="pt-5 pb-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span className="text-muted-foreground">{doneTasks}/{taskList.length} line items · {progress}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Project Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Project Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Project Number</Label>
              <Input className="bg-white/25" value={form.project_number} onChange={e => setForm(p => ({ ...p, project_number: e.target.value }))} placeholder="e.g. PR27001" />
            </div>
            <div>
              <Label>Client</Label>
              <Input value={form.client} onChange={e => setForm(p => ({ ...p, client: e.target.value }))} placeholder="Client name" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
            </div>
            <div>
              <Label>Manual Progress % (used when no line items)</Label>
              <Input
                type="number" min="0" max="100"
                value={form.progress}
                onChange={e => setForm(p => ({ ...p, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
              />
            </div>
            <div>
              <Label>Description / Notes</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Project notes, goals, or scope..."
                className="min-h-[100px]"
              />
            </div>

          </CardContent>
        </Card>

        {/* Read-only: Equipment rows from Project Details Setup */}
        {equipmentSetupRows.length > 0 && (
          <Card className="lg:col-span-8 lg:col-start-3">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Project Details Setup — Line Items</CardTitle>
                <span className="text-xs text-muted-foreground ml-1">(read-only)</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-left pb-2 pr-2">Row Label</th>
                      <th className="text-left pb-2 pr-2">Category</th>
                      <th className="text-left pb-2 pr-2">Group</th>
                      <th className="text-right pb-2 pr-2">Count</th>
                      <th className="text-right pb-2 pr-2">Reg Cost</th>
                      <th className="text-right pb-2 pr-2">OT Cost</th>
                      <th className="text-right pb-2 pr-2">Special Cost</th>
                      <th className="text-right pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentSetupRows.map((row, idx) => (
                      <tr key={row.id} className={`border-b border-border/30 ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="py-1.5 pr-2 font-medium text-foreground">{row.label}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{row.category}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${row.isManpower ? 'bg-blue-500/15 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                            {row.isManpower ? 'Manpower' : 'Equipment'}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right text-muted-foreground">{row.col1}</td>
                        <td className="py-1.5 pr-2 text-right">{row.regCost != null && row.regCost > 0 ? `$${row.regCost.toFixed(2)}` : '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{row.otCost != null && row.otCost > 0 ? `$${row.otCost.toFixed(2)}` : '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{row.specialCost != null && row.specialCost > 0 ? `$${row.specialCost.toFixed(2)}` : '—'}</td>
                        <td className="py-1.5 text-right font-semibold text-primary">{row.rowTotal > 0 ? `$${row.rowTotal.toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    {(() => {
                      const totals = equipmentSetupRows.reduce((acc, r) => ({
                        reg: acc.reg + (r.regCost || 0),
                        ot: acc.ot + (r.otCost || 0),
                        spec: acc.spec + (r.specialCost || 0),
                        total: acc.total + (r.rowTotal || 0),
                      }), { reg: 0, ot: 0, spec: 0, total: 0 });
                      return (
                        <tr className="border-t-2 border-border font-semibold">
                          <td colSpan={4} className="pt-2 pr-2 text-right text-muted-foreground">Totals</td>
                          <td className="pt-2 pr-2 text-right">${totals.reg.toFixed(2)}</td>
                          <td className="pt-2 pr-2 text-right">${totals.ot.toFixed(2)}</td>
                          <td className="pt-2 pr-2 text-right">${totals.spec.toFixed(2)}</td>
                          <td className="pt-2 text-right font-bold text-primary text-sm">${totals.total.toFixed(2)}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expanded Item List Modal */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-xl font-bold">Project List</h2>
              <p className="text-sm text-muted-foreground">{form.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={`text-xs border ${STATUS_STYLES[form.status]}`}>
                {doneTasks}/{taskList.length} line items done
              </Badge>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">View</span>
                <Select value={viewFilter} onValueChange={setViewFilter}>
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEW_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Group by</span>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="w-6 pb-2"></th>
                  <th className="text-left pb-2 pr-2 min-w-[140px] whitespace-nowrap">Type</th>
                  <th className="text-left pb-2 pr-2 min-w-[200px] whitespace-nowrap">Item</th>
                  <th className="text-left pb-2 pr-2 min-w-[260px] whitespace-nowrap">Description</th>
                  <th className="text-left pb-2 pr-2 w-44">Assignee</th>
                  <th className="text-right pb-2 pr-1 w-16">Qty</th>
                  <th className="text-right pb-2 pr-1 w-20">Cost</th>
                  <th className="text-right pb-2 pr-1 w-16">Markup %</th>
                  <th className="text-right pb-2 pr-1 w-16">Tax %</th>
                  <th className="text-right pb-2 pr-1 w-20">Tax Amt</th>
                  <th className="text-right pb-2 pr-1 w-20">Subtotal</th>
                  <th className="text-right pb-2 w-20">Total</th>
                  <th className="w-6 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {/* New item input row */}
                <tr className="border-b border-border/50 bg-muted/20">
                  <td className="py-2 pr-1"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <Select value={newTaskType} onValueChange={handleNewTaskTypeChange}>
                      <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue placeholder="Type..." /></SelectTrigger>
                      <SelectContent>
                        {inventoryCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <Select value={newTaskInventoryItem} onValueChange={handleInventoryItemSelect} disabled={!newTaskType}>
                      <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue placeholder={newTaskType ? 'Select item...' : '—'} /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {filteredInventoryItems.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-muted-foreground text-center">No items</div>
                        ) : filteredInventoryItems.map(item => (
                          <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    <input
                      className="w-full bg-transparent text-xs outline-none border-b border-transparent focus:border-border px-0.5"
                      placeholder="Description..."
                      value={newTaskName}
                      onChange={e => setNewTaskName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addTask()}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <Select value={newAssignee} onValueChange={setNewAssignee}>
                      <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue placeholder="Assignee..." /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {labourItems.map(item => (
                          <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1 pr-1">{numInput(newQty, e => setNewQty(e.target.value))}</td>
                  <td className="py-1 pr-1">{numInput(newCost, e => setNewCost(e.target.value))}</td>
                  <td className="py-1 pr-1">{numInput(newMarkup, e => setNewMarkup(e.target.value))}</td>
                  <td className="py-1 pr-1">{numInput(newTaxPct, e => setNewTaxPct(e.target.value))}</td>
                  <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(newCalc.tax_amount)}</td>
                  <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(newCalc.subtotal)}</td>
                  <td className="py-1 text-right font-medium">{fmt(newCalc.total)}</td>
                  <td className="py-1 pl-1">
                    <Button size="icon" className="h-6 w-6" onClick={addTask}><Plus className="h-3 w-3" /></Button>
                  </td>
                </tr>

                {viewTasks.length === 0 && taskList.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                      No line items yet. Fill in the row above and click +
                    </td>
                  </tr>
                )}
                {viewTasks.length === 0 && taskList.length > 0 && (
                  <tr>
                    <td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                      No items match the selected view.
                    </td>
                  </tr>
                )}
                {groupedTasks
                  ? groupedTasks.map(group => (
                      <React.Fragment key={group.key}>
                        <tr className="bg-primary/10 border-b border-border">
                          <td colSpan={14} className="py-2 px-3 text-xs font-semibold text-primary">
                            {group.key} <span className="text-muted-foreground font-normal ml-1">({group.tasks.length})</span>
                          </td>
                        </tr>
                        {group.tasks.map(task => renderTaskRow(task))}
                      </React.Fragment>
                    ))
                  : viewTasks.map(task => renderTaskRow(task))
                }

                {viewTasks.length > 0 && (() => {
                  const totals = viewTasks.reduce((acc, t) => ({
                    subtotal: acc.subtotal + (t.subtotal || 0),
                    tax_amount: acc.tax_amount + (t.tax_amount || 0),
                    total: acc.total + (t.total || 0),
                  }), { subtotal: 0, tax_amount: 0, total: 0 });
                  return (
                    <tr className="border-t-2 border-border font-semibold text-xs">
                      <td colSpan={9} className="pt-3 pr-1 text-right text-muted-foreground">Totals</td>
                      <td className="pt-3 pr-1 text-right">{totals.tax_amount.toFixed(2)}</td>
                      <td className="pt-3 pr-1 text-right">{totals.subtotal.toFixed(2)}</td>
                      <td className="pt-3 text-right font-bold text-primary text-sm">{totals.total.toFixed(2)}</td>
                      <td></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}