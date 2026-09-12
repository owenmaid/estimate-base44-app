import React, { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilePlus, FileText, DollarSign, CheckCircle, Clock, FolderKanban, TrendingUp, CalendarClock, AlertCircle, Pencil, XCircle, Send, AlarmClock } from 'lucide-react';
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


// Warm stat card for the Petro-Chemical Tint dashboard.
function WarmStatCard({ title, value, icon: Icon, accent }) {
  return (
    <div className="group relative rounded-xl border border-border bg-card p-3.5 sm:p-5 flex flex-col gap-2 sm:gap-3 transition-colors hover:border-primary/50 overflow-hidden h-full">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</span>
        <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-muted/40 border border-border">
          <Icon className={`h-5 w-5 sm:h-8 sm:w-8 ${accent}`} />
        </span>
      </div>
      <span className="text-xl sm:text-2xl font-bold text-foreground leading-tight tabular-nums">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const [estimateChartMode, setEstimateChartMode] = useState('value'); // 'value' | 'count'

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

  // Total $ value of estimates grouped by status
  const estimateStatusValue = {
    accepted: estimates.filter(e => e.status === 'accepted').reduce((s, e) => s + (e.total || 0), 0),
    declined: estimates.filter(e => e.status === 'declined').reduce((s, e) => s + (e.total || 0), 0),
    sent: estimates.filter(e => e.status === 'sent').reduce((s, e) => s + (e.total || 0), 0),
    expired: estimates.filter(e => e.status === 'expired').reduce((s, e) => s + (e.total || 0), 0),
    draft: estimates.filter(e => e.status === 'draft').reduce((s, e) => s + (e.total || 0), 0),
  };
  const estimateStatusCount = {
    accepted: estimates.filter(e => e.status === 'accepted').length,
    declined: estimates.filter(e => e.status === 'declined').length,
    sent: estimates.filter(e => e.status === 'sent').length,
    expired: estimates.filter(e => e.status === 'expired').length,
    draft: estimates.filter(e => e.status === 'draft').length,
  };
  const estimateStatusCards = [
    { title: 'Accepted', value: estimateStatusValue.accepted, count: estimateStatusCount.accepted, icon: CheckCircle, accent: 'text-emerald-400' },
    { title: 'Declined', value: estimateStatusValue.declined, count: estimateStatusCount.declined, icon: XCircle, accent: 'text-red-400' },
    { title: 'Sent', value: estimateStatusValue.sent, count: estimateStatusCount.sent, icon: Send, accent: 'text-blue-400' },
    { title: 'Expired', value: estimateStatusValue.expired, count: estimateStatusCount.expired, icon: AlarmClock, accent: 'text-amber-400' },
    { title: 'Draft', value: estimateStatusValue.draft, count: estimateStatusCount.draft, icon: FileText, accent: 'text-primary' },
  ];

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

  // Count estimates that have been converted to / linked with a project
  const linkedEstimatesCount = useMemo(() => {
    const projectNumbers = new Set(projects.map(p => p.project_number).filter(Boolean));
    const projectNames = new Set(projects.map(p => p.name).filter(Boolean));
    return estimates.filter(e =>
      (e.project_number && projectNumbers.has(e.project_number)) ||
      (e.project_name && projectNames.has(e.project_name))
    ).length;
  }, [estimates, projects]);

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
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Full business overview</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects"><FolderKanban className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5" /> Projects</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/estimates/new"><FilePlus className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5" /> New Estimate</Link>
          </Button>
        </div>
      </div>

      {/* Grand total of all estimates + quantity + linked */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.85fr_1.95fr] gap-2 sm:gap-3 items-stretch">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-6">
          <svg className="absolute right-0 top-0 h-full w-1/2 opacity-25 pointer-events-none" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,70 C80,25 160,105 240,65 S400,25 400,70" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
            <path d="M0,90 C80,45 160,125 240,85 S400,45 400,90" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.6" />
            <path d="M0,45 C80,5 160,85 240,45 S400,5 400,45" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          </svg>
          <div className="relative">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-muted-foreground">Total Estimate Value</p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary mt-1 leading-none">
              ${estimateStats.totalValue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-2">across {estimateStats.total} estimate{estimateStats.total === 1 ? '' : 's'}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="group relative rounded-xl border border-border bg-card p-3.5 sm:p-5 flex flex-col gap-2 sm:gap-3 transition-colors hover:border-primary/50 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total Estimates</span>
              <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-muted/40 border border-border">
                <FileText className="h-4 w-4 text-primary" />
              </span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-tight tabular-nums block">{estimateStats.total}</span>
              <span className="text-xs text-muted-foreground mt-1">estimate{estimateStats.total === 1 ? '' : 's'} created</span>
            </div>
          </div>

          <div className="group relative rounded-xl border border-border bg-card p-3.5 sm:p-5 flex flex-col gap-2 sm:gap-3 transition-colors hover:border-primary/50 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Linked to Projects</span>
              <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-muted/40 border border-border">
                <FolderKanban className="h-4 w-4 text-emerald-400" />
              </span>
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-bold text-foreground leading-tight tabular-nums block">{linkedEstimatesCount}</span>
              <span className="text-xs text-muted-foreground mt-1">converted / linked</span>
            </div>
          </div>
        </div>

        <Card className="h-full flex flex-col sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-6 w-6 sm:h-8 sm:w-8 text-primary" /> Upcoming Deadlines
            </CardTitle>
            {overdue.length > 0 && (
              <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs border">
                {overdue.length} overdue
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2 flex-1 overflow-auto">
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
      </div>

      {/* Estimate status values */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {estimateStatusCards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="group relative rounded-xl border border-border bg-card p-3.5 sm:p-5 flex flex-col gap-2 sm:gap-3 transition-colors hover:border-primary/50 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{c.title}</span>
                <span className="flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-lg bg-muted/40 border border-border">
                  <Icon className={`h-5 w-5 sm:h-8 sm:w-8 ${c.accent}`} />
                </span>
              </div>
              <div>
                <span className="text-lg sm:text-2xl font-bold text-foreground leading-tight tabular-nums block">
                  ${c.value.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-muted-foreground mt-1">{c.count} estimate{c.count === 1 ? '' : 's'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Estimate by status + Revenue by month */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Estimates by Status</CardTitle>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
              <Button size="sm" variant={estimateChartMode === 'value' ? 'default' : 'ghost'} className="h-7 px-3 text-xs" onClick={() => setEstimateChartMode('value')}>Totals</Button>
              <Button size="sm" variant={estimateChartMode === 'count' ? 'default' : 'ghost'} className="h-7 px-3 text-xs" onClick={() => setEstimateChartMode('count')}>Quantity</Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart
                data={[
                  { name: 'Accepted', value: estimateStatusValue.accepted, count: estimateStatusCount.accepted },
                  { name: 'Declined', value: estimateStatusValue.declined, count: estimateStatusCount.declined },
                  { name: 'Sent', value: estimateStatusValue.sent, count: estimateStatusCount.sent },
                  { name: 'Expired', value: estimateStatusValue.expired, count: estimateStatusCount.expired },
                  { name: 'Draft', value: estimateStatusValue.draft, count: estimateStatusCount.draft },
                ]}
                margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => estimateChartMode === 'value' ? `$${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={v => estimateChartMode === 'value'
                    ? [`$${Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Value']
                    : [v, 'Quantity']}
                />
                <Line
                  type="monotone"
                  dataKey={estimateChartMode}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  dot={(props) => {
                    const STATUS_COLORS = { Accepted: '#22c55e', Declined: '#ef4444', Sent: '#3b82f6', Expired: '#f59e0b', Draft: '#f97316' };
                    const color = STATUS_COLORS[props.payload.name] || 'hsl(var(--primary))';
                    const { cx, cy } = props;
                    return <circle cx={cx} cy={cy} r={5} fill={color} stroke={color} strokeWidth={0} />;
                  }}
                  activeDot={{ r: 7, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {revenueByMonth.length === 0 ? (
              <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
                No revenue data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
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
      </div>

      {/* Total Revenue hero with pipeline-flow detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-6">
          <svg className="absolute right-0 top-0 h-full w-1/2 opacity-25 pointer-events-none" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,70 C80,25 160,105 240,65 S400,25 400,70" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
            <path d="M0,90 C80,45 160,125 240,85 S400,45 400,90" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.6" />
            <path d="M0,45 C80,5 160,85 240,45 S400,5 400,45" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.4" />
          </svg>
          <div className="relative">
            <p className="text-[10px] sm:text-[11px] uppercase tracking-widest text-muted-foreground">Total Revenue</p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary mt-1 leading-none">
              ${projectStats.totalRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground mt-2">across {projectStats.total} project{projectStats.total === 1 ? '' : 's'}</p>
          </div>
        </div>
      </div>

      {/* Band 1: Project Values chart */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project Values</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No project data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200} className="sm:!h-[240px]">
                <LineChart
                  data={projects.map(p => ({ name: p.name, value: projectEquipmentCost(p, inventoryItems) }))}
                  margin={{ top: 4, right: 4, left: 50, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={60} interval="preserveStartEnd" />
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

      {/* Band 3: Projects Overview */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Projects Overview</h2>
          <Link to="/projects" className="text-sm text-primary hover:underline font-medium">View all</Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Stat cards */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-2 sm:gap-3 content-start">
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
                      <tr className="text-muted-foreground border-b border-border text-[11px] uppercase tracking-wider bg-muted/30">
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium">Project</th>
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium hidden sm:table-cell">Number</th>
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium hidden sm:table-cell">Client</th>
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium">Status</th>
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium hidden sm:table-cell">End Date</th>
                        <th className="text-left px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium hidden sm:table-cell">Estimate</th>
                        <th className="text-right px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium hidden sm:table-cell">Estimate Value</th>
                        <th className="text-right px-3 py-2.5 sm:px-4 sm:py-3.5 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.slice(0, 10).map(p => {
                        const value = projectEquipmentCost(p, inventoryItems);
                        const est = estimateByProject.byNumber[p.project_number] || estimateByProject.byName[p.name];
                        return (
                          <tr key={p.id} className="border-b border-border/40 hover:bg-muted/25 transition-colors">
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                              <Link to={`/project-planning/${p.id}`} className="font-medium text-foreground hover:text-primary">
                                {p.name}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground tabular-nums hidden sm:table-cell">{p.project_number || '—'}</td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground hidden sm:table-cell">{p.client || '—'}</td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                              <Badge className={`text-xs border ${STATUS_STYLES[p.status] || 'bg-muted text-muted-foreground border-border'}`}>
                                {STATUS_LABELS[p.status] || p.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground tabular-nums hidden sm:table-cell">{p.end_date || '—'}</td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground tabular-nums hidden sm:table-cell">
                              {est?.estimate_number || '—'}
                            </td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                              {est && est.subtotal != null ? `$${est.subtotal.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-right font-semibold text-primary tabular-nums">
                              {value > 0 ? `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {projects.length > 0 && (
                      <>
                        {/* Mobile footer (4 visible columns) */}
                        <tfoot className="sm:hidden">
                          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td colSpan={3} className="px-3 py-3 text-right text-muted-foreground uppercase text-[11px] tracking-wider">Total</td>
                            <td className="px-3 py-3 text-right text-primary tabular-nums">
                              ${projects.reduce((s, p) => s + projectEquipmentCost(p, inventoryItems), 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                        {/* Desktop footer (8 visible columns) */}
                        <tfoot className="hidden sm:table-footer-group">
                          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                            <td colSpan={7} className="px-4 py-3.5 text-right text-muted-foreground uppercase text-[11px] tracking-wider">Total Value</td>
                            <td className="px-4 py-3.5 text-right text-primary tabular-nums">
                              ${projects.reduce((s, p) => s + projectEquipmentCost(p, inventoryItems), 0).toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </>
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