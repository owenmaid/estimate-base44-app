import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { Users, CheckCircle2, Circle, AlertTriangle, ChevronDown, ChevronRight, Package } from 'lucide-react';

const DEFAULT_CAPACITY = 10; // fallback if no manpower SKU found

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

function WorkloadBar({ used, capacity }) {
  const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 100;
  const color = pct <= 60 ? 'bg-green-500' : pct <= 85 ? 'bg-yellow-500' : 'bg-destructive';

  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-[120px] sm:min-w-[180px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-24 text-right tabular-nums">
        {used} / {capacity} items
      </span>
    </div>
  );
}

function MemberRow({ member }) {
  const [expanded, setExpanded] = useState(false);
  const { used, capacity } = member;
  const pct = capacity > 0 ? (used / capacity) * 100 : 100;

  const burnoutRisk = pct > 85;
  const elevated = pct > 60;
  const doneTasks = member.tasks.filter(t => t.done).length;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-1.5 sm:py-2 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          burnoutRisk ? 'bg-destructive/20 text-destructive' :
          elevated    ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-primary/15 text-primary'
        }`}>
          {member.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{member.name}</span>
            {burnoutRisk && (
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] border flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" /> Over Capacity
              </Badge>
            )}
            {member.inventoryItem && (
              <Badge className="bg-muted text-muted-foreground border-border text-[10px] border">
                {member.inventoryItem.sku || member.inventoryItem.name}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {member.projectCount} project{member.projectCount !== 1 ? 's' : ''} · {doneTasks}/{used} line items done
            {member.inventoryItem && (
              <span className="ml-1">· capacity from inventory</span>
            )}
          </p>
        </div>

        <WorkloadBar used={used} capacity={capacity} />

        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 divide-y divide-border/50">
          {member.projectBreakdown.map(({ project, tasks }) => (
            <div key={project.id} className="px-5 py-1.5">
              <div className="flex items-center gap-2 mb-1">
                <Link to={`/project-planning/${project.id}`} className="text-sm font-medium hover:text-primary transition-colors">
                  {project.name}
                </Link>
                <Badge className={`text-[10px] border ${STATUS_STYLES[project.status]}`}>
                  {STATUS_LABELS[project.status]}
                </Badge>
                {project.client && (
                  <span className="text-xs text-muted-foreground">· {project.client}</span>
                )}
              </div>
              <div className="space-y-1.5 ml-2">
                {(() => {
                  const groups = {};
                  tasks.forEach(t => {
                    const key = t.type || 'Uncategorized';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(t);
                  });
                  const orderedKeys = Object.keys(groups).sort((a, b) => {
                    if (a === 'Uncategorized') return 1;
                    if (b === 'Uncategorized') return -1;
                    return a.localeCompare(b);
                  });
                  return orderedKeys.map(type => (
                    <div key={type}>
                      <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-0.5">{type}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                        {groups[type].map(task => (
                          <div key={task.id} className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                            {task.done
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              : <Circle className="h-3.5 w-3.5 shrink-0" />
                            }
                            <span className={`truncate ${task.done ? 'line-through opacity-60' : ''}`}>{task.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResourceAllocation() {
  const [selectedMember, setSelectedMember] = useState('');

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: inventoryItems = [], isLoading: loadingInventory } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Build a lookup: lowercased name/sku → inventory item (direct & indirect labour categories)
  const manpowerLookup = useMemo(() => {
    const map = {};
    const labourCategories = ['direct labour', 'indirect labour'];
    inventoryItems
      .filter(i => labourCategories.includes(i.category?.toLowerCase()))
      .forEach(item => {
        if (item.name) map[item.name.toLowerCase()] = item;
        if (item.sku)  map[item.sku.toLowerCase()]  = item;
      });
    return map;
  }, [inventoryItems]);

  // Aggregate tasks by assignee across all projects
  const memberMap = useMemo(() => {
    const map = {};
    projects.forEach(project => {
      (project.task_list || []).forEach(task => {
        const assignee = task.assignee?.trim();
        if (!assignee) return;
        if (!map[assignee]) {
          map[assignee] = { name: assignee, tasks: [], projectBreakdown: {}, projectCount: 0 };
        }
        map[assignee].tasks.push({ ...task, projectId: project.id });
        if (!map[assignee].projectBreakdown[project.id]) {
          map[assignee].projectBreakdown[project.id] = { project, tasks: [] };
          map[assignee].projectCount++;
        }
        map[assignee].projectBreakdown[project.id].tasks.push(task);
      });
    });

    return Object.values(map).map(m => {
      const key = m.name.toLowerCase();
      const inventoryItem = manpowerLookup[key] || null;
      const capacity = inventoryItem ? (inventoryItem.quantity || DEFAULT_CAPACITY) : DEFAULT_CAPACITY;
      return {
        ...m,
        projectBreakdown: Object.values(m.projectBreakdown),
        used: m.tasks.length,
        capacity,
        inventoryItem,
      };
    }).sort((a, b) => (b.used / b.capacity) - (a.used / a.capacity));
  }, [projects, manpowerLookup]);

  // Manpower inventory items for the dropdown (exclude CONVENTIONAL group)
  const manpowerOptions = useMemo(() => {
    const isConventional = (i) => {
      const fields = [i.item_group, i.sub_group_01, i.sub_group_02].filter(Boolean).join(' ').toLowerCase();
      return fields.includes('conventional');
    };
    return inventoryItems
      .filter(i => {
        const isManpower = i.item_group?.toLowerCase() === 'manpower group' ||
          ['direct labour', 'indirect labour'].includes(i.category?.toLowerCase());
        return isManpower && !isConventional(i);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [inventoryItems]);

  const filtered = useMemo(() => {
    if (!selectedMember || selectedMember === 'all') return memberMap;
    return memberMap.filter(m => m.name.toLowerCase() === selectedMember.toLowerCase());
  }, [memberMap, selectedMember]);

  const isLoading = loadingProjects || loadingInventory;

  // Summary stats
  const totalUsed = memberMap.reduce((s, m) => s + m.used, 0);
  const totalCapacity = memberMap.reduce((s, m) => s + m.capacity, 0);
  const overCapacityCount = memberMap.filter(m => m.used > m.capacity).length;
  const unassignedCount = projects.reduce((s, p) => s + (p.task_list || []).filter(t => !t.assignee?.trim()).length, 0);
  const manpowerCount = inventoryItems.filter(i => ['direct labour', 'indirect labour'].includes(i.category?.toLowerCase())).length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Resource Allocation</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Team workload driven by Direct & Indirect Labour inventory capacity
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Team Members</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{memberMap.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Line Items Used / Capacity</p>
            <p className="text-xl sm:text-2xl font-bold mt-1">{totalUsed} <span className="text-base text-muted-foreground font-normal">/ {totalCapacity}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Over Capacity</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${overCapacityCount > 0 ? 'text-destructive' : ''}`}>{overCapacityCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Unassigned Line Items</p>
            <p className={`text-xl sm:text-2xl font-bold mt-1 ${unassignedCount > 0 ? 'text-yellow-400' : ''}`}>{unassignedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Manpower inventory note */}
      {manpowerCount === 0 && !loadingInventory && (
        <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
          <Package className="h-4 w-4 shrink-0" />
          <span>No <strong>Direct Labour</strong> or <strong>Indirect Labour</strong> category items found in Inventory. Add items with those categories to set per-person capacity. Showing default capacity of {DEFAULT_CAPACITY} line items.</span>
        </div>
      )}

      {/* Filter dropdown */}
      <div className="max-w-sm">
        <Select value={selectedMember} onValueChange={setSelectedMember}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a manpower resource..." />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="all">All</SelectItem>
            {manpowerOptions.map(item => (
              <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Workload legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /> Low (≤60% of capacity)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-yellow-500" /> Moderate (61–85%)</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-destructive" /> Over Capacity (&gt;85%)</div>
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-muted rounded-xl" />)}
        </div>
      ) : memberMap.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground text-sm font-medium">No assignees found</p>
            <p className="text-muted-foreground text-xs">Add assignee names to line items in Project Planning to track workload here.</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No team members match the selected resource.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(member => (
            <MemberRow key={member.name} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}