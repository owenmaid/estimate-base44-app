import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';

const STATUS_STYLES = {
  active:    'bg-green-500/15 text-green-400 border-green-500/30',
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-muted text-muted-foreground border-border',
};
const STATUS_LABELS = { active: 'Active', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed' };

// Vivid solid base colors for glass
const GLASS_BASE  = ['#f97316','#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444'];
const GLASS_LIGHT = ['#fdba74','#93c5fd','#fcd34d','#6ee7b7','#c4b5fd','#fca5a5'];
const GLASS_GLOW  = ['rgba(249,115,22,0.6)','rgba(59,130,246,0.6)','rgba(245,158,11,0.6)','rgba(16,185,129,0.6)','rgba(139,92,246,0.6)','rgba(239,68,68,0.6)'];

const toRad = (deg) => (deg * Math.PI) / 180;

const makeArcPath = (cx, cy, ir, or, startDeg, endDeg) => {
  const s = toRad(startDeg - 90);
  const e = toRad(endDeg - 90);
  const cosS = Math.cos(s), sinS = Math.sin(s);
  const cosE = Math.cos(e), sinE = Math.sin(e);
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${cx + or * cosS} ${cy + or * sinS}`,
    `A ${or} ${or} 0 ${large} 1 ${cx + or * cosE} ${cy + or * sinE}`,
    `L ${cx + ir * cosE} ${cy + ir * sinE}`,
    `A ${ir} ${ir} 0 ${large} 0 ${cx + ir * cosS} ${cy + ir * sinS}`,
    'Z',
  ].join(' ');
};

// Pure SVG glass donut — no Recharts
const GlassDonut = ({ data, size = 200, innerR = 55, outerR = 88, id }) => {
  const [hovered, setHovered] = useState(null);
  const cx = size / 2, cy = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  // Build slices
  let cursor = 0;
  const slices = data.map((d, i) => {
    const pct = d.value / total;
    const startDeg = cursor;
    const endDeg = cursor + pct * 360 - 1.5; // 1.5° gap
    cursor += pct * 360;
    return { ...d, i, startDeg, endDeg };
  });

  const fmtVal = (v) => `$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        <defs>
          {slices.map(({ i }) => {
            const base  = GLASS_BASE[i % GLASS_BASE.length];
            const light = GLASS_LIGHT[i % GLASS_LIGHT.length];
            return (
              <React.Fragment key={i}>
                {/* Glow filter */}
                <filter id={`${id}-glow-${i}`} x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feFlood floodColor={GLASS_GLOW[i % GLASS_GLOW.length]} result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Main body gradient: dark at bottom-left, lit at top-right */}
                <linearGradient id={`${id}-body-${i}`} x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor={light} stopOpacity="0.95" />
                  <stop offset="40%"  stopColor={base}  stopOpacity="0.75" />
                  <stop offset="100%" stopColor={base}  stopOpacity="0.35" />
                </linearGradient>
                {/* Specular highlight: bright streak top-right */}
                <radialGradient id={`${id}-spec-${i}`} cx="72%" cy="18%" r="50%" fx="72%" fy="18%">
                  <stop offset="0%"   stopColor="white" stopOpacity="0.90" />
                  <stop offset="25%"  stopColor="white" stopOpacity="0.40" />
                  <stop offset="60%"  stopColor="white" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="white" stopOpacity="0"    />
                </radialGradient>
                {/* Bottom shadow / refraction tint */}
                <radialGradient id={`${id}-shadow-${i}`} cx="25%" cy="85%" r="55%" fx="25%" fy="85%">
                  <stop offset="0%"   stopColor="black" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="black" stopOpacity="0"    />
                </radialGradient>
                {/* Thin bright rim stroke gradient */}
                <linearGradient id={`${id}-rim-${i}`} x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="white" stopOpacity="0.90" />
                  <stop offset="50%"  stopColor={light} stopOpacity="0.40" />
                  <stop offset="100%" stopColor={base}  stopOpacity="0.10" />
                </linearGradient>
              </React.Fragment>
            );
          })}
        </defs>

        {slices.map(({ i, startDeg, endDeg, name, value }) => {
          const path    = makeArcPath(cx, cy, innerR, outerR, startDeg, endDeg);
          const rimPath = makeArcPath(cx, cy, innerR + 1.5, outerR - 1.5, startDeg, endDeg);
          const isHov   = hovered === i;
          const scale   = isHov ? 1.04 : 1;
          return (
            <g key={i}
              style={{ cursor: 'pointer', transform: `scale(${scale})`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 0.15s ease' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Glow halo */}
              <path d={path} fill={`url(#${id}-body-${i})`} stroke="none" filter={`url(#${id}-glow-${i})`} opacity="0.5" />
              {/* Glass body */}
              <path d={path} fill={`url(#${id}-body-${i})`} stroke="none" />
              {/* Shadow / depth at bottom */}
              <path d={path} fill={`url(#${id}-shadow-${i})`} stroke="none" />
              {/* Specular highlight top-right */}
              <path d={path} fill={`url(#${id}-spec-${i})`} stroke="none" />
              {/* Rim stroke */}
              <path d={rimPath} fill="none" stroke={`url(#${id}-rim-${i})`} strokeWidth="1.5" />
            </g>
          );
        })}

        {/* Centre label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="9" opacity="0.6" fontFamily="sans-serif">TOTAL</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="white" fontSize="10" fontWeight="600" fontFamily="sans-serif">
          {fmtVal(total)}
        </text>

        {/* Hover tooltip inside SVG */}
        {hovered !== null && (() => {
          const sl = slices[hovered];
          const pct = ((sl.value / total) * 100).toFixed(1);
          const midDeg = (sl.startDeg + sl.endDeg) / 2;
          const mid = toRad(midDeg - 90);
          const labelR = outerR + 22;
          const lx = cx + labelR * Math.cos(mid);
          const ly = cy + labelR * Math.sin(mid);
          const boxW = 90, boxH = 34;
          const bx = Math.min(Math.max(lx - boxW / 2, 4), size - boxW - 4);
          const by = Math.min(Math.max(ly - boxH / 2, 4), size - boxH - 4);
          return (
            <g>
              <rect x={bx} y={by} width={boxW} height={boxH} rx="5" fill="white" stroke="#e5e7eb" strokeWidth="1" />
              <text x={bx + boxW / 2} y={by + 13} textAnchor="middle" fill="#111" fontSize="8" fontWeight="600" fontFamily="sans-serif">{sl.name}</text>
              <text x={bx + boxW / 2} y={by + 26} textAnchor="middle" fill="#374151" fontSize="8" fontFamily="sans-serif">{fmtVal(sl.value)} · {pct}%</text>
            </g>
          );
        })()}
      </svg>

      {/* Legend below */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center', marginTop: 8 }}>
        {slices.map(({ i, name }) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--muted-foreground)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GLASS_BASE[i % GLASS_BASE.length], flexShrink: 0 }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
};

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
              <GlassDonut data={pieData} size={220} innerR={55} outerR={90} id="cat" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 text-muted-foreground">Cost by Group</div>
              <GlassDonut data={groupPieData} size={220} innerR={55} outerR={90} id="grp" />
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