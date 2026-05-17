import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Pencil, Trash2, Calendar, Mail, Phone, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import EstimateForm from '@/components/estimates/EstimateForm';

const statusStyles = {
  draft: "bg-secondary text-secondary-foreground",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
};

export default function EstimateDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = window.location.pathname.split('/').pop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list(),
  });

  const estimate = estimates.find(e => e.id === id);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Estimate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      setEditing(false);
      toast.success('Estimate updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Estimate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      navigate('/estimates');
      toast.success('Estimate deleted');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Estimate not found.</p>
        <Button variant="link" onClick={() => navigate('/estimates')}>Go back</Button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setEditing(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Edit Estimate</h1>
        </div>
        <EstimateForm initialData={estimate} onSubmit={updateMutation.mutate} isSubmitting={updateMutation.isPending} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/estimates')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{estimate.estimate_number || 'Estimate'}</h1>
              <Badge className={statusStyles[estimate.status] || statusStyles.draft}>{estimate.status || 'draft'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{estimate.project_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this estimate?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <p className="font-semibold text-base">{estimate.client_name}</p>
            {estimate.client_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {estimate.client_email}
              </div>
            )}
            {estimate.client_phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {estimate.client_phone}
              </div>
            )}
            {estimate.client_address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {estimate.client_address}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Created</p>
              <p className="font-medium">{format(new Date(estimate.created_date), 'MMM d, yyyy')}</p>
            </div>
            {estimate.valid_until && (
              <div>
                <p className="text-muted-foreground">Valid Until</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(estimate.valid_until), 'MMM d, yyyy')}
                </p>
              </div>
            )}
            {estimate.description && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-muted-foreground">Description</p>
                <p className="font-medium">{estimate.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimate.line_items?.map((item, i) => {
                const isHeader = item.quantity === 0 && item.total === 0 && item.description?.startsWith('──');
                if (isHeader) {
                  return (
                    <TableRow key={i} className="bg-secondary/60 hover:bg-secondary/60">
                      <TableCell colSpan={4} className="py-2 px-4 font-semibold text-xs text-primary uppercase tracking-widest">
                        {item.description?.replace(/^──\s*/, '').replace(/\s*──$/, '')}
                      </TableCell>
                    </TableRow>
                  );
                }
                const rowBg = item.description?.includes('— Reg Cost') ? 'bg-primary/5' : item.description?.includes('— OT Cost') ? 'bg-blue-500/5' : item.description?.includes('— Special Cost') ? 'bg-orange-500/5' : '';
                return (
                  <TableRow key={i} className={rowBg}>
                    <TableCell className="font-medium">{item.description || '—'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">${(item.unit_price || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${(item.total || 0).toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Separator className="my-4" />

          <div className="flex flex-col items-end space-y-1.5 text-sm">
            <div className="flex justify-between w-56">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">${(estimate.subtotal || 0).toFixed(2)}</span>
            </div>
            {estimate.tax_rate > 0 && (
              <div className="flex justify-between w-56">
                <span className="text-muted-foreground">Tax ({estimate.tax_rate}%)</span>
                <span className="font-medium">${(estimate.tax_amount || 0).toFixed(2)}</span>
              </div>
            )}
            {estimate.discount > 0 && (
              <div className="flex justify-between w-56">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-destructive">-${(estimate.discount || 0).toFixed(2)}</span>
              </div>
            )}
            <Separator className="w-56" />
            <div className="flex justify-between w-56">
              <span className="font-bold text-base">Total</span>
              <span className="font-bold text-lg text-primary">${(estimate.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {estimate.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes & Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{estimate.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}