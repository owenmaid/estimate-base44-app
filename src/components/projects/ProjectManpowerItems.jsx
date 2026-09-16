import React from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';

const isManpowerType = (type) => {
  const t = (type || '').toUpperCase();
  return t === 'DIRECT LABOUR' || t === 'INDIRECT LABOUR';
};

const fmt = (n) => (n != null && !isNaN(n) && Number(n) !== 0)
  ? Number(n).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
  : '—';

export default function ProjectManpowerItems({ project }) {
  const items = (project.task_list || []).filter(t => isManpowerType(t.type));

  return (
    <div className="px-4 pb-4 pt-1 bg-muted/10">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Users className="h-3.5 w-3.5" />
        Manpower Line Items ({items.length})
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic pl-6">
          No manpower line items on this project.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 pr-3 font-medium">Item</th>
                <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                <th className="text-left py-1.5 pr-3 font-medium">Assignee</th>
                <th className="text-right py-1.5 pr-3 font-medium">Days</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 font-medium">{item.name || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{item.type || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{item.assignee || '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-muted-foreground">{item.quantity ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export { isManpowerType };