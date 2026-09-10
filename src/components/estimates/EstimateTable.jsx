import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';

const statusStyles = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
};

export default function EstimateTable({ estimates, isLoading }) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="p-4 space-y-3">
          {Array(5).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!estimates || estimates.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 px-4">
        <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-foreground">No estimates yet</p>
        <p className="text-sm text-muted-foreground mt-1">Create your first estimate to get started.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Estimate #</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">Project</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Total</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {estimates.map(est => (
              <TableRow
                key={est.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`/estimates/${est.id}`)}
              >
                <TableCell className="font-medium">{est.estimate_number || '—'}</TableCell>
                <TableCell>{est.client_name}</TableCell>
                <TableCell className="text-muted-foreground">{est.project_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(est.created_date), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="font-semibold">${(est.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell>
                  <Badge className={statusStyles[est.status] || statusStyles.draft}>
                    {est.status || 'draft'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}