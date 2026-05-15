import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Save, Trash2, Plus, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

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
  const subtotal = qty * cost * (1 + markup / 100);
  const taxAmount = subtotal * (taxPct / 100);
  const total = subtotal + taxAmount;
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
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Project.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      navigate('/projects');
    },
  });

  const handleLoad = async () => {
    setIsLoadingData(true);
    const fresh = await base44.entities.Project.get(id);
    console.log('Loaded from DB:', JSON.stringify(fresh?.task_list));
    if (fresh && fresh.task_list?.length > 0) {
      setTaskList(fresh.task_list.map(t => {
        const qty = t.quantity != null ? parseFloat(t.quantity) : 0;
        const cost = t.cost != null ? parseFloat(t.cost) : 0;
        const markup = t.markup != null ? parseFloat(t.markup) : 0;
        const taxPct = t.tax_pct != null ? parseFloat(t.tax_pct) : 0;
        const subtotal = qty * cost * (1 + markup / 100);
        const taxAmount = subtotal * (taxPct / 100);
        const total = subtotal + taxAmount;
        return { ...t, quantity: qty, cost, markup, tax_pct: taxPct, subtotal, tax_amount: taxAmount, total };
      }));
      toast.success('Line items loaded from database');
    } else {
      toast.info('No line items found in database for this project');
    }
    setIsLoadingData(false);
  };

  const handleSave = () => {
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
      cost: toNum(t.cost),
      markup: toNum(t.markup),
      tax_pct: toNum(t.tax_pct),
      subtotal: toNum(t.subtotal),
      tax_amount: toNum(t.tax_amount),
      total: toNum(t.total),
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
    if (!newTaskName.trim()) return;
    const raw = {
      id: Date.now(),
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
      cost: toNum(t.cost),
      markup: toNum(t.markup),
      tax_pct: toNum(t.tax_pct),
      subtotal: toNum(t.subtotal),
      tax_amount: toNum(t.tax_amount),
      total: toNum(t.total),
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

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
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
          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
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
        <Card className="lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Project Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
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

        {/* Item List */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Item List</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoad}
                  disabled={isLoadingData}
                >
                  {isLoadingData ? (
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 border-2 border-border border-t-primary rounded-full animate-spin" /> Loading...</span>
                  ) : (
                    'Load from Database'
                  )}
                </Button>
                <Badge className={`text-xs border ${STATUS_STYLES[form.status]}`}>
                  {doneTasks}/{taskList.length} line items done
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="w-6 pb-2"></th>
                    <th className="text-left pb-2 pr-2 w-28">Type</th>
                    <th className="text-left pb-2 pr-2 w-40">Item</th>
                    <th className="text-left pb-2 pr-2 flex-1">Description</th>
                    <th className="text-left pb-2 pr-2 w-28">Assignee</th>
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
                    <td className="py-2 pr-1">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </td>
                    <td className="py-1 pr-2">
                      <Select value={newTaskType} onValueChange={handleNewTaskTypeChange}>
                        <SelectTrigger className="h-7 text-xs px-1.5">
                          <SelectValue placeholder="Type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {inventoryCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 pr-2">
                      <Select value={newTaskInventoryItem} onValueChange={handleInventoryItemSelect} disabled={!newTaskType}>
                        <SelectTrigger className="h-7 text-xs px-1.5">
                          <SelectValue placeholder={newTaskType ? 'Select item...' : '—'} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {filteredInventoryItems.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-muted-foreground text-center">No items</div>
                          ) : filteredInventoryItems.map(item => (
                            <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 pr-2">
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
                        <SelectTrigger className="h-7 text-xs px-1.5">
                          <SelectValue placeholder="Assignee..." />
                        </SelectTrigger>
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
                      <Button size="icon" className="h-6 w-6" onClick={addTask}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>

                  {/* Existing items */}
                  {taskList.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                        No line items yet. Fill in the row above and click +
                      </td>
                    </tr>
                  )}
                  {taskList.map(task => (
                    <tr key={task.id} className="group border-b border-border/30 hover:bg-muted/20 transition-colors">
                      <td className="py-2 pr-1">
                        <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
                          {task.done
                            ? <CheckCircle2 className="h-4 w-4 text-primary" />
                            : <Circle className="h-4 w-4 text-muted-foreground" />
                          }
                        </button>
                      </td>
                      <td className="py-1 pr-2">
                        {task.type && (
                          <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{task.type}</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-xs text-muted-foreground">{task.name}</td>
                      <td className="py-1 pr-2">
                        <input
                          className={`w-full bg-transparent text-xs outline-none border-b border-transparent focus:border-border px-0.5 ${task.done ? 'line-through text-muted-foreground' : ''}`}
                          value={task.name}
                          onChange={e => updateTaskField(task.id, 'name', e.target.value)}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Select value={task.assignee || ''} onValueChange={v => updateTaskField(task.id, 'assignee', v)}>
                          <SelectTrigger className="h-7 text-xs px-1.5">
                            <SelectValue placeholder="Assignee..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {labourItems.map(item => (
                              <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1 pr-1">
                        {numInput(task.quantity ?? '', e => updateTaskField(task.id, 'quantity', e.target.value))}
                      </td>
                      <td className="py-1 pr-1">
                        {numInput(task.cost ?? '', e => updateTaskField(task.id, 'cost', e.target.value))}
                      </td>
                      <td className="py-1 pr-1">
                        {numInput(task.markup ?? '', e => updateTaskField(task.id, 'markup', e.target.value))}
                      </td>
                      <td className="py-1 pr-1">
                        {numInput(task.tax_pct ?? '', e => updateTaskField(task.id, 'tax_pct', e.target.value))}
                      </td>
                      <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(task.tax_amount)}</td>
                      <td className="py-1 pr-1 text-right text-muted-foreground">{fmt(task.subtotal)}</td>
                      <td className="py-1 text-right font-medium">{fmt(task.total)}</td>
                      <td className="py-1 pl-1">
                        <button
                          onClick={() => removeTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Totals row */}
                  {taskList.length > 0 && (() => {
                    const totals = taskList.reduce((acc, t) => ({
                      subtotal: acc.subtotal + (t.subtotal || 0),
                      tax_amount: acc.tax_amount + (t.tax_amount || 0),
                      total: acc.total + (t.total || 0),
                    }), { subtotal: 0, tax_amount: 0, total: 0 });
                    return (
                      <tr className="border-t-2 border-border font-semibold text-xs">
                        <td colSpan={8} className="pt-3 pr-1 text-right text-muted-foreground">Totals</td>
                        <td className="pt-3 pr-1 text-right">{totals.tax_amount.toFixed(2)}</td>
                        <td className="pt-3 pr-1 text-right">{totals.subtotal.toFixed(2)}</td>
                        <td className="pt-3 text-right text-primary">{totals.total.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}