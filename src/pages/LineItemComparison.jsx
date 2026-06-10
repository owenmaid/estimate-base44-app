import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle, CheckCircle2, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LineItemComparison() {
  const [search, setSearch] = useState('');

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: estimates = [], isLoading: loadingEstimates } = useQuery({
    queryKey: ['estimates-all'],
    queryFn: () => base44.entities.Estimate.list(),
  });

  // For each project number, build the set of row labels from Project Details Setup
  // and the set of leaf item descriptions from the matching estimate
  const comparisonData = useMemo(() => {
    const results = [];

    const isHeader = (desc) => /[\[\]]/.test(desc || '');
    const isSpacer = (desc) => (desc || '') === '__SPACER__';
    const isSectionMarker = (desc) => (desc || '').startsWith('__SECTION__:');

    projects.forEach(project => {
      const pn = (project.project_number || '').trim();
      if (!pn) return;
      const pnLower = pn.toLowerCase();

      // Schedule rows from Project Details Setup
      const scheduleLabels = (project.equipment_rows || [])
        .map(r => (r.label || '').trim())
        .filter(Boolean);

      // Find matching estimate by project_number
      const estimate = estimates.find(
        e => (e.project_number || '').trim().toLowerCase() === pnLower
      );

      // Leaf items from the estimate (non-section-marker, non-header, non-spacer)
      const estimateLeafs = estimate
        ? (estimate.line_items || [])
            .filter(item =>
              !isSectionMarker(item.description) &&
              !isHeader(item.description) &&
              !isSpacer(item.description) &&
              (item.description || '').trim()
            )
            .map(item => (item.description || '').trim())
        : [];

      const scheduleSet = new Set(scheduleLabels.map(l => l.toLowerCase()));
      const estimateSet = new Set(estimateLeafs.map(l => l.toLowerCase()));

      // Items in schedule but NOT in estimate
      const onlyInSchedule = scheduleLabels.filter(
        l => !estimateSet.has(l.toLowerCase())
      );

      // Items in estimate but NOT in schedule
      const onlyInEstimate = estimateLeafs.filter(
        l => !scheduleSet.has(l.toLowerCase())
      );

      // Only include projects that have at least one row or estimate item
      if (scheduleLabels.length === 0 && estimateLeafs.length === 0) return;

      results.push({
        projectId: project.id,
        projectName: project.name,
        projectNumber: pn,
        client: project.client || '—',
        status: project.status,
        hasEstimate: !!estimate,
        estimateNumber: estimate?.estimate_number || null,
        scheduleCount: scheduleLabels.length,
        estimateLeafCount: estimateLeafs.length,
        onlyInSchedule,
        onlyInEstimate,
        matchCount: scheduleLabels.filter(l => estimateSet.has(l.toLowerCase())).length,
      });
    });

    return results;
  }, [projects, estimates]);

  const filtered = useMemo(() => {
    if (!search.trim()) return comparisonData;
    const q = search.toLowerCase();
    return comparisonData.filter(
      r =>
        r.projectName?.toLowerCase().includes(q) ||
        r.projectNumber?.toLowerCase().includes(q) ||
        r.client?.toLowerCase().includes(q)
    );
  }, [comparisonData, search]);

  const isLoading = loadingProjects || loadingEstimates;

  const STATUS_STYLES = {
    active:    'bg-green-500/15 text-green-400 border-green-500/30',
    planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    on_hold:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    completed: 'bg-muted text-muted-foreground border-border',
  };

  const totalMismatched = filtered.filter(
    r => r.onlyInSchedule.length > 0 || r.onlyInEstimate.length > 0
  ).length;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Line Item Comparison</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Items present in Project Details Setup but missing from the Estimate, and vice versa — matched by project number.
          </p>
        </div>
        <Link
          to="/project-details-setup"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <FolderKanban className="h-3.5 w-3.5" /> Project Details Setup
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-xs"
          placeholder="Search project name, number, client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Summary badges */}
      {!isLoading && (
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="text-muted-foreground">{filtered.length} project{filtered.length !== 1 ? 's' : ''} with a project number</span>
          {totalMismatched > 0 && (
            <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 border text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {totalMismatched} with mismatches
            </Badge>
          )}
          {totalMismatched === 0 && filtered.length > 0 && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 border text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              All matched
            </Badge>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading data…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No projects with a project number found.
        </div>
      )}

      {/* Comparison Cards */}
      <div className="space-y-4">
        {filtered.map(row => {
          const hasMismatch = row.onlyInSchedule.length > 0 || row.onlyInEstimate.length > 0;
          return (
            <Card key={row.projectId} className={hasMismatch ? 'border-yellow-500/30' : 'border-green-500/20'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{row.projectName}</span>
                    <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">#{row.projectNumber}</span>
                    {row.client !== '—' && <span className="text-xs text-muted-foreground">{row.client}</span>}
                    <Badge className={`text-xs border ${STATUS_STYLES[row.status] || STATUS_STYLES.planning}`}>
                      {row.status}
                    </Badge>
                    {!row.hasEstimate && (
                      <Badge className="text-xs border bg-rose-500/10 text-rose-400 border-rose-500/30">No estimate</Badge>
                    )}
                    {row.hasEstimate && row.estimateNumber && (
                      <Badge className="text-xs border bg-secondary text-muted-foreground border-border">{row.estimateNumber}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>{row.scheduleCount} schedule rows</span>
                    <span>·</span>
                    <span>{row.estimateLeafCount} estimate items</span>
                    <span>·</span>
                    <span className="text-green-400">{row.matchCount} matched</span>
                    {hasMismatch ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {hasMismatch && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* In Schedule, NOT in Estimate */}
                    {row.onlyInSchedule.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          In Schedule — missing from Estimate ({row.onlyInSchedule.length})
                        </p>
                        <div className="space-y-1">
                          {row.onlyInSchedule.map((label, i) => (
                            <div
                              key={i}
                              className="text-xs px-2.5 py-1.5 rounded bg-orange-500/8 border border-orange-500/20 text-foreground font-mono"
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* In Estimate, NOT in Schedule */}
                    {row.onlyInEstimate.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          In Estimate — missing from Schedule ({row.onlyInEstimate.length})
                        </p>
                        <div className="space-y-1">
                          {row.onlyInEstimate.map((label, i) => (
                            <div
                              key={i}
                              className="text-xs px-2.5 py-1.5 rounded bg-blue-500/8 border border-blue-500/20 text-foreground font-mono"
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}

              {!hasMismatch && (
                <CardContent className="pt-0">
                  <p className="text-xs text-green-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All {row.matchCount} item{row.matchCount !== 1 ? 's' : ''} match between schedule and estimate.
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}