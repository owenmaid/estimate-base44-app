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
import { ArrowLeft, Save, Trash2, Plus, CheckCircle2, Circle, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  planning: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

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
  const [newTaskName, setNewTaskName] = useState('');

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        client: project.client || '',
        status: project.status || 'planning',
        due: project.due || '',
        description: project.description || '',
        progress: project.progress || 0,
      });
      setTaskList(project.task_list || []);
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Project.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
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

  const handleSave = () => {
    const done = taskList.filter(t => t.done).length;
    const autoProgress = taskList.length > 0 ? Math.round((done / taskList.length) * 100) : form.progress;
    updateMutation.mutate({
      ...form,
      task_list: taskList,
      tasks: taskList.length,
      done,
      progress: autoProgress,
    });
  };

  const addTask = () => {
    if (!newTaskName.trim()) return;
    setTaskList(prev => [...prev, { id: Date.now(), name: newTaskName.trim(), done: false }]);
    setNewTaskName('');
  };

  const toggleTask = (taskId) => {
    setTaskList(prev => prev.map(t => t.id === taskId ? { ...t, done: !t.done } : t));
  };

  const removeTask = (taskId) => {
    setTaskList(prev => prev.filter(t => t.id !== taskId));
  };

  const updateTask = (taskId, name) => {
    setTaskList(prev => prev.map(t => t.id === taskId ? { ...t, name } : t));
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

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
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
            <span className="text-muted-foreground">{doneTasks}/{taskList.length} tasks · {progress}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Details */}
        <Card>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due} onChange={e => setForm(p => ({ ...p, due: e.target.value }))} />
            </div>
            <div>
              <Label>Manual Progress % (used when no tasks)</Label>
              <Input
                type="number"
                min="0"
                max="100"
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

        {/* Task List */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Task List</CardTitle>
              <Badge className={`text-xs border ${STATUS_STYLES[form.status]}`}>
                {doneTasks}/{taskList.length} done
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add task */}
            <div className="flex gap-2">
              <Input
                placeholder="Add a new task..."
                value={newTaskName}
                onChange={e => setNewTaskName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <Button size="sm" onClick={addTask}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Task items */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {taskList.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No tasks yet. Add one above!</p>
              )}
              {taskList.map(task => (
                <div key={task.id} className="flex items-center gap-2 group p-2 rounded-lg hover:bg-muted/40 transition-colors">
                  <button onClick={() => toggleTask(task.id)} className="flex-shrink-0">
                    {task.done
                      ? <CheckCircle2 className="h-5 w-5 text-primary" />
                      : <Circle className="h-5 w-5 text-muted-foreground" />
                    }
                  </button>
                  <input
                    className={`flex-1 bg-transparent text-sm outline-none ${task.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                    value={task.name}
                    onChange={e => updateTask(task.id, e.target.value)}
                  />
                  <button
                    onClick={() => removeTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}