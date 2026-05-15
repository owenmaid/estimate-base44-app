import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FlaskConical, Zap, Calendar } from 'lucide-react';
import FormulaEditor from '@/components/calculation/FormulaEditor';
import { nanoid } from '@/lib/nanoid';
import { toast } from 'sonner';

const blankFormula = () => ({
  name: '',
  description: '',
  is_active: true,
  applies_to: 'subtotal',
  variables: [],
  formula_expression: '',
});

export default function CalculationEngine() {
  const [showNew, setShowNew] = useState(false);
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: formulas = [], isLoading } = useQuery({
    queryKey: ['formula-configs'],
    queryFn: () => base44.entities.FormulaConfig.list(),
  });

  // Find the KEYERA FT SASK project
  const activeProject = useMemo(() => projects.find(p => p.name === 'KEYERA FT SASK'), [projects]);

  // Calculate total mandays from first equipment row
   const totalMandays = useMemo(() => {
     if (!activeProject?.equipment_grid || !activeProject?.equipment_rows?.length) return 0;
     const firstRowId = activeProject.equipment_rows[0].id;
     let sum = 0;
     Object.entries(activeProject.equipment_grid).forEach(([key, value]) => {
       if (key.startsWith(`${firstRowId}_`)) {
         const num = parseInt(value, 10);
         if (!isNaN(num) && num > 0) {
           sum += num;
         }
       }
     });
     return sum;
   }, [activeProject]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FormulaConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formula-configs'] });
      setShowNew(false);
      toast.success('Formula created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FormulaConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formula-configs'] });
      toast.success('Formula saved');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FormulaConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formula-configs'] });
      toast.success('Formula deleted');
    },
  });

  const handleSave = (draft) => {
    if (draft.id) {
      updateMutation.mutate({ id: draft.id, data: draft });
    } else {
      createMutation.mutate(draft);
    }
  };

  const handleDelete = (draft) => {
    if (draft.id) deleteMutation.mutate(draft.id);
  };

  const handleToggle = (draft) => {
    if (!draft.id) return;
    updateMutation.mutate({ id: draft.id, data: { ...draft, is_active: !draft.is_active } });
  };

  const activeCount = formulas.filter(f => f.is_active).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calculation Engine</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define custom formula multipliers that are automatically applied in the Manpower Estimation module.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} disabled={showNew}>
          <Plus className="h-4 w-4 mr-1.5" /> New Formula
        </Button>
      </div>

      {/* Project Data Summary */}
      {activeProject && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {activeProject.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Mandays</div>
                <div className="text-3xl font-bold text-primary">{totalMandays}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Banner */}
      {formulas.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 rounded-lg text-sm">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="text-foreground">
            <span className="font-semibold text-primary">{activeCount}</span> active formula{activeCount !== 1 ? 's' : ''} currently applied to Manpower Estimation.
            {activeCount === 0 && <span className="text-muted-foreground ml-1">Toggle a formula to activate it.</span>}
          </span>
        </div>
      )}

      {/* New Formula Editor */}
      {showNew && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">New Formula</span>
            <button onClick={() => setShowNew(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
          <FormulaEditor
            formula={blankFormula()}
            onSave={handleSave}
            onDelete={() => setShowNew(false)}
            isNew
          />
        </div>
      )}

      {/* Existing Formulas */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading formulas...</p>
      ) : formulas.length === 0 && !showNew ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <FlaskConical className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">No formulas yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a formula to apply custom cost multipliers in Manpower Estimation.</p>
          <Button onClick={() => setShowNew(true)} variant="outline">
            <Plus className="h-4 w-4 mr-1.5" /> Create your first formula
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {formulas.map(formula => (
            <FormulaEditor
              key={formula.id}
              formula={formula}
              onSave={handleSave}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}