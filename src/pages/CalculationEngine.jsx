import React, { useState, useMemo, useEffect } from 'react';
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

const NUM_COLS = 17;
const COL_HEADERS = Array.from({ length: NUM_COLS }, (_, i) => `Col ${i + 1}`);

export default function CalculationEngine() {
  const [showNew, setShowNew] = useState(false);
  const [gridData, setGridData] = useState({});
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: formulas = [], isLoading } = useQuery({
    queryKey: ['formula-configs'],
    queryFn: () => base44.entities.FormulaConfig.list(),
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // Map by id, name, and sku for flexible lookup (reg, OT values, and item_group)
  const inventoryValueMap = useMemo(() => {
    const byId = {};
    const byName = {};
    inventoryItems.forEach(item => {
      if (item.id) byId[item.id] = { reg: item.reg_value, ot: item.ot_value, item_group: item.item_group };
      if (item.name) byName[item.name.toLowerCase()] = { reg: item.reg_value, ot: item.ot_value, item_group: item.item_group };
      if (item.sku) byName[item.sku.toLowerCase()] = { reg: item.reg_value, ot: item.ot_value, item_group: item.item_group };
    });
    return { byId, byName };
  }, [inventoryItems]);

  // Find the active project from localStorage (set by ProjectDetailsSetup)
  const activeProjectId = typeof window !== 'undefined' ? localStorage.getItem('activeProjectId') : null;
  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);
  const equipmentRows = activeProject?.equipment_rows || [];
  const equipmentGrid = activeProject?.equipment_grid || {};

  // Subscribe to real-time project changes so grid auto-updates
  useEffect(() => {
    if (!activeProjectId) return;
    const unsubscribe = base44.entities.Project.subscribe((event) => {
      if (event.id === activeProjectId) {
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    });
    return unsubscribe;
  }, [activeProjectId, queryClient]);

  // For each equipment row, sum all values > 0 from the equipment_grid (Col 1 auto-value)
  const rowSums = useMemo(() => {
    const sums = {};
    equipmentRows.forEach(row => {
      let sum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (key.startsWith(`${row.id}_`)) {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) sum += num;
        }
      });
      sums[row.id] = sum;
    });
    return sums;
  }, [equipmentRows, equipmentGrid]);

  // Col 2: if row label contains "(pre-work)" or "(post-work)" → Col1 × 10, else → Col1 × 12
  const rowHours = useMemo(() => {
    const hours = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const isSpecial = label.includes('(pre-work)') || label.includes('(post-work)');
      const multiplier = isSpecial ? 10 : 12;
      hours[row.id] = (rowSums[row.id] || 0) * multiplier;
    });
    return hours;
  }, [equipmentRows, rowSums]);

  // Col 4: sum of (equipment values on 'N' days × 8) + (equipment values on 'Sa' days × 4)
  const typeGrid = activeProject?.type_grid || {};
  const rowCol4 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      let nSum = 0;
      let saSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        const type = typeGrid[dateStr];
        if (type === 'N') nSum += num;
        else if (type === 'Sa') saSum += num;
      });
      result[row.id] = (nSum * 8) + (saSum * 4);
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Col 6: sum of equipment values on 'Sa' days × max(shiftHrs - 4, 0)
  const rowCol6 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const isSpecial = label.includes('pre-work') || label.includes('post-work');
      const shiftHrs = isSpecial ? 10 : 12;
      const multiplier = Math.max(shiftHrs - 4, 0);
      let saSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'Sa') saSum += num;
      });
      result[row.id] = saSum * multiplier;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Col 8: sum of equipment values on 'St' days × shiftHrs
  const rowCol8 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const isSpecial = label.includes('pre-work') || label.includes('post-work');
      const shiftHrs = isSpecial ? 10 : 12;
      let stSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'St') stSum += num;
      });
      result[row.id] = stSum * shiftHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Col 7: sum of equipment values on 'Su' days × shiftHrs
  const rowCol7 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const isSpecial = label.includes('pre-work') || label.includes('post-work');
      const shiftHrs = isSpecial ? 10 : 12;
      let suSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'Su') suSum += num;
      });
      result[row.id] = suSum * shiftHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Col 5: sum of equipment values on 'N' days × (shiftHrs - 8)
  const rowCol5 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      const label = (row.label || '').toLowerCase();
      const isSpecial = label.includes('pre-work') || label.includes('post-work');
      const shiftHrs = isSpecial ? 10 : 12;
      const overtimeHrs = Math.max(0, shiftHrs - 8);
      let nSum = 0;
      Object.entries(equipmentGrid).forEach(([key, value]) => {
        if (!key.startsWith(`${row.id}_`)) return;
        const dateStr = key.slice(`${row.id}_`.length);
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) return;
        if (typeGrid[dateStr] === 'N') nSum += num;
      });
      result[row.id] = nSum * overtimeHrs;
    });
    return result;
  }, [equipmentRows, equipmentGrid, typeGrid]);

  // Col 3: Total Hrs = Col4 + Col5 + Col6 + Col7 + Col8
  const rowCol3 = useMemo(() => {
    const result = {};
    equipmentRows.forEach(row => {
      result[row.id] = (rowCol4[row.id] || 0) + (rowCol5[row.id] || 0) + (rowCol6[row.id] || 0) + (rowCol7[row.id] || 0) + (rowCol8[row.id] || 0);
    });
    return result;
  }, [equipmentRows, rowCol4, rowCol5, rowCol6, rowCol7, rowCol8]);

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



      {/* Spreadsheet Grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Equipment Grid
            {activeProject && <span className="text-primary font-bold text-sm">— {activeProject.name}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/60 border-b border-border">
                  <th className="sticky left-0 z-10 bg-secondary/80 px-4 py-2.5 text-left font-semibold text-muted-foreground min-w-[140px] border-r border-border">
                      Equipment
                    </th>
                    <th className="px-3 py-2.5 text-center font-semibold border-r border-border min-w-[80px] text-primary">
                      Shift Hrs
                    </th>
                    {COL_HEADERS.map((col, i) => (
                      <th key={i} className={`px-3 py-2.5 text-center font-semibold border-r border-border last:border-r-0 min-w-[70px] ${i <= 12 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {i === 0 ? 'Col 1 (Σ)' : i === 1 ? 'Col 2 (hrs)' : i === 2 ? 'Col 3 (Total Hrs)' : i === 3 ? 'Col 4 (N×8+Sa×4)' : i === 4 ? 'Col 5 (N×OT hrs)' : i === 5 ? 'Col 6 (Sa×OT hrs)' : i === 6 ? 'Col 7 (Su×Shift)' : i === 7 ? 'Col 8 (St×Shift)' : i === 8 ? 'Col 9 (Reg Rate)' : i === 9 ? 'Col 10 (OT Rate)' : i === 10 ? 'Col 11 (Reg Cost)' : i === 11 ? 'Col 12 (OT Cost)' : i === 12 ? 'Col 13 (Special Cost)' : col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {equipmentRows.length === 0 ? (
                  <tr>
                    <td colSpan={NUM_COLS + 2} className="px-4 py-8 text-center text-muted-foreground">
                      No active project loaded. Open a project in Project Details Setup first.
                    </td>
                  </tr>
                ) : (
                  equipmentRows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-secondary/20 transition-colors" style={{ height: '40px' }}>
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border font-medium text-foreground truncate max-w-[140px]" title={row.label}>
                         {row.label}
                       </td>
                       {(() => {
                         // Determine item_group for this row
                         const inventoryEntry = inventoryValueMap.byId[row.item_id]
                           ?? inventoryValueMap.byName[row.label?.toLowerCase()]
                           ?? null;
                         const isManpower = inventoryEntry?.item_group === 'Manpower Group';
                         const label = (row.label || '').toLowerCase();
                         const isSpecial = label.includes('pre-work') || label.includes('post-work');
                         const shiftHrs = isSpecial ? 10 : 12;

                         // Shift Hrs cell: active for Manpower, inactive for others
                         const shiftHrsCell = (
                           <td className="px-1 py-1 border-r border-border">
                             {isManpower ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]">
                                 {shiftHrs}
                               </div>
                             ) : (
                               <div className="w-full bg-secondary/30 border border-border/30 rounded px-1 py-1 text-xs text-muted-foreground/40 text-center min-h-[24px]">—</div>
                             )}
                           </td>
                         );

                         return shiftHrsCell;
                       })()}
                       {COL_HEADERS.map((_, colIdx) => {
                         const key = `${row.id}_col${colIdx}`;
                         const isCol1 = colIdx === 0;
                         const isCol2 = colIdx === 1;
                         const isCol4 = colIdx === 3;
                         const isCol5 = colIdx === 4;
                         const isCol6 = colIdx === 5;
                         const isCol3 = colIdx === 2;
                         const isCol7 = colIdx === 6;
                         const isCol8 = colIdx === 7;
                         const isCol9 = colIdx === 8;
                         const isCol10 = colIdx === 9;
                         const isCol11 = colIdx === 10;
                         const isCol12 = colIdx === 11;
                         const isCol13 = colIdx === 12;
                         const col1Value = rowSums[row.id] || 0;
                         const col2Value = rowHours[row.id] || 0;
                         const col3Value = rowCol3[row.id] || 0;
                         const col4Value = rowCol4[row.id] || 0;
                         const col5Value = rowCol5[row.id] || 0;
                         const col6Value = rowCol6[row.id] || 0;
                         const col7Value = rowCol7[row.id] || 0;
                         const col8Value = rowCol8[row.id] || 0;
                         // Look up by item_id first, then by label text matching inventory name/sku
                         const inventoryEntry = inventoryValueMap.byId[row.item_id]
                           ?? inventoryValueMap.byName[row.label?.toLowerCase()]
                           ?? null;
                         const isManpower = inventoryEntry?.item_group === 'Manpower Group';
                         const col9Value = inventoryEntry?.reg ?? null;
                         // For non-Manpower rows, treat col4–col8 and col10 as zero for cost calculations
                         const effectiveCol4 = isManpower ? col4Value : 0;
                         const effectiveCol5 = isManpower ? col5Value : 0;
                         const effectiveCol6 = isManpower ? col6Value : 0;
                         const effectiveCol7 = isManpower ? col7Value : 0;
                         const effectiveCol8 = isManpower ? col8Value : 0;
                         const col10Value = isManpower ? (inventoryEntry?.ot ?? null) : null;
                         const label = (row.label || '').toLowerCase();
                         const isSpecial = label.includes('pre-work') || label.includes('post-work');
                         const shiftHrs = isSpecial ? 10 : 12;
                         // Col 11: Regular Cost = Col4*Col9 (zero for non-Manpower)
                         const col11Value = col9Value != null ? (effectiveCol4 * col9Value) : null;
                         // Col 12: Overtime Cost = SUM(Col5:Col7)*Col10 (zero for non-Manpower)
                         const col12Value = col10Value != null ? ((effectiveCol5 + effectiveCol6 + effectiveCol7) * col10Value) : null;
                         // Col 13: Special Days Cost (zero for non-Manpower)
                         const col13Value = col10Value != null
                           ? ((effectiveCol8 * 2 * (4 / (shiftHrs * 2))) * col10Value) +
                             ((effectiveCol8 * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2))) * col10Value)
                           : null;

                         // Inactive style for non-Manpower rows: Shift Hrs + Col2–Col10
                         const isInactiveForNonManpower = !isManpower && (
                           isCol2 || isCol3 || isCol4 || isCol5 || isCol6 || isCol7 || isCol8 || isCol9 || isCol10
                         );

                        return (
                          <td key={colIdx} className="px-1 py-1 border-r border-border last:border-r-0">
                            {isInactiveForNonManpower ? (
                              <div className="w-full bg-secondary/30 border border-border/30 rounded px-1 py-1 text-xs text-muted-foreground/40 text-center min-h-[24px]">—</div>
                            ) : isCol1 ? (
                              <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]">
                                {col1Value > 0 ? col1Value : '—'}
                              </div>
                            ) : isCol2 ? (
                              <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title={`${col1Value} × ${isSpecial ? 10 : 12}h`}>
                                {col2Value > 0 ? col2Value : '—'}
                              </div>
                            ) : isCol3 ? (
                              <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="Col4 + Col5 + Col6 + Col7 + Col8">
                                {col3Value > 0 ? col3Value : '—'}
                              </div>
                            ) : isCol4 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="(N days × 8) + (Sa days × 4)">
                                 {col4Value > 0 ? col4Value : '—'}
                               </div>
                             ) : isCol5 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title={`N-day sum × ${shiftHrs - 8} OT hrs (Shift ${shiftHrs}h - 8h)`}>
                                 {col5Value > 0 ? col5Value : '—'}
                               </div>
                             ) : isCol6 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title={`Sa-day sum × max(${shiftHrs}h - 4, 0) = ×${Math.max(shiftHrs - 4, 0)}`}>
                                 {col6Value > 0 ? col6Value : '—'}
                               </div>
                             ) : isCol7 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title={`Su-day sum × ${shiftHrs} shift hrs`}>
                                 {col7Value > 0 ? col7Value : '—'}
                               </div>
                             ) : isCol8 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title={`St-day sum × ${shiftHrs} shift hrs`}>
                                 {col8Value > 0 ? col8Value : '—'}
                               </div>
                             ) : isCol9 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="Reg Rate from Inventory">
                                 {col9Value != null ? col9Value : '—'}
                               </div>
                             ) : isCol10 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="OT Rate from Inventory">
                                 {col10Value != null ? col10Value : '—'}
                               </div>
                             ) : isCol11 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="Col4 * Col9">
                                 {col11Value != null && col11Value > 0 ? col11Value.toFixed(2) : '—'}
                               </div>
                             ) : isCol12 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="SUM(Col5:Col7) * Col10">
                                 {col12Value != null && col12Value > 0 ? col12Value.toFixed(2) : '—'}
                               </div>
                             ) : isCol13 ? (
                               <div className="w-full bg-primary/10 border border-primary/30 rounded px-1 py-1 text-xs text-primary font-semibold text-center min-h-[24px]" title="(Col8*2*(4/Shift²))*Col10 + (Col8*2*((Shift²-4)/Shift²))*Col10">
                                 {col13Value != null && col13Value > 0 ? col13Value.toFixed(2) : '—'}
                               </div>
                             ) : (
                              <input
                                type="number"
                                min="0"
                                value={gridData[key] || ''}
                                onChange={e => setGridData(prev => ({ ...prev, [key]: e.target.value }))}
                                className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-1 py-1 text-xs text-foreground outline-none cursor-pointer transition-all text-center"
                                placeholder="—"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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