import React, { useState } from 'react';
import { Plus, FolderKanban, Calendar, BarChart2, CheckCircle2, Clock, AlertCircle, Pencil, Kanban, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import ProjectModal from '@/components/projects/ProjectModal';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

const STATUS_LABELS = {
  active: 'Active',
  planning: 'Planning',
  on_hold: 'On Hold',
  completed: 'Completed',
};

export default function Projects() {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.create({ ...data, progress: 0, tasks: 0, done: 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setModalOpen(false);
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} projects total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/project-board">
              <Kanban className="h-4 w-4 mr-1.5" /> Board
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/calendar">
              <Calendar className="h-4 w-4 mr-1.5" /> Calendar
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/gantt">
              <BarChart2 className="h-4 w-4 mr-1.5" /> Gantt Chart
            </Link>
          </Button>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Project
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active', value: projects.filter(p => p.status === 'active').length, icon: FolderKanban, color: 'text-green-400' },
          { label: 'Planning', value: projects.filter(p => p.status === 'planning').length, icon: Clock, color: 'text-blue-400' },
          { label: 'On Hold', value: projects.filter(p => p.status === 'on_hold').length, icon: AlertCircle, color: 'text-yellow-400' },
          { label: 'Completed', value: projects.filter(p => p.status === 'completed').length, icon: CheckCircle2, color: 'text-muted-foreground' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 pt-5 pb-5">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, client, or status..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Project list */}
      <Card>
        {isLoading ? (
          <CardContent className="pt-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse bg-muted rounded" />)}
          </CardContent>
        ) : projects.length === 0 ? (
          <CardContent className="py-16 text-center">
            <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No projects yet. Create your first one!</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">Project #</th>
                  <th className="text-left px-4 py-3 font-medium">Project Name</th>
                  <th className="text-left px-4 py-3 font-medium">Start Date</th>
                  <th className="text-left px-4 py-3 font-medium">End Date</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-right px-4 py-3 font-medium">Subtotal</th>
                  <th className="text-right px-4 py-3 font-medium">Tax Amount</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {projects.filter(p => {
                  const q = search.toLowerCase();
                  if (!q) return true;
                  return (
                    p.name?.toLowerCase().includes(q) ||
                    p.client?.toLowerCase().includes(q) ||
                    p.project_number?.toLowerCase().includes(q) ||
                    STATUS_LABELS[p.status]?.toLowerCase().includes(q)
                  );
                }).map(project => {
                  const tasks = project.task_list || [];
                  const subtotal = tasks.reduce((s, t) => s + (t.subtotal || 0), 0);
                  const taxAmount = tasks.reduce((s, t) => s + (t.tax_amount || 0), 0);
                  const total = tasks.reduce((s, t) => s + (t.total || 0), 0);
                  const fmt = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
                  return (
                    <tr key={project.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{project.project_number || '—'}</td>
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{project.start_date || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{project.end_date || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs border ${STATUS_STYLES[project.status]}`}>
                          {STATUS_LABELS[project.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{project.client || '—'}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(subtotal)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(taxAmount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary">{fmt(total)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/project-planning/${project.id}`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Open
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && <ProjectModal onClose={() => setModalOpen(false)} onSave={(data) => createMutation.mutate(data)} />}
    </div>
  );
}