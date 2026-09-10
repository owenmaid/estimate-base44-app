import React, { useState } from 'react';
import { X, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

export default function ProjectModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', client: '', status: 'planning', start_date: '', end_date: '' });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['projectTemplates'],
    queryFn: () => base44.entities.ProjectTemplate.list('-created_date'),
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name) return;

    const projectData = { ...form };

    if (selectedTemplate) {
      projectData.task_list = (selectedTemplate.task_list || []).map(t => ({ ...t, done: false }));
      projectData.tasks = projectData.task_list.length;
      projectData.done = 0;
      projectData.progress = 0;
      if (!form.status || form.status === 'planning') {
        projectData.status = selectedTemplate.default_status || 'planning';
      }
    }

    onSave(projectData);
  };

  const handleTemplateSelect = (id) => {
    setSelectedTemplateId(id);
    const tmpl = templates.find(t => t.id === id);
    if (tmpl && tmpl.default_status) {
      setForm(f => ({ ...f, status: tmpl.default_status }));
    }
  };

  const STATUS_STYLES = {
    active: 'bg-green-500/15 text-green-400 border-green-500/30',
    planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    completed: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Template selector */}
          {templates.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <LayoutTemplate className="h-3.5 w-3.5" /> Start from a Template (optional)
              </Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>No template (blank project)</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <div className="space-y-1">
                  {selectedTemplate.description && (
                    <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(selectedTemplate.task_list || []).slice(0, 5).map(task => (
                      <Badge key={task.id} variant="secondary" className="text-xs px-1.5 py-0">
                        {task.name}{task.type ? ` · ${task.type}` : ''}
                      </Badge>
                    ))}
                    {(selectedTemplate.task_list || []).length > 5 && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        +{(selectedTemplate.task_list || []).length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Project Name *</Label>
            <Input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="My Project" />
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create Project</Button>
          </div>
        </form>
      </div>
    </div>
  );
}