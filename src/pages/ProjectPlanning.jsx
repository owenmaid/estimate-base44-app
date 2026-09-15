import React, { useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Trash2, Maximize2, Lock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { calculateScheduleRow, roundMoney } from '@/lib/calculations';
import { getErrorMessage } from '@/lib/reliability';
import { useProjectTasks, toNum } from '@/hooks/useProjectTasks';

export default function ProjectPlanning() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    project, isLoading, form, setForm, taskList,
    inventoryItems, updateMutation, doneTasks, progress,
  } = useProjectTasks(id);

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Project.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      navigate('/projects');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to delete the project.')),
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Enter a project name before saving.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      toast.error('End date cannot be earlier than start date.'); return;
    }
    const done = taskList.filter(t => t.done).length;
    const autoProgress = taskList.length > 0 ? Math.round((done / taskList.length) * 100) : form.progress;
    const cleanedTaskList = taskList.map(t => ({
      id: t.id, name: t.name, type: t.type || null, assignee: t.assignee || null, done: !!t.done,
      quantity: toNum(t.quantity), cost: roundMoney(t.cost), markup: toNum(t.markup), tax_pct: toNum(t.tax_pct),
      subtotal: roundMoney(t.subtotal), tax_amount: roundMoney(t.tax_amount), total: roundMoney(t.total),
    }));
    updateMutation.mutate({
      ...form, task_list: cleanedTaskList, tasks: cleanedTaskList.length, done, progress: autoProgress,
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
        id: row.id, label: row.label, category: result.inventoryItem.category || '—',
        isManpower: result.isManpower, col1: result.col1, regCost: result.regularCost,
        otCost: result.overtimeCost, specialCost: result.specialCost, rowTotal: result.totalCost,
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
          <Button variant="outline" size="sm" onClick={() => navigate(`/project-list?id=${id}`)}>
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
    </div>
  );
}