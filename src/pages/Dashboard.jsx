import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FilePlus, FileText, DollarSign, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import EstimateTable from '@/components/estimates/EstimateTable';

export default function Dashboard() {
  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list('-created_date'),
  });

  const stats = {
    total: estimates.length,
    totalValue: estimates.reduce((s, e) => s + (e.total || 0), 0),
    accepted: estimates.filter(e => e.status === 'accepted').length,
    pending: estimates.filter(e => e.status === 'draft' || e.status === 'sent').length,
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your estimates</p>
        </div>
        <Link to="/estimates/new">
          <Button className="gap-2">
            <FilePlus className="h-4 w-4" /> New Estimate
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Estimates" value={stats.total} icon={FileText} accent="bg-primary" />
        <StatCard title="Total Value" value={`$${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={DollarSign} accent="bg-green-500" />
        <StatCard title="Accepted" value={stats.accepted} icon={CheckCircle} accent="bg-emerald-500" />
        <StatCard title="Pending" value={stats.pending} icon={Clock} accent="bg-amber-500" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Estimates</h2>
          <Link to="/estimates" className="text-sm text-primary hover:underline font-medium">View all</Link>
        </div>
        <EstimateTable estimates={estimates.slice(0, 5)} isLoading={isLoading} />
      </div>
    </div>
  );
}