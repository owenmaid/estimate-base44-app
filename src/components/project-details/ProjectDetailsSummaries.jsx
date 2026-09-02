import React, { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, DollarSign, Users, Wrench } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const formatHolidayDate = (date) => {
  try {
    return date ? format(parseISO(date), 'EEE, MMM d yyyy') : '—';
  } catch {
    return date || '—';
  }
};

export const StatHolidaySummary = memo(function StatHolidaySummary({ holidays, startDate, endDate }) {
  if (!holidays.length) return null;

  const range = startDate && endDate
    ? `${format(parseISO(startDate), 'MMM d, yyyy')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`
    : '';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Canadian Stat Holidays
          <span className="text-xs text-muted-foreground font-normal ml-1">{range}</span>
          <Badge variant="secondary" className="ml-auto">{holidays.length} found</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-secondary/60 border-b border-border">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Date</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Holiday</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Provinces / Scope</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday, index) => (
              <tr key={holiday.date || index} className="border-b border-border hover:bg-secondary/20">
                <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">
                  {formatHolidayDate(holiday.date)}
                </td>
                <td className="px-4 py-2 text-foreground">{holiday.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{holiday.provinces}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
});

export const ProjectCostSummary = memo(function ProjectCostSummary({
  selectedProjectId,
  equipmentRows,
  equipmentInventory,
  rowCosts,
}) {
  const summary = useMemo(() => {
    if (!selectedProjectId || !equipmentRows.length) return null;

    const getEntry = (row) =>
      equipmentInventory.find(item => item.id === row.item_id)
      ?? equipmentInventory.find(item =>
        (item.name || '').toLowerCase() === (row.label || '').toLowerCase()
        || (item.sku || '').toLowerCase() === (row.label || '').toLowerCase()
      );
    const sumCosts = (rows) => rows.reduce((sum, row) => {
      const costs = rowCosts[row.id] || {};
      return sum + (costs.regCost || 0) + (costs.otCost || 0) + (costs.specialCost || 0);
    }, 0);
    const isDcsmEquipment = (group) => ['EQUIPMENT', 'LOGISTICS', 'CONSUMABLES'].includes(group);
    const isVentEquipment = (group) => ['EQUIPMENT', 'LOGISTICS', 'CONSUMABLES', 'SHIPPING', 'SECUREMENT'].includes(group);
    const selectRows = (group, subgroupTest) => equipmentRows.filter(row => {
      const entry = getEntry(row);
      return entry?.sub_group_01 === group && subgroupTest(entry?.sub_group_02);
    });

    const groups = [
      { label: 'DCSM Manpower', rows: selectRows('DCSM', value => value === 'MANPOWER'), icon: Users, color: 'text-blue-400' },
      { label: 'Ventilation Manpower', rows: selectRows('VENTILATION', value => value === 'MANPOWER'), icon: Users, color: 'text-cyan-400' },
      { label: 'DCSM Equipment', rows: selectRows('DCSM', isDcsmEquipment), icon: Wrench, color: 'text-orange-400' },
      { label: 'Ventilation Equipment', rows: selectRows('VENTILATION', isVentEquipment), icon: Wrench, color: 'text-yellow-400' },
      { label: 'Conventional Costs', rows: selectRows('CONVENTIONAL', () => true), icon: DollarSign, color: 'text-rose-400' },
    ].map(group => ({ ...group, value: sumCosts(group.rows) }));

    return {
      groups,
      conventional: groups[4],
      grandTotal: groups.slice(0, 4).reduce((sum, group) => sum + group.value, 0),
    };
  }, [selectedProjectId, equipmentRows, equipmentInventory, rowCosts]);

  if (!summary) return null;
  const money = (value) => value.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Cost Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-6 gap-3 mb-3">
          {summary.groups.map(group => {
            const Icon = group.icon;
            return (
              <div key={group.label} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/40 border border-border">
                <Icon className={`h-5 w-5 ${group.color} shrink-0`} />
                <div>
                  <p className="text-xs text-muted-foreground">{group.label}</p>
                  <p className="text-sm font-bold text-foreground">{money(group.value)}</p>
                  <p className="text-xs text-muted-foreground">{group.rows.length} row{group.rows.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <DollarSign className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Project Cost</p>
              <p className="text-sm font-bold text-primary">{money(summary.grandTotal)}</p>
              <p className="text-xs text-muted-foreground">{equipmentRows.length} row{equipmentRows.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        {summary.conventional.rows.length > 0 && (
          <p className="text-xs text-muted-foreground italic mt-1">
            * Conventional Costs{summary.conventional.value > 0 ? ` (${money(summary.conventional.value)})` : ''} not included in Total Project Cost.
          </p>
        )}
      </CardContent>
    </Card>
  );
});
