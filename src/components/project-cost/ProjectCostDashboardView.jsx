import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area, LineChart, Line } from 'recharts';
import ProjectCostBreakdown from '@/components/projects/ProjectCostBreakdown';
import { CostDashboardHeader, CostKpiCards } from '@/components/project-cost/CostDashboardOverview';
const STATUS_STYLES={active:'bg-green-500/15 text-green-400 border-green-500/30',planning:'bg-blue-500/15 text-blue-400 border-blue-500/30',on_hold:'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',completed:'bg-muted text-muted-foreground border-border'};
const STATUS_LABELS={active:'Active',planning:'Planning',on_hold:'On Hold',completed:'Completed'};
export default function ProjectCostDashboardView({search,setSearch,selectedProject,setSelectedProject,showDropdown,setShowDropdown,chartGranularity,setChartGranularity,equipChartType,setEquipChartType,totalChartType,setTotalChartType,loadingProjects,estimateMap,allProjectsSummary,totalGrandRevenue,filteredProjects,barData,fmt,monthlyAreaData,equipmentAreaData,selectedCosts}) {
  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <CostDashboardHeader />
      <CostKpiCards
        selectedProject={selectedProject}
        hasSelectedCosts={!!selectedCosts}
        estimateMap={estimateMap}
        allProjects={allProjectsSummary}
      />

      {/* Project Selector */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Select a Project to View Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 pr-10"
              placeholder="Search by project name, number, or client..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
            />
            {search && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => { setSearch(''); setShowDropdown(false); }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showDropdown && (search || true) && filteredProjects.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl z-20 max-h-72 overflow-y-auto">
                {filteredProjects.map(p => {
                  const pEntry = allProjectsSummary.find(s => s.id === p.id) || p;
                  const displayTotal = pEntry.estimateTotal ?? pEntry.costs?.grandTotal ?? 0;
                  return (
                    <button
                      key={p.id}
                      className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border last:border-b-0 flex items-center justify-between gap-3"
                      onClick={() => {
                        setSelectedProject(pEntry);
                        setSearch(p.name || '');
                        setShowDropdown(false);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.project_number && <span className="mr-2">#{p.project_number}</span>}
                          {p.client && <span>{p.client}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge className={`text-xs border ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                        {displayTotal > 0 && (
                          <span className="text-xs font-semibold text-primary">{fmt(displayTotal)}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedProject && selectedCosts && (
            <div className="mt-6 border-t border-border pt-6">
              <ProjectCostBreakdown
                project={selectedProject}
                costs={selectedCosts}
                fmt={fmt}
                onClose={() => { setSelectedProject(null); setSearch(''); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Cost Over Time Chart */}
      {selectedProject && equipmentAreaData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm">
                  Equipment Cost Over Time ({chartGranularity === 'day' ? 'by Day' : 'by Month'})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {chartGranularity === 'day'
                    ? `Equipment group costs per working day for: ${selectedProject.name}`
                    : `Equipment group costs grouped by month for: ${selectedProject.name}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                  <button onClick={() => setChartGranularity('month')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Month</button>
                  <button onClick={() => setChartGranularity('day')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Day</button>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                  <button onClick={() => setEquipChartType('line')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipChartType === 'line' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Line</button>
                  <button onClick={() => setEquipChartType('area')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipChartType === 'area' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Area</button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {equipChartType === 'line' ? (
                <LineChart key={`equip-line-${selectedProject?.id}-${chartGranularity}`} data={equipmentAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(equipmentAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`]} />
                  <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => ({ DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[v] || v)} />
                  <Line type="monotone" dataKey="DCSM_EQUIP" name="DCSM_EQUIP" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="VENT_EQUIP" name="VENT_EQUIP" stroke="#eab308" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart key={`equip-area-${selectedProject?.id}-${chartGranularity}`} data={equipmentAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="areaEquipDE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.4} /><stop offset="95%" stopColor="#f97316" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaEquipVE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#eab308" stopOpacity={0.4} /><stop offset="95%" stopColor="#eab308" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(equipmentAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, { DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[name] || name]} />
                  <Legend wrapperStyle={{ fontSize: 9 }} formatter={v => ({ DCSM_EQUIP: 'DCSM Equip', VENT_EQUIP: 'Vent Equip' }[v] || v)} />
                  <Area type="monotone" dataKey="DCSM_EQUIP" name="DCSM_EQUIP" stroke="#f97316" strokeWidth={2} fill="url(#areaEquipDE)" />
                  <Area type="monotone" dataKey="VENT_EQUIP" name="VENT_EQUIP" stroke="#eab308" strokeWidth={2} fill="url(#areaEquipVE)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Monthly / Daily Cost Area Chart */}
      {selectedProject && monthlyAreaData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm">
                  Total Project Cost Over Time ({chartGranularity === 'day' ? 'by Day' : 'by Month'})
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedProject
                    ? chartGranularity === 'day'
                      ? `Exact cost per working day for: ${selectedProject.name}`
                      : `Exact daily costs grouped by month for: ${selectedProject.name}`
                    : "Each project's cost is distributed evenly across its scheduled months and summed per month across all projects."}
                </p>
              </div>
              {selectedProject && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                    <button onClick={() => setChartGranularity('month')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Month</button>
                    <button onClick={() => setChartGranularity('day')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${chartGranularity === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Day</button>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-secondary/30">
                    <button onClick={() => setTotalChartType('line')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${totalChartType === 'line' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Line</button>
                    <button onClick={() => setTotalChartType('area')} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${totalChartType === 'area' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Area</button>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              {totalChartType === 'line' ? (
                <LineChart key={`total-line-${selectedProject?.id}-${chartGranularity}`} data={monthlyAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(monthlyAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : 'Special']} />
                  <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} wrapperStyle={{ fontSize: 9 }} />
                  <Line type="monotone" dataKey="reg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ot" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spec" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              ) : (
                <AreaChart key={`total-area-${selectedProject?.id}-${chartGranularity}`} data={monthlyAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="areaReg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaOT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="areaSpec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={chartGranularity === 'day' ? Math.max(0, Math.floor(monthlyAreaData.length / 12)) : 'preserveStartEnd'} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 9 }} formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : 'Special']} />
                  <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} wrapperStyle={{ fontSize: 9 }} />
                  <Area type="monotone" dataKey="reg" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#areaReg)" />
                  <Area type="monotone" dataKey="ot" stroke="#3b82f6" strokeWidth={2} fill="url(#areaOT)" />
                  <Area type="monotone" dataKey="spec" stroke="#f59e0b" strokeWidth={2} fill="url(#areaSpec)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bar Chart — Top Projects by Cost */}
      {barData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top Projects by Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={504}>
              <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }} barCategoryGap="5%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={(props) => {
                  const { x, y, payload, index } = props;
                  const item = barData[index];
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={0} y={0} dy={10} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={9} fontWeight={600}>{payload.value}</text>
                      {item?.fullName && <text x={0} y={0} dy={20} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{item.fullName.slice(0, 14)}</text>}
                    </g>
                  );
                }} height={40} />
                <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  formatter={(v, name) => [`$${v.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`, name === 'reg' ? 'Regular' : name === 'ot' ? 'Overtime' : name === 'spec' ? 'Special' : 'Total']}
                />
                <Legend formatter={v => v === 'reg' ? 'Regular' : v === 'ot' ? 'Overtime' : 'Special'} />
                <Bar dataKey="reg" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ot" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="spec" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* All Projects Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">All Projects — Cost Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/60 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Number</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Client</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Reg Cost</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">OT Cost</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Special</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Equipment</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {loadingProjects ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading projects...</td></tr>
                ) : allProjectsSummary.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">No projects found</td></tr>
                ) : (
                  allProjectsSummary.map(p => (
                    <tr
                      key={p.id}
                      className={`border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer ${selectedProject?.id === p.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                      onClick={() => { setSelectedProject(p); setSearch(p.name || ''); setShowDropdown(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    >
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.project_number || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.client || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs border ${STATUS_STYLES[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalReg > 0 ? fmt(p.costs.totalReg) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalOT > 0 ? fmt(p.costs.totalOT) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.costs.totalSpec > 0 ? fmt(p.costs.totalSpec) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{p.costs.totalEquipment > 0 ? fmt(p.costs.totalEquipment) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-primary">
                        {p.estimateTotal != null
                          ? <>{fmt(p.estimateTotal)}<span className="ml-1 text-[9px] text-muted-foreground">(est.)</span></>
                          : p.costs.grandTotal > 0 ? fmt(p.costs.grandTotal) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild onClick={e => e.stopPropagation()}>
                          <Link to={`/project-planning/${p.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {allProjectsSummary.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/40 border-t-2 border-border font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-muted-foreground">Totals</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalReg, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalOT, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalSpec, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{fmt(allProjectsSummary.reduce((s, p) => s + p.costs.totalEquipment, 0))}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-primary">{fmt(totalGrandRevenue)}<span className="ml-1 text-[9px] text-muted-foreground">(est.)</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
