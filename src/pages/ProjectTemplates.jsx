import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, Circle, LayoutTemplate, Pencil, X, Save, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import ConfirmDeleteDialog from '@/components/ui/ConfirmDeleteDialog';

const TASK_TYPES = ['Manpower', 'Equipment', 'Logistics'];

function TemplateEditor({ template, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const isNew = !template;

  const [form, setForm] = useState({
    name: template?.name || '',
    description: template?.description || '',
    default_status: template?.default_status || 'planning',
    task_list: template?.task_list || [],
  });
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskType, setNewTaskType] = useState('');

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isNew
        ? base44.entities.ProjectTemplate.create(data)
        : base44.entities.ProjectTemplate.update(template.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTemplates'] });
      toast.success(isNew ? 'Template created!' : 'Template updated!');
      onSaved();
    },
  });

  const addTask = () => {
    if (!newTaskName.trim()) return;
    setForm(f => ({
      ...f,
      task_list: [...f.task_list, { id: Date.now(), name: newTaskName.trim(), type: newTaskType || null, done: false }],
    }));
    setNewTaskName('');
    setNewTaskType('');
  };

  const removeTask = (id) => setForm(f => ({ ...f, task_list: f.task_list.filter(t => t.id !== id) }));
  const updateTask = (id, name) =>
    setForm(f => ({ ...f, task_list: f.task_list.map(t => t.id === id ? { ...t, name } : t) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">{isNew ? 'New Template' : 'Edit Template'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <Label>Template Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Construction Project" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this template for?" className="min-h-[70px]" />
          </div>
          <div>
            <Label>Default Status</Label>
            <Select value={form.default_status} onValueChange={v => setForm(f => ({ ...f, default_status: v }))}>
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
            <Label className="mb-2 block">Preset Tasks</Label>
            <div className="flex gap-2 mb-3">
              <Select value={newTaskType} onValueChange={setNewTaskType}>
                <SelectTrigger className="w-36 flex-shrink-0">
                  <SelectValue placeholder="Type..." />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Task name..."
                value={newTaskName}
                onChange={e => setNewTaskName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <Button size="sm" onClick={addTask}><Plus className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {form.task_list.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No tasks added yet.</p>
              )}
              {form.task_list.map(task => (
                <div key={task.id} className="flex items-center gap-2 group p-2 rounded-lg bg-muted/30">
                  <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none"
                    value={task.name}
                    onChange={e => updateTask(task.id, e.target.value)}
                  />
                  {task.type && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">{task.type}</span>
                  )}
                  <button onClick={() => removeTask(task.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name || saveMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Estimate Template Card ────────────────────────────────────────────────────
function EstimateTemplateCard({ tmpl, onDelete, onLoad }) {
  const sectionCount = (tmpl.line_items || []).filter(i => (i.description || '').startsWith('__SECTION__:')).length;
  const lineCount = (tmpl.line_items || []).filter(i => !(i.description || '').startsWith('__SECTION__:') && i.description !== '__SPACER__').length;

  return (
    <Card className="hover:shadow-lg transition-shadow border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              <CardTitle className="text-base truncate">{tmpl.name}</CardTitle>
            </div>
            {tmpl.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
            )}
          </div>
          <Badge className="text-xs border flex-shrink-0 bg-primary/10 text-primary border-primary/30">
            Estimate
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground space-y-0.5">
          {tmpl.source_estimate_number && (
            <p>Source: <span className="text-foreground font-medium">{tmpl.source_estimate_number}</span></p>
          )}
          {tmpl.client_info?.client_name && (
            <p>Client: <span className="text-foreground">{tmpl.client_info.client_name}</span></p>
          )}
          <p>{sectionCount} sections · {lineCount} line items</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => onLoad(tmpl)}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Load in Panel
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(tmpl.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectTemplates() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('project');
  const isOpen = editing !== null;
  const [confirmDeleteProjectTmpl, setConfirmDeleteProjectTmpl] = useState(null);
  const [confirmDeleteEstimateTmpl, setConfirmDeleteEstimateTmpl] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['projectTemplates'],
    queryFn: () => base44.entities.ProjectTemplate.list('-created_date'),
  });

  const { data: estimateTemplates = [], isLoading: etLoading } = useQuery({
    queryKey: ['estimateTemplates'],
    queryFn: () => base44.entities.EstimateTemplate.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTemplates'] });
      toast.success('Template deleted');
    },
  });

  const deleteEtMutation = useMutation({
    mutationFn: (id) => base44.entities.EstimateTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimateTemplates'] });
      toast.success('Estimate template deleted');
    },
  });

  // Navigate to CreateEstimatePanel with template data stored in sessionStorage.
  // Zero out all unit_price and total so the panel starts clean — costs are computed
  // only after the user links a project and the calculation engine runs.
  const handleLoadEstimateTemplate = (tmpl) => {
    const cleanTmpl = {
      ...tmpl,
      client_info: { ...(tmpl.client_info || {}), project_number: '' },
      line_items: (tmpl.line_items || []).map(item => ({
        ...item,
        unit_price: 0,
        total: 0,
      })),
    };
    sessionStorage.setItem('estimateTemplateToLoad', JSON.stringify(cleanTmpl));
    navigate('/create-estimate-panel');
    toast.success(`Opening "${tmpl.name}" in Estimate Panel…`);
  };

  const STATUS_LABELS = { planning: 'Planning', active: 'Active', on_hold: 'On Hold', completed: 'Completed' };
  const STATUS_STYLES = {
    active: 'bg-green-500/15 text-green-400 border-green-500/30',
    planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    completed: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Reusable project task structures and estimate snapshots</p>
        </div>
        {activeTab === 'project' && (
          <Button size="sm" onClick={() => setEditing(false)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Project Template
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'project', label: 'Project Templates', count: templates.length },
          { key: 'estimate', label: 'Estimate Templates', count: estimateTemplates.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs bg-secondary px-1.5 py-0.5 rounded-full">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Project Templates Tab */}
      {activeTab === 'project' && (
        isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Card key={i} className="h-40 animate-pulse bg-muted" />)}
          </div>
        ) : templates.length === 0 ? (
          <Card className="py-16 text-center">
            <CardContent>
              <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No project templates yet. Create your first one!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(tmpl => (
              <Card key={tmpl.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{tmpl.name}</CardTitle>
                      {tmpl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
                      )}
                    </div>
                    <Badge className={`text-xs border flex-shrink-0 ${STATUS_STYLES[tmpl.default_status]}`}>
                      {STATUS_LABELS[tmpl.default_status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(tmpl.task_list || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No preset tasks</p>
                    )}
                    {(tmpl.task_list || []).map(task => (
                      <div key={task.id} className="flex items-center gap-2">
                        <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs flex-1 truncate">{task.name}</span>
                        {task.type && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{task.type}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{(tmpl.task_list || []).length} preset tasks</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(tmpl)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteProjectTmpl(tmpl.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Estimate Templates Tab */}
      {activeTab === 'estimate' && (
        etLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Card key={i} className="h-40 animate-pulse bg-muted" />)}
          </div>
        ) : estimateTemplates.length === 0 ? (
          <Card className="py-16 text-center">
            <CardContent>
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No estimate templates yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Use "Save as Template" in the Estimate Panel to create one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {estimateTemplates.map(tmpl => (
              <EstimateTemplateCard
                key={tmpl.id}
                tmpl={tmpl}
                onDelete={(id) => setConfirmDeleteEstimateTmpl(id)}
                onLoad={handleLoadEstimateTemplate}
              />
            ))}
          </div>
        )
      )}

      {isOpen && (
        <TemplateEditor
          template={editing || null}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      <ConfirmDeleteDialog
        open={confirmDeleteProjectTmpl !== null}
        title="Delete project template?"
        description="This will permanently remove this project template. This action cannot be undone."
        onCancel={() => setConfirmDeleteProjectTmpl(null)}
        onConfirm={() => { deleteMutation.mutate(confirmDeleteProjectTmpl); setConfirmDeleteProjectTmpl(null); }}
      />

      <ConfirmDeleteDialog
        open={confirmDeleteEstimateTmpl !== null}
        title="Delete estimate template?"
        description="This will permanently remove this estimate template. This action cannot be undone."
        onCancel={() => setConfirmDeleteEstimateTmpl(null)}
        onConfirm={() => { deleteEtMutation.mutate(confirmDeleteEstimateTmpl); setConfirmDeleteEstimateTmpl(null); }}
      />
    </div>
  );
}