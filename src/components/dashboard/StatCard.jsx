import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, icon: Icon, accent }) {
  return (
    <Card className="relative overflow-hidden p-5 group hover:shadow-md transition-shadow">
      <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-6 translate-x-6 opacity-10", accent)} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
        </div>
        <div className={cn("p-2.5 rounded-xl", accent, "bg-opacity-15")}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}