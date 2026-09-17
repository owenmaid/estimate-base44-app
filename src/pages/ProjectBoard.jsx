import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Pencil, GripVertical, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const COLUMNS = [
  { key: 'planning',  label: 'Planning',  color: 'text-blue-400',   border: 'border-blue-500/40',  bg: 'bg-blue-500/10' },
  { key: 'active',    label: 'Active',    color: 'text-green-400',  border: 'border-green-500/40', bg: 'bg-green-500/10' },
  { key: 'on_hold',   label: 'On Hold',   color: 'text-yellow-400', border: 'border-yellow-500/40',bg: 'bg-yellow-500/10' },
  { key: 'completed', label: 'Completed', color: 'text-muted-foreground', border: 'border-border', bg: 'bg-muted/30' },
];

const STATUS_BADGE = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

export default function ProjectBoard() {
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  // Local columns state for optimistic UI
  const [columns, setColumns] = useState({});
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    const grouped = {};
    COLUMNS.forEach(c => { grouped[c.key] = []; });
    projects.forEach(p => {
      const col = grouped[p.status] ? p.status : 'planning';
      grouped[col].push(p);
    });
    setColumns(grouped);
  }, [projects]);

  const updateMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Project.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => toast.error('Failed to update project status'),
  });

  const moveProject = (projectId, fromCol, toCol) => {
    if (fromCol === toCol) return;
    const sourceCol = Array.from(columns[fromCol] || []);
    const destCol = Array.from(columns[toCol] || []);
    const idx = sourceCol.findIndex(p => p.id === projectId);
    if (idx === -1) return;
    const [moved] = sourceCol.splice(idx, 1);
    destCol.push(moved);
    setColumns(prev => ({ ...prev, [fromCol]: sourceCol, [toCol]: destCol }));
    updateMutation.mutate({ id: projectId, status: toCol });
    toast.success(`Moved to ${COLUMNS.find(c => c.key === toCol)?.label}`);
  };

  const onDragStart = (e, project, fromCol) => {
    setDraggingId(project.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: project.id, fromCol }));
  };

  const onDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colKey) setDragOverCol(colKey);
  };

  const onDragLeave = (e, colKey) => {
    // Only clear if leaving the column entirely (not entering a child)
    if (dragOverCol === colKey) setDragOverCol(null);
  };

  const onDrop = (e, toCol) => {
    e.preventDefault();
    setDragOverCol(null);
    setDraggingId(null);
    try {
      const { id, fromCol } = JSON.parse(e.dataTransfer.getData('text/plain'));
      moveProject(id, fromCol, toCol);
    } catch {
      // ignore malformed drop data
    }
  };

  const onDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-2xl font-bold">Project Board</h1>
        <p className="text-sm text-muted-foreground mt-1">Drag cards between columns or use the status dropdown to update project status</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
        {COLUMNS.map(col => (
          <div
            key={col.key}
            className={`flex flex-col rounded-xl border ${col.border} ${col.bg} p-3 min-h-[500px] transition-colors ${dragOverCol === col.key ? 'ring-2 ring-primary/50' : ''}`}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={(e) => onDragLeave(e, col.key)}
            onDrop={(e) => onDrop(e, col.key)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span className={`text-sm font-semibold ${col.color}`}>{col.label}</span>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {(columns[col.key] || []).length}
              </span>
            </div>

            <div className={`flex-1 space-y-2 rounded-lg transition-colors min-h-[40px] ${dragOverCol === col.key ? 'bg-primary/5' : ''}`}>
              {(columns[col.key] || []).map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, project, col.key)}
                  onDragEnd={onDragEnd}
                  className={`bg-card border border-border rounded-lg p-3 shadow-sm transition-shadow cursor-grab active:cursor-grabbing ${draggingId === project.id ? 'opacity-50' : 'hover:shadow-md'}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 text-muted-foreground flex-shrink-0">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {project.client && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{project.client}</p>
                      )}

                      {/* Progress bar */}
                      {(project.tasks > 0) && (
                        <div className="mt-2">
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${project.progress || 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{project.done}/{project.tasks} tasks</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2 gap-2">
                        <Select
                          value={project.status}
                          onValueChange={(value) => {
                            if (value === project.status) return;
                            moveProject(project.id, project.status, value);
                          }}
                        >
                          <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs px-2 py-0.5 gap-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMNS.map(c => (
                              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Link to={`/project-planning?id=${project.id}`}>
                          <button className="text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {(columns[col.key] || []).length === 0 && dragOverCol !== col.key && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                  <FolderKanban className="h-6 w-6 mb-1" />
                  <p className="text-xs">Drop here</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}