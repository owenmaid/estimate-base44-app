import React, { useState } from 'react';
import { Plus, FolderKanban, Calendar, BarChart2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import ProjectModal from '@/components/projects/ProjectModal';

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

const SAMPLE_PROJECTS = [
  { id: 1, name: 'Website Redesign', client: 'Acme Corp', status: 'active', due: '2026-06-30', progress: 65, tasks: 12, done: 8 },
  { id: 2, name: 'Mobile App MVP', client: 'TechStart Inc', status: 'planning', due: '2026-08-15', progress: 20, tasks: 20, done: 4 },
  { id: 3, name: 'Brand Identity', client: 'Studio Blue', status: 'on_hold', due: '2026-07-01', progress: 40, tasks: 8, done: 3 },
  { id: 4, name: 'E-commerce Platform', client: 'RetailCo', status: 'completed', due: '2026-04-10', progress: 100, tasks: 30, done: 30 },
];

export default function Projects() {
  const [projects, setProjects] = useState(SAMPLE_PROJECTS);
  const [modalOpen, setModalOpen] = useState(false);

  const handleAdd = (project) => {
    setProjects(prev => [...prev, { ...project, id: Date.now(), progress: 0, tasks: 0, done: 0 }]);
    setModalOpen(false);
  };

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

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map(project => (
          <Card key={project.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{project.client}</p>
                </div>
                <Badge className={`text-xs border ${STATUS_STYLES[project.status]}`}>
                  {STATUS_LABELS[project.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{project.done}/{project.tasks} tasks done</span>
                <span>Due {project.due}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {modalOpen && <ProjectModal onClose={() => setModalOpen(false)} onSave={handleAdd} />}
    </div>
  );
}