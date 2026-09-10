import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

// Glass base colors — 20 visually distinct hues, no repeats
const PIE_COLORS = [
  'hsl(25,90%,58%)',   'hsl(217,91%,60%)',  'hsl(158,64%,52%)',  'hsl(0,72%,51%)',
  'hsl(262,83%,58%)',  'hsl(38,92%,50%)',   'hsl(187,100%,42%)', 'hsl(330,80%,55%)',
  'hsl(90,60%,45%)',   'hsl(50,95%,48%)',   'hsl(200,80%,55%)',  'hsl(300,65%,52%)',
  'hsl(15,85%,52%)',   'hsl(240,70%,62%)',  'hsl(130,55%,48%)',  'hsl(350,75%,58%)',
  'hsl(70,70%,44%)',   'hsl(170,60%,46%)',  'hsl(280,75%,60%)',  'hsl(45,100%,52%)',
];
const PIE_GLOWS = [
  'rgba(234,115,27,0.5)',  'rgba(59,130,246,0.5)',  'rgba(16,185,129,0.5)',  'rgba(239,68,68,0.5)',
  'rgba(139,92,246,0.5)',  'rgba(245,158,11,0.5)',  'rgba(0,188,212,0.5)',   'rgba(236,72,153,0.5)',
  'rgba(101,163,13,0.5)',  'rgba(234,179,8,0.5)',   'rgba(14,165,233,0.5)',  'rgba(192,38,211,0.5)',
  'rgba(234,88,12,0.5)',   'rgba(99,102,241,0.5)',  'rgba(22,163,74,0.5)',   'rgba(225,29,72,0.5)',
  'rgba(132,204,22,0.5)',  'rgba(20,184,166,0.5)',  'rgba(168,85,247,0.5)',  'rgba(234,179,8,0.5)',
];
const PIE_SOLID = [
  'hsl(25,90%,70%)',   'hsl(217,91%,72%)',  'hsl(158,64%,65%)',  'hsl(0,72%,65%)',
  'hsl(262,83%,72%)',  'hsl(38,92%,65%)',   'hsl(187,100%,58%)', 'hsl(330,80%,68%)',
  'hsl(90,60%,58%)',   'hsl(50,95%,62%)',   'hsl(200,80%,68%)',  'hsl(300,65%,65%)',
  'hsl(15,85%,65%)',   'hsl(240,70%,74%)',  'hsl(130,55%,62%)',  'hsl(350,75%,70%)',
  'hsl(70,70%,58%)',   'hsl(170,60%,60%)',  'hsl(280,75%,72%)',  'hsl(45,100%,65%)',
];

const toRad = (deg) => (deg * Math.PI) / 180;

const donutPath = (cx, cy, ir, or, startDeg, endDeg) => {
  const start = toRad(-startDeg);
  const end   = toRad(-endDeg);
  const cosS = Math.cos(start), sinS = Math.sin(start);
  const cosE = Math.cos(end),   sinE = Math.sin(end);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${cx + or * cosS} ${cy + or * sinS}`,
    `A ${or} ${or} 0 ${largeArc} 0 ${cx + or * cosE} ${cy + or * sinE}`,
    `L ${cx + ir * cosE} ${cy + ir * sinE}`,
    `A ${ir} ${ir} 0 ${largeArc} 1 ${cx + ir * cosS} ${cy + ir * sinS}`,
    'Z',
  ].join(' ');
};

// Custom arc shape: glass effect — translucent base + specular highlight + rim light + refraction edge
const GlowArc = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, index, prefix } = props;

  const path      = donutPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle);
  // Slightly thinner path for the inner rim glow
  const rimPath   = donutPath(cx, cy, innerRadius + 2, outerRadius - 2, startAngle, endAngle);

  const glowId     = `${prefix}-glow-${index}`;
  const blurId     = `${prefix}-blur-${index}`;
  const shineId    = `${prefix}-shine-${index}`;
  const rimId      = `${prefix}-rim-${index}`;
  const refractId  = `${prefix}-refract-${index}`;

  return (
    <g>
      <defs>
        {/* Soft outer glow */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feFlood floodColor={PIE_GLOWS[index % PIE_GLOWS.length]} result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Frosted-glass inner blur */}
        <filter id={blurId} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Primary specular highlight — top-right */}
        <radialGradient id={shineId} cx="78%" cy="18%" r="55%" fx="78%" fy="18%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.75" />
          <stop offset="30%"  stopColor="white" stopOpacity="0.25" />
          <stop offset="70%"  stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0"    />
        </radialGradient>
        {/* Secondary softer fill from top-left for depth */}
        <radialGradient id={refractId} cx="20%" cy="25%" r="60%" fx="20%" fy="25%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0"    />
        </radialGradient>
        {/* Inner rim light */}
        <linearGradient id={rimId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55" />
          <stop offset="50%"  stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="white" stopOpacity="0.30" />
        </linearGradient>
      </defs>

      {/* 1 — glow halo behind */}
      <path d={path} fill={fill} stroke="none" filter={`url(#${glowId})`} />
      {/* 2 — frosted glass body */}
      <path d={path} fill={fill} stroke="none" filter={`url(#${blurId})`} opacity="0.85" />
      {/* 3 — top-right specular shine */}
      <path d={path} fill={`url(#${shineId})`} stroke="none" />
      {/* 4 — secondary refraction from top-left */}
      <path d={path} fill={`url(#${refractId})`} stroke="none" />
      {/* 5 — bright rim edge stroke */}
      <path d={rimPath} fill="none" stroke={PIE_SOLID[index % PIE_SOLID.length]} strokeWidth="1" opacity="0.6" />
    </g>
  );
};

const makeCatShape  = (i) => (props) => <GlowArc {...props} index={i} prefix="cat" />;
const makeGrpShape  = (i) => (props) => <GlowArc {...props} index={i} prefix="grp" />;

export default function ProjectCostBreakdown({ project, costs, fmt, onClose }) {
  const [expanded, setExpanded] = useState(true);

  const { rowCosts, totalReg, totalOT, totalSpec, grandTotal } = costs;

  const byCategory = rowCosts.reduce((acc, row) => {
    const cat = row.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = { rows: [], total: 0 };
    acc[cat].rows.push(row);
    acc[cat].total += row.total;
    return acc;
  }, {});

  const pieData = Object.entries(byCategory)
    .filter(([, v]) => v.total > 0)
    .map(([name, v]) => ({ name, value: v.total }));

  const manpowerTotal  = rowCosts.filter(r => r.item_group === 'Manpower Group').reduce((s, r) => s + r.total, 0);
  const equipmentTotal = rowCosts.filter(r => r.item_group === 'Equipment Group').reduce((s, r) => s + r.total, 0);
  const otherTotal     = grandTotal - manpowerTotal - equipmentTotal;

  const groupPieData = [
    manpowerTotal  > 0 && { name: 'Manpower',  value: manpowerTotal  },
    equipmentTotal > 0 && { name: 'Equipment', value: equipmentTotal },
    otherTotal     > 0 && { name: 'Other',     value: otherTotal     },
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
            {project.client   && <span>Client:   <span className="text-foreground font-medium">{project.client}</span></span>}
            {project.site     && <span>Site:     <span className="text-foreground font-medium">{project.site}</span></span>}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs text-muted-foreground mb-1 uppercase tracking-wider">Grand Total</div>
            <div className="text-lg sm:text-2xl font-bold text-primary tabular-nums">{fmt(grandTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs text-muted-foreground mb-1 uppercase tracking-wider">Regular</div>
            <div className="text-base sm:text-xl font-bold tabular-nums">{fmt(totalReg)}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalReg / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs text-muted-foreground mb-1 uppercase tracking-wider">Overtime</div>
            <div className="text-base sm:text-xl font-bold text-blue-400 tabular-nums">{fmt(totalOT)}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalOT / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-[10px] sm:text-xs text-muted-foreground mb-1 uppercase tracking-wider">Special/Stat</div>
            <div className="text-base sm:text-xl font-bold text-amber-400 tabular-nums">{fmt(totalSpec)}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{grandTotal > 0 ? ((totalSpec / grandTotal) * 100).toFixed(1) : 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      {grandTotal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="text-sm font-semibold mb-3 text-muted-foreground">Cost by Category</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Legend — above chart on mobile, left on desktop */}
                <div className="flex flex-col gap-1.5 flex-shrink-0 sm:max-w-[50%]">
                  {pieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[9px] text-muted-foreground flex-1 truncate">{entry.name}</span>
                      <span className="text-[9px] font-semibold text-foreground text-left" style={{ minWidth: '60px' }}>${entry.value.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                  ))}
                </div>
                {/* Doughnut chart */}
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={180} className="sm:!h-[234px]">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} stroke="none" strokeWidth={0}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" strokeWidth={0} shape={makeCatShape(i)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 9, color: '#000000' }}
                        formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Cost']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="text-sm font-semibold mb-3 text-muted-foreground">Cost by Group</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Legend */}
                <div className="flex flex-col gap-2 flex-shrink-0 sm:max-w-[45%]">
                  {groupPieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[10px] text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
                {/* Doughnut chart */}
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={200} className="sm:!h-[260px]">
                    <PieChart>
                      <Pie data={groupPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={84} dataKey="value" paddingAngle={2} stroke="none" strokeWidth={0}>
                        {groupPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" strokeWidth={0} shape={makeGrpShape(i)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, color: '#000000' }}
                        formatter={v => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, 'Cost']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
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
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Detailed Row Breakdown ({rowCosts.length} rows)
          </button>

          {expanded && (
            <div className="space-y-4">
              {Object.entries(byCategory).map(([category, group]) => (
                <div key={category} className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-secondary/60 px-3 sm:px-4 py-2.5 flex items-center justify-between">
                    <span className="font-semibold text-sm truncate">{category}</span>
                    <span className="text-sm font-semibold text-primary whitespace-nowrap ml-2">{fmt(group.total)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs table-fixed min-w-[480px]">
                      <colgroup>
                        <col className="w-[40%]" />
                        <col className="w-[16%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-secondary/30 border-b border-border">
                          <th className="px-3 sm:px-4 py-2 text-left text-muted-foreground">Row / Item</th>
                          <th className="px-3 sm:px-4 py-2 text-left text-muted-foreground">Group</th>
                          <th className="px-3 sm:px-4 py-2 text-right text-muted-foreground">Reg Cost</th>
                          <th className="px-3 sm:px-4 py-2 text-right text-muted-foreground">OT Cost</th>
                          <th className="px-3 sm:px-4 py-2 text-right text-muted-foreground">Special</th>
                          <th className="px-3 sm:px-4 py-2 text-right text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, i) => (
                          <tr key={i} className="border-b border-border last:border-b-0 hover:bg-secondary/10">
                            <td className="px-3 sm:px-4 py-2.5 font-medium truncate" title={row.label}>{row.label}</td>
                            <td className="px-3 sm:px-4 py-2.5 text-muted-foreground truncate" title={row.item_group}>{row.item_group}</td>
                            <td className="px-3 sm:px-4 py-2.5 text-right font-mono">{row.regCost > 0 ? fmt(row.regCost) : '—'}</td>
                            <td className="px-3 sm:px-4 py-2.5 text-right font-mono text-blue-400">{row.otCost > 0 ? fmt(row.otCost) : '—'}</td>
                            <td className="px-3 sm:px-4 py-2.5 text-right font-mono text-amber-400">{row.specialCost > 0 ? fmt(row.specialCost) : '—'}</td>
                            <td className="px-3 sm:px-4 py-2.5 text-right font-mono font-semibold">{row.total > 0 ? fmt(row.total) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}