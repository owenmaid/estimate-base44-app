import React, { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, CheckCircle2, Circle, Trash2, Lock } from 'lucide-react';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { calculateScheduleRow } from '@/lib/calculations';

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
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

const fmt = (n) => (n != null && !isNaN(n)) ? parseFloat(n).toFixed(2) : '—';

export default function ProjectList() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');

  const {
    isLoading, form, taskList, groupBy, setGroupBy, groupedTasks, GROUP_OPTIONS,
    toggleTask, removeTask, updateTaskField, assignResource,
    isManpowerTask, scheduledManpowerLabels,
    labourItems,
    doneTasks, progress,
    project, inventoryItems,
  } = useProjectTasks(id);

  const equipmentSetupRows = useMemo(() => {
    if (!project) return [];
    const rows = project.equipment_rows || [];
    const eGrid = project.equipment_grid || {};
    const tGrid = project.type_grid || {};
    return rows.map(row => {
      const result = calculateScheduleRow(row, eGrid, tGrid, inventoryItems);
      if (!result) return null;
      const matchingTask = taskList.find(t => (t.name || '').toLowerCase() === (row.label || '').toLowerCase());
      const assignee = matchingTask?.assignee || '';
      return {
        id: row.id, label: row.label, category: result.inventoryItem.category || '—',
        isManpower: result.isManpower, col1: result.col1, regCost: result.regularCost,
        otCost: result.overtimeCost, specialCost: result.specialCost, rowTotal: result.totalCost,
        inventoryItem: result.inventoryItem, assignee, applied: !!assignee,
      };
    }).filter(row => row && row.isManpower && (row.col1 > 0 || row.rowTotal > 0));
  }, [project, inventoryItems, taskList]);

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
      <td className="py-1 pr-2 whitespace-nowrap">
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
            scheduledManpowerLabels.has((task.name || '').toLowerCase())
              ? <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 whitespace-nowrap">Scheduled</span>
              : <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 whitespace-nowrap">Not scheduled</span>
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

  if (isLoading || !form) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/project-planning?id=${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Project List</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{form.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`text-xs border ${STATUS_STYLES[form.status]}`}>
            {doneTasks}/{taskList.length} line items done
          </Badge>
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
        </div>
      </div>

      {/* Scheduled items from Project Details Setup */}
      {equipmentSetupRows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Scheduled Line Items</h2>
            <span className="text-xs text-muted-foreground">(from Project Details Setup — read-only)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 pr-2">Row Label</th>
                  <th className="text-left pb-2 pr-2">Category</th>
                  <th className="text-left pb-2 pr-2">Group</th>
                  <th className="text-left pb-2 pr-2 min-w-[160px]">Resource</th>
                  <th className="text-left pb-2 pr-2">Status</th>
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
                    <td className="py-1.5 pr-2">
                      <Select value={row.assignee || ''} onValueChange={v => assignResource(row.label, v, row.inventoryItem, row.col1)}>
                        <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue placeholder="Assign..." /></SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {labourItems.map(item => (
                            <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5 pr-2">
                      {row.applied
                        ? <span className="px-2 py-0.5 rounded text-xs bg-green-500/15 text-green-400 whitespace-nowrap">Applied</span>
                        : <span className="px-2 py-0.5 rounded text-xs bg-amber-500/15 text-amber-400 whitespace-nowrap">Pending</span>
                      }
                    </td>
                    <td className="py-1.5 pr-2 text-right text-muted-foreground">{row.col1}</td>
                    <td className="py-1.5 pr-2 text-right">{row.regCost != null && row.regCost > 0 ? `$${row.regCost.toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{row.otCost != null && row.otCost > 0 ? `$${row.otCost.toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{row.specialCost != null && row.specialCost > 0 ? `$${row.specialCost.toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 text-right font-semibold text-primary">{row.rowTotal > 0 ? `$${row.rowTotal.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
                {(() => {
                  const totals = equipmentSetupRows.reduce((acc, r) => ({
                    reg: acc.reg + (r.regCost || 0),
                    ot: acc.ot + (r.otCost || 0),
                    spec: acc.spec + (r.specialCost || 0),
                    total: acc.total + (r.rowTotal || 0),
                  }), { reg: 0, ot: 0, spec: 0, total: 0 });
                  return (
                    <tr className="border-t-2 border-border font-semibold">
                      <td colSpan={6} className="pt-2 pr-2 text-right text-muted-foreground">Totals</td>
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
        </div>
      )}

      {/* Task list table */}
      <div className="overflow-x-auto">
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
            {taskList.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-8 text-muted-foreground text-sm">
                  No line items yet. Apply a resource to a scheduled item above.
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
              : taskList.map(task => renderTaskRow(task))
            }

            {taskList.length > 0 && (() => {
              const totals = taskList.reduce((acc, t) => ({
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
  );
}