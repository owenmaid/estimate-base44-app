import React from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EstimateForm from '@/components/estimates/EstimateForm';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/reliability';

export default function CreateEstimate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Estimate.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success('Estimate created successfully');
      navigate(`/estimates/${result.id}`);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Unable to create the estimate.')),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Estimate</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Fill in the details to create a new estimate</p>
        </div>
      </div>

      <EstimateForm onSubmit={mutation.mutate} isSubmitting={mutation.isPending} />
    </div>
  );
}