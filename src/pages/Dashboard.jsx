import React, { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilePlus, FileText, DollarSign, CheckCircle, Clock, FolderKanban, TrendingUp, CalendarClock, AlertCircle, Pencil } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { computeCol14 } from '@/lib/computeCol14';

// Resolve the inventory entry for a row (mirrors computeCol14's lookup).
const rowInventoryEntry = (row, inventoryItems) =>
  inventoryItems.find(i => String(i.id) === String(row.item_id))
  || inventoryItems.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
  || null;

// Sum Equipment Schedule costs (Col14) for a single project.
// Excludes inventory items in the "CONVENTIONAL" sub_group_01, mirroring the Estimate subtotal.
const projectEquipmentCost = (project, inventoryItems) => {
  const rows = project.equipment_rows || [];
  const eGrid = project.equipment_grid || {};
  const tGrid = project.type_grid || {};
  return rows.reduce((sum, row) => {
    const entry = rowInventoryEntry(row, inventoryItems);
    if (entry && (entry.sub_group_01 || '').toUpperCase() === 'CONVENTIONAL') return sum;
    const val = computeCol14(row, eGrid, tGrid, inventoryItems);
    return sum + (val || 0);
  }, 0);
};

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

const SERIF = { fontFamily: "'Playfair Display', Georgia, serif" };

// Warm stat card for the Petro-Chemical Tint dashboard.
function WarmStatCard({ title, value, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <span className="text-2xl font-bold text-foreground leading-tight" style={SERIF}>{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const { data: estimates = [], isLoading: loadingEstimates } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list('-created_date'),
  });

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const queryClient = useQueryClient();

  // Real-time: invalidate cached queries when projects or estimates change
  useEffect(() => {
    const unsubProjects = base44.entities.Project.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });
    const unsubEstimates = base44.entities.Estimate.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
    });
    const unsubInventory = base44.entities.InventoryItem.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems'] });
    });
    return () => {
      if (typeof unsubProjects === 'function') unsubProjects();
      if (typeof unsubEstimates === 'function') unsubEstimates();
      if (typeof unsubInventory === 'function') unsubInventory();
    };
  }, [queryClient]);

  // Estimate stats
  const estimateStats = {
    total: estimates.length,
    totalValue: estimates.reduce((s, e) => s + (e.total || 0), 0),
    accepted: estimates.filter(e => e.status === 'accepted').length,
    pending: estimates.filter(e => e.status === 'draft' || e.status === 'sent').length,
  };

  // Project stats
  const projectStats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    planning: projects.filter(p => p.status === 'planning').length,
    onHold: projects.filter(p => p.status === 'on_hold').length,
    completed: projects.filter(p => p.status === 'completed').length,
    totalRevenue: projects.reduce((s, p) => s + projectEquipmentCost(p, inventoryItems), 0),
  };

  // Revenue per month from project task totals — grouped by project created_date month
  const revenueByMonth = useMemo(() => {
    const map = {};
    projects.forEach(p => {
      if (!p.created_date) return;
      const month = format(new Date(p.created_date), 'MMM yyyy');
      const rev = projectEquipmentCost(p, inventoryItems);
      map[month] = (map[month] || 0) + rev;
    });
    // Sort chronologically
    const sorted = Object.entries(map)
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => new Date(a.month) - new Date(b.month))
      .slice(-12); // last 12 months
    return sorted;
  }, [projects, inventoryItems]);

  // Map project -> estimate (match by project_number, fallback to project_name)
  const estimateByProject = useMemo(() => {
    const byNumber = {};
    const byName = {};
    estimates.forEach(e => {
      if (e.project_number) byNumber[e.project_number] = e;
      if (e.project_name) byName[e.project_name] = e;
    });
    return { byNumber, byName };
  }, [estimates]);

  // Upcoming deadlines: projects with a due date in the next 60 days, not completed
  const today = new Date();
  const upcomingDeadlines = projects
    .filter(p => p.end_date && p.status !== 'completed')
    .map(p => ({ ...p, dueDate: parseISO(p.end_date) }))
    .filter(p => isAfter(p.dueDate, today) && isBefore(p.dueDate, addDays(today, 60)))
    .sort((a, b) => a.dueDate - b.dueDate)
    .slice(0, 8);

  const overdue = projects.filter(p => p.end_date && p.status !== 'completed' && isBefore(parseISO(p.end_date), today));

  const projectStatCards = [
    { title: 'Total Projects', value: projectStats.total, icon: FolderKanban, accent: 'text-primary' },
    { title: 'Active', value: projectStats.active, icon: TrendingUp, accent: 'text-green-400' },
    { title: 'Planning', value: projectStats.planning, icon: Pencil, accent: 'text-blue-400' },
    { title: 'On Hold', value: projectStats.onHold, icon: AlertCircle, accent: 'text-yellow-400' },
    { title: 'Completed', value: projectStats.completed, icon: CheckCircle, accent: 'text-emerald-400' },
    { title: 'Total Revenue', value: `$${projectStats.totalRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, icon: DollarSign, accent: 'text-primary' },
  ];

  const estimateStatCards = [
    { title: 'Total Estimates', value: estimateStats.total, icon: FileText, accent: 'text-primary' },
    { title: 'Total Value', value: `$${estimateStats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, accent: 'text-green-400' },
    { title: 'Accepted', value: estimateStats.accepted, icon: CheckCircle, accent: 'text-emerald-400' },
    { title: 'Pending', value: estimateStats.pending, icon: Clock, accent: 'text-amber-400' },
  ];

  return (
    <div className="min-h-full bg-background p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={SERIF}>Executive Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Full business overview</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects"><FolderKanban className="h-4 w-4 mr-1.5" /> Projects</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/estimates/new"><FilePlus className="h-4 w-4 mr-1.5" /> New Estimate</Link>
          </Button>
        </div>
      </div>

      {/* Total Revenue hero with pipeline-flow detail */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6">
        <svg className="absolute right-0 top-0 h-full w-1/2 opacity-25 pointer-events-none" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,70 C80,25 160,105 240,65 S400,25 400,70" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
          <path d="M0,90 C80,45 160,125 240,85 S400,45 400,90" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.6" />
          <path d="M0,45 C80,5 160,85 240,45 S400,5 400,45" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
        </svg>
        <div className="relative">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total Revenue</p>
          <p className="text-4xl lg:text-5xl font-bold text-primary mt-1 leading-none" style={SERIF}>
            ${projectStats.totalRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-2">across {projectStats.total} projects · {estimateStats.total} estimates</p>
        </div>
      </div>

      {/* Band 1: Revenue + Project Values charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={SERIF}>Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByMonth.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No revenue data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenueByMonth} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={SERIF}>Project Values</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No project data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={projects.map(p => ({ name: p.name, value: projectEquipmentCost(p, inventoryItems) }))}
                  margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={60} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Value']}
                  />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Band 2: Deadlines + Estimates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2" style={SERIF}>
              <CalendarClock className="h-4 w-4 text-primary" /> Upcoming Deadlines
            </CardTitle>
            {overdue.length > 0 && (
              <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs border">
                {overdue.length} overdue
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No upcoming deadlines in the next 60 days</p>
            ) : upcomingDeadlines.map(p => {
              const daysLeft = Math.ceil((p.dueDate - today) / (1000 * 60 * 60 * 24));
              const urgent = daysLeft <= 7;
              return (
                <Link to={`/project-planning/${p.id}`} key={p.id}>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.client || 'No client'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                      <Badge className={`text-xs border ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                      <span className={`text-xs font-medium ${urgent ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d left`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
            <div className="pt-1">
              <Link to="/projects" className="text-xs text-primary hover:underline">View all projects →</Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold px-1" style={SERIF}>Estimates</h2>
          <div className="grid grid-cols-2 gap-3 flex-1">
            {estimateStatCards.map(c => <WarmStatCard key={c.title} {...c} />)}
          </div>
        </div>
      </div>

      {/* Band 3: Projects Overview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={SERIF}>Projects Overview</h2>
          <Link to="/projects" className="text-sm text-primary hover:underline font-medium">View all</Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Stat cards */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3 content-start">
            {projectStatCards.map(c => <WarmStatCard key={c.title} {...c} />)}
          </div>

          {/* Projects table */}
          <Card className="lg:col-span-8">
            <CardContent className="p-0">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : projects.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No projects yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">Project</th>
                        <th className="text-left px-4 py-3 font-medium">Number</th>
                        <th className="text-left px-4 py-3 font-medium">Client</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">End Date</th>
                        <th className="text-left px-4 py-3 font-medium">Estimate</th>
                        <th className="text-right px-4 py-3 font-medium">Estimate Value</th>
                        <th className="text-right px-4 py-3 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.slice(0, 10).map(p => {
                        const value = projectEquipmentCost(p, inventoryItems);
                        const est = estimateByProject.byNumber[p.project_number] || estimateByProject.byName[p.name];
                        return (
                          <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5">
                              <Link to={`/project-planning/${p.id}`} className="font-medium text-foreground hover:text-primary">
                                {p.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.project_number || '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.client || '—'}</td>
                            <td className="px-4 py-2.5">
                              <Badge className={`text-xs border ${STATUS_STYLES[p.status] || 'bg-muted text-muted-foreground border-border'}`}>
                                {STATUS_LABELS[p.status] || p.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.end_date || '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {est?.estimate_number || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              {est && est.subtotal != null ? `$${est.subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-primary">
                              {value > 0 ? `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {projects.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td colSpan={7} className="px-4 py-3 text-right text-muted-foreground">Total Value</td>
                          <td className="px-4 py-3 text-right text-primary">
                            ${projects.reduce((s, p) => s + projectEquipmentCost(p, inventoryItems), 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}