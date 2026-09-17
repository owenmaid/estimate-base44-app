import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, FileText, Users, DollarSign, ShieldAlert, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { generateProjectReportPDF } from '@/lib/generateProjectReportPDF';
import { computeCol14 } from '@/lib/computeCol14';
import { calculateScheduleRow } from '@/lib/calculations';

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

const rowInventoryEntry = (row, inventoryItems) =>
  inventoryItems.find(i => String(i.id) === String(row.item_id))
  || inventoryItems.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
  || null;

function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}
function rangesOverlap(p1, p2) {
  const s1 = parseDate(p1.start_date), e1 = parseDate(p1.end_date);
  const s2 = parseDate(p2.start_date), e2 = parseDate(p2.end_date);
  if (!s1 || !e1 || !s2 || !e2) return false;
  return s1 <= e2 && s2 <= e1;
}

export default function ProjectReport() {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // Compute the full summary used for both preview and PDF
  const summary = useMemo(() => {
    if (!selectedProject) return null;

    const tasks = selectedProject.task_list || [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.done).length;
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : (selectedProject.progress || 0);

    // Duration
    let durationDays = 0;
    if (selectedProject.start_date && selectedProject.end_date) {
      const start = new Date(selectedProject.start_date);
      const end = new Date(selectedProject.end_date);
      const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      durationDays = diff > 0 ? diff : 0;
    }

    // Assignees
    const assigneeMap = {};
    tasks.forEach(t => {
      const name = t.assignee?.trim();
      if (!name) return;
      if (!assigneeMap[name]) assigneeMap[name] = { name, tasks: 0, done: 0, projects: new Set() };
      assigneeMap[name].tasks++;
      if (t.done) assigneeMap[name].done++;
      assigneeMap[name].projects.add(selectedProject.name);
    });
    const assignees = Object.values(assigneeMap).map(a => ({
      ...a,
      projects: a.projects.size,
    })).sort((a, b) => b.tasks - a.tasks);

    // Group line items by manpower group (task.type)
    const groupMap = {};
    tasks.forEach(t => {
      const name = t.assignee?.trim();
      if (!name) return;
      const group = t.type || 'Uncategorized';
      if (!groupMap[group]) groupMap[group] = {};
      if (!groupMap[group][name]) groupMap[group][name] = { name, tasks: 0, done: 0, projects: new Set() };
      groupMap[group][name].tasks++;
      if (t.done) groupMap[group][name].done++;
      groupMap[group][name].projects.add(selectedProject.name);
    });
    const personnelGroups = Object.keys(groupMap).sort().map(group => {
      const rows = Object.values(groupMap[group]).map(r => ({ ...r, projects: r.projects.size })).sort((a, b) => b.tasks - a.tasks);
      return {
        group,
        rows,
        totalItems: rows.reduce((s, r) => s + r.tasks, 0),
        totalDone: rows.reduce((s, r) => s + r.done, 0),
      };
    });

    // Equipment cost breakdown — DCSM and Ventilation equipment only
    const equipmentRows = (selectedProject.equipment_rows || []).map(row => {
      const cost = computeCol14(row, selectedProject.equipment_grid || {}, selectedProject.type_grid || {}, inventoryItems);
      const inv = rowInventoryEntry(row, inventoryItems);
      const category = (inv?.category || '').toUpperCase();
      return { label: row.label || 'Unnamed', cost: cost || 0, category };
    }).filter(r => r.cost > 0 && (r.category === 'DIGITAL MONITORING EQUIPMENT' || r.category.includes('VENTILATION EQUIPMENT')));
    const totalEquipmentCost = equipmentRows.reduce((s, r) => s + r.cost, 0);

    // Manpower total: sum of scheduled manpower row costs, excluding conventional costs
    const manpowerTotal = (selectedProject.equipment_rows || []).reduce((sum, row) => {
      const result = calculateScheduleRow(row, selectedProject.equipment_grid || {}, selectedProject.type_grid || {}, inventoryItems);
      if (!result || !result.isManpower) return sum;
      const cat = (result.inventoryItem?.category || '').toUpperCase();
      if (cat === 'CONVENTIONAL COSTS') return sum;
      return sum + (result.totalCost || 0);
    }, 0);

    // Conflicts: check if this project's assignees are double-booked across OTHER projects
    const conflicts = [];
    const otherProjects = projects.filter(p => p.id !== selectedProject.id);
    Object.keys(assigneeMap).forEach(name => {
      otherProjects.forEach(other => {
        const otherHasAssignee = (other.task_list || []).some(t => t.assignee?.trim() === name);
        if (otherHasAssignee && rangesOverlap(selectedProject, other)) {
          conflicts.push({
            resource: name,
            detail: `Overlaps "${other.name}" (${other.start_date || '?'} → ${other.end_date || '?'})`,
          });
        }
      });
    });

    return {
      statusLabel: STATUS_LABELS[selectedProject.status] || selectedProject.status || '—',
      durationDays,
      totalTasks,
      doneTasks,
      progress,
      assignees,
      personnelGroups,
      totalManpowerItems: assignees.reduce((s, a) => s + a.tasks, 0),
      equipmentRows,
      totalEquipmentCost,
      manpowerTotal,
      conflicts,
    };
  }, [selectedProject, projects, inventoryItems]);

  const handleGeneratePDF = () => {
    if (!selectedProject || !summary) return;
    setGenerating(true);
    try {
      generateProjectReportPDF(selectedProject, summary);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Project Report
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate a clean PDF summary with resource allocation and status
          </p>
        </div>
        <Button onClick={handleGeneratePDF} disabled={!selectedProject || generating} className="shrink-0">
          <FileDown className="h-4 w-4 mr-2" />
          {generating ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {/* Project selector */}
      <Card>
        <CardContent className="pt-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
            Select Project
          </label>
          {loadingProjects ? (
            <div className="h-10 w-full animate-pulse bg-muted rounded-md" />
          ) : (
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a project to report on..." />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.client ? ` — ${p.client}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {!selectedProject ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-sm font-medium">No project selected</p>
            <p className="text-muted-foreground text-xs">Pick a project above to preview its report summary.</p>
          </CardContent>
        </Card>
      ) : !summary ? null : (
        <>
          {/* Status & Progress overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Status</p>
                <Badge className={`mt-2 text-sm border ${STATUS_STYLES[selectedProject.status] || ''}`}>
                  {summary.statusLabel}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Man Power Required</p>
                <p className="text-2xl font-bold mt-1">{summary.totalTasks}</p>
              </CardContent>
            </Card>
          </div>

          {/* Project details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Project Name', selectedProject.name],
                  ['Project Number', selectedProject.project_number],
                  ['Client', selectedProject.client],
                  ['Site', selectedProject.site],
                  ['Location', selectedProject.location],
                  ['Plant', selectedProject.plant],
                  ['Start Date', selectedProject.start_date || '—'],
                  ['End Date', selectedProject.end_date || '—'],
                  ['Duration', summary.durationDays > 0 ? `${summary.durationDays} days` : '—'],
                  ['Phone', selectedProject.phone || '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-medium truncate">{value || '—'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Resource allocation summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Assigned Resources</p>
                  <p className="text-xl font-bold">{summary.assignees.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project Manpower Total</p>
                  <p className="text-xl font-bold">${summary.manpowerTotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Equipment Cost</p>
                  <p className="text-xl font-bold">${summary.totalEquipmentCost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conflicts */}
          {summary.conflicts.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                  Scheduling Conflicts ({summary.conflicts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.conflicts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <span className="font-medium">{c.resource}</span>
                    <span className="text-muted-foreground">— {c.detail}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Assigned personnel table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assigned Personnel</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {summary.assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No personnel assigned to this project.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border text-[11px] uppercase tracking-wider bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium">Resource</th>
                        <th className="text-right px-4 py-3 font-medium">Items</th>
                        <th className="text-right px-4 py-3 font-medium">Done</th>
                        <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Projects</th>
                        <th className="text-right px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.personnelGroups.map(g => (
                        <React.Fragment key={g.group}>
                          <tr className="bg-primary/10 border-b border-primary/20">
                            <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
                              {g.group}
                            </td>
                          </tr>
                          {g.rows.map(a => {
                            const isComplete = a.done >= a.tasks && a.tasks > 0;
                            return (
                              <tr key={`${g.group}-${a.name}`} className="border-b border-border/40 hover:bg-muted/25 transition-colors">
                                <td className="px-4 py-2.5 pl-8 font-medium truncate">{a.name}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{a.tasks}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">{a.done}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">{a.projects}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {isComplete ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-yellow-400 font-medium">
                                      <Clock className="h-3.5 w-3.5" /> In Progress
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-b border-border bg-muted/20 font-medium">
                            <td className="px-4 py-2 text-right text-muted-foreground uppercase text-[11px] tracking-wider">{g.group} Subtotal</td>
                            <td className="px-4 py-2 text-right tabular-nums">{g.totalItems}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{g.totalDone}</td>
                            <td className="px-4 py-2 hidden sm:table-cell" />
                            <td className="px-4 py-2" />
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Equipment breakdown */}
          {summary.equipmentRows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Equipment Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border text-[11px] uppercase tracking-wider bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium">Equipment</th>
                        <th className="text-right px-4 py-3 font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.equipmentRows.map((row, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-muted/25 transition-colors">
                          <td className="px-4 py-2.5 truncate">{row.label}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            ${row.cost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                        <td className="px-4 py-3 text-right text-muted-foreground uppercase text-[11px] tracking-wider">Total Equipment Cost</td>
                        <td className="px-4 py-3 text-right text-primary tabular-nums">
                          ${summary.totalEquipmentCost.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}