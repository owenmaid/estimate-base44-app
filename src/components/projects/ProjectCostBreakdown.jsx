import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ExternalLink, ChevronDown, ChevronUp, Users, Wrench, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

const PIE_COLORS = ['hsl(25,90%,52%)', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];
const PIE_GLOWS = ['rgba(234,115,27,0.7)', 'rgba(59,130,246,0.7)', 'rgba(245,158,11,0.7)', 'rgba(16,185,129,0.7)', 'rgba(139,92,246,0.7)', 'rgba(239,68,68,0.7)'];

export default function ProjectCostBreakdown({ project, costs, fmt, onClose }) {
  const [expanded, setExpanded] = useState(true);

  const { rowCosts, totalReg, totalOT, totalSpec, grandTotal } = costs;

  // Group by category
  const byCategory = rowCosts.reduce((acc, row) => {
    const cat = row.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = { rows: [], total: 0 };
    acc[cat].rows.push(row);
    acc[cat].total += row.total;
    return acc;
  }, {});

  // Pie chart: cost by category
  const pieData = Object.entries(byCategory)
    .filter(([, v]) => v.total > 0)
    .map(([name, v]) => ({ name, value: v.total }));

  // Group by item_group (Manpower vs Equipment)
  const manpowerTotal = rowCosts.filter(r => r.item_group === 'Manpower Group').reduce((s, r) => s + r.total, 0);
  const equipmentTotal = rowCosts.filter(r => r.item_group === 'Equipment Group').reduce((s, r) => s + r.total, 0);
  const otherTotal = grandTotal - manpowerTotal - equipmentTotal;

  const groupPieData = [
    manpowerTotal > 0 && { name: 'Manpower', value: manpowerTotal },
    equipmentTotal > 0 && { name: 'Equipment', value: equipmentTotal },
    otherTotal > 0 && { name: 'Other', value: otherTotal },
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">{project.name}</h2>
            {project.project_number && (
              <span className="text-sm font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">#{project.project_number}</span>
            )}
            <Badge className={`text-xs border ${STATUS_STYLES[project.status]}`}>{STATUS_LABELS[project.status]}</Badge>
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            {project.client && <span>Client: <span className="text-foreground font-medium">{project.client}</span></span>}
            {project.site && <span>Site: <span className="text-foreground font-medium">{project.site}</span></span>}
            {project.location && <span>Location: <span className="text-foreground font-medium">{project.location}</span></span>}
            {project.start_date && project.end_date && (
              <span>{project.start_date} → {project.end_date}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/project-planning/${project.id}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Project
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Grand Total</div>
            <div className="text-2xl font-bold text-primary">{fmt(grandTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Regular</div>
            <div className="text-xl font-bold">{fmt(totalReg)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalReg / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Overtime</div>
            <div className="text-xl font-bold text-blue-400">{fmt(totalOT)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalOT / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Special/Stat</div>
            <div className="text-xl font-bold text-amber-400">{fmt(totalSpec)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalSpec / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      {grandTotal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 text-muted-foreground">Cost by Category</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <defs>
                    {pieData.map((_, i) => (
                      <filter key={i} id={`glow-cat-${i}`} x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feFlood floodColor={PIE_GLOWS[i % PIE_GLOWS.length]} result="color" />
                        <feComposite in="color" in2="coloredBlur" operator="in" result="coloredGlow" />
                        <feMerge><feMergeNode in="coloredGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    ))}
                  </defs>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} stroke="none" strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" strokeWidth={0} filter={`url(#glow-cat-${i})`} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }}
                    formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Cost']}
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 text-muted-foreground">Cost by Group</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <defs>
                    {groupPieData.map((_, i) => (
                      <filter key={i} id={`glow-grp-${i}`} x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feFlood floodColor={PIE_GLOWS[i % PIE_GLOWS.length]} result="color" />
                        <feComposite in="color" in2="coloredBlur" operator="in" result="coloredGlow" />
                        <feMerge><feMergeNode in="coloredGlow" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    ))}
                  </defs>
                  <Pie data={groupPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} stroke="none" strokeWidth={0}>
                    {groupPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" strokeWidth={0} filter={`url(#glow-grp-${i})`} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Cost']}
                  />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Line-item breakdown by category */}
      {rowCosts.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
          No cost data found for this project. Make sure equipment rows are set up in Project Details Setup.
        </div>
      ) : (
        <div className="space-y-4">
          <button
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Detailed Row Breakdown ({rowCosts.length} rows)
          </button>

          {expanded && (
            <div className="space-y-4">
              {Object.entries(byCategory).map(([category, group]) => (
                <div key={category} className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-secondary/60 px-4 py-2.5 flex items-center justify-between">
                    <span className="font-semibold text-sm">{category}</span>
                    <span className="text-sm font-semibold text-primary">{fmt(group.total)}</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/30 border-b border-border">
                        <th className="px-4 py-2 text-left text-muted-foreground">Row / Item</th>
                        <th className="px-4 py-2 text-left text-muted-foreground">Group</th>
                        <th className="px-4 py-2 text-right text-muted-foreground">Reg Cost</th>
                        <th className="px-4 py-2 text-right text-muted-foreground">OT Cost</th>
                        <th className="px-4 py-2 text-right text-muted-foreground">Special</th>
                        <th className="px-4 py-2 text-right text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-b-0 hover:bg-secondary/10">
                          <td className="px-4 py-2.5 font-medium">{row.label}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.item_group}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.regCost > 0 ? fmt(row.regCost) : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-blue-400">{row.otCost > 0 ? fmt(row.otCost) : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-amber-400">{row.specialCost > 0 ? fmt(row.specialCost) : '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold">{row.total > 0 ? fmt(row.total) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}