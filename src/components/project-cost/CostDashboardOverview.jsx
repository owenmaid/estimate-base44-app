import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, FolderKanban, Package, Truck, Users, Wrench } from 'lucide-react';

const money = (value) => `$${value.toLocaleString('en-CA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export const CostDashboardHeader = memo(function CostDashboardHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Project Cost Dashboard</h1>
        <p className="text-muted-foreground text-[9px] mt-1">Interactive cost breakdown across all projects</p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link to="/projects"><FolderKanban className="h-4 w-4 mr-1.5" /> All Projects</Link>
      </Button>
    </div>
  );
});

const KPI_DEFINITIONS = [
  { key: 'cost', label: 'Total Cost Value', icon: DollarSign, color: 'green', selectedBorder: 'border-green-500/30' },
  { key: 'manpower', label: 'Manpower Cost', icon: Users, color: 'blue', selectedBorder: 'border-blue-500/30' },
  { key: 'equipment', label: 'Equipment Cost', icon: Wrench, color: 'orange', selectedBorder: 'border-orange-500/30' },
  { key: 'logistics', label: 'Logistics Cost', icon: Truck, color: 'purple', selectedBorder: 'border-purple-500/30' },
  { key: 'consumables', label: 'Consumables', icon: Package, color: 'teal', selectedBorder: 'border-teal-500/30' },
];

export const CostKpiCards = memo(function CostKpiCards({
  selectedProject,
  hasSelectedCosts,
  estimateMap,
  allProjects,
}) {
  const { isFiltered, values } = useMemo(() => {
    const filtered = !!selectedProject && hasSelectedCosts;
    const getEstimate = (project) =>
      estimateMap[(project.project_number || '').trim().toLowerCase()] ?? null;
    const select = (key) => {
      if (filtered) return getEstimate(selectedProject)?.[key] ?? 0;
      return allProjects.reduce((sum, project) => sum + (getEstimate(project)?.[key] ?? 0), 0);
    };
    return {
      isFiltered: filtered,
      values: {
        cost: select('subtotal'),
        manpower: select('kpiManpower'),
        equipment: select('kpiEquipment'),
        logistics: select('kpiLogistics'),
        consumables: select('kpiConsumables'),
      },
    };
  }, [selectedProject, hasSelectedCosts, estimateMap, allProjects]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {isFiltered && (
        <div className="col-span-2 lg:col-span-5 flex items-center gap-2 text-xs text-primary bg-primary/8 border border-primary/20 rounded-lg px-3 py-2">
          <FolderKanban className="h-3.5 w-3.5 flex-shrink-0" />
          Showing values for: <span className="font-semibold">{selectedProject.name}</span>
          {selectedProject.project_number && <span className="text-muted-foreground">#{selectedProject.project_number}</span>}
        </div>
      )}
      {KPI_DEFINITIONS.map(({ key, label, icon: Icon, color, selectedBorder }) => (
        <Card key={key} className={isFiltered ? selectedBorder : ''}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
              <div className={`h-8 w-8 rounded-lg bg-${color}-500/15 flex items-center justify-center`}>
                <Icon className={`h-4 w-4 text-${color}-400`} />
              </div>
            </div>
            <div className="text-xl font-bold">{money(values[key])}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {key === 'cost' && !isFiltered ? 'all estimates' : 'from estimate'}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
