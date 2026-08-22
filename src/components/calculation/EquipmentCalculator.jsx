import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Calculator, Package, Zap, Save, FolderOpen } from 'lucide-react';

// Safely evaluate a formula expression with given variable scope
function evalFormula(expression, variables) {
  try {
    let expr = expression;
    variables.forEach(v => {
      expr = expr.replace(new RegExp(`\\b${v.name}\\b`, 'g'), v.value);
    });
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 1;
  } catch {
    return 1;
  }
}

export default function EquipmentCalculator() {
  const queryClient = useQueryClient();
  const [lineItems, setLineItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [projectDays, setProjectDays] = useState(1);
  const [taxRate, setTaxRate] = useState(0);
  const [estimateName, setEstimateName] = useState('');
  const [activeEstimateId, setActiveEstimateId] = useState(null);
  const [showSavedList, setShowSavedList] = useState(false);

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-equipment'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const { data: formulas = [] } = useQuery({
    queryKey: ['formula-configs'],
    queryFn: () => base44.entities.FormulaConfig.list(),
  });

  const { data: savedEstimates = [] } = useQuery({
    queryKey: ['calc-estimates'],
    queryFn: () => base44.entities.CalcEstimate.list('-updated_date', 50),
  });

  const activeFormulas = formulas.filter(f => f.is_active && f.formula_expression);

  const availableItems = inventory.filter(i => i.status !== 'discontinued');
  const categories = useMemo(() => [...new Set(availableItems.map(i => i.category).filter(Boolean))].sort(), [availableItems]);
  const itemsInCategory = useMemo(() => selectedCategory ? availableItems.filter(i => i.category === selectedCategory) : [], [availableItems, selectedCategory]);

  const addLineItem = () => {
    if (!selectedItemId) return;
    const item = inventory.find(i => i.id === selectedItemId);
    if (!item) return;
    if (lineItems.find(l => l.item_id === selectedItemId)) return;
    setLineItems(prev => [...prev, {
      item_id: item.id,
      name: item.name,
      sku: item.sku || '',
      unit: item.unit || 'pcs',
      unit_cost: item.reg_value || 0,
      reg_value: item.reg_value || 0,
      ot_value: item.ot_value || 0,
      quantity: 1,
      ot_hours: 0,
      item_group: item.item_group || '',
    }]);
    setSelectedItemId('');
  };

  const updateLineItem = (itemId, field, value) => {
    setLineItems(prev => prev.map(l =>
      l.item_id === itemId ? { ...l, [field]: parseFloat(value) || 0 } : l
    ));
  };

  const removeLineItem = (itemId) => {
    setLineItems(prev => prev.filter(l => l.item_id !== itemId));
  };

  // ── Save / Load ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = estimateName.trim();
      if (!trimmed) throw new Error('Please enter a name for this estimate.');
      const payload = {
        name: trimmed,
        project_days: projectDays,
        tax_rate: taxRate,
        line_items: lineItems.map(l => ({
          item_id: l.item_id, name: l.name, sku: l.sku, unit: l.unit,
          unit_cost: l.unit_cost, reg_value: l.reg_value, ot_value: l.ot_value,
          quantity: l.quantity, ot_hours: l.ot_hours, item_group: l.item_group,
        })),
        subtotal: results.subtotal,
        tax_amount: results.taxAmount,
        total: results.total,
      };
      if (activeEstimateId) {
        return base44.entities.CalcEstimate.update(activeEstimateId, payload);
      }
      return base44.entities.CalcEstimate.create(payload);
    },
    onSuccess: (saved) => {
      setActiveEstimateId(saved.id);
      queryClient.invalidateQueries({ queryKey: ['calc-estimates'] });
      toast.success(activeEstimateId ? 'Estimate updated!' : 'Estimate saved!');
    },
    onError: (err) => toast.error(err.message || 'Failed to save estimate'),
  });

  const loadEstimate = (est) => {
    setEstimateName(est.name || '');
    setProjectDays(est.project_days || 1);
    setTaxRate(est.tax_rate || 0);
    setLineItems((est.line_items || []).map(l => ({
      item_id: l.item_id, name: l.name, sku: l.sku || '', unit: l.unit || 'pcs',
      unit_cost: l.unit_cost || 0, reg_value: l.reg_value || 0, ot_value: l.ot_value || 0,
      quantity: l.quantity || 1, ot_hours: l.ot_hours || 0, item_group: l.item_group || '',
    })));
    setActiveEstimateId(est.id);
    setShowSavedList(false);
    toast.success(`Loaded: ${est.name}`);
  };

  const deleteEstimate = async (id) => {
    try {
      await base44.entities.CalcEstimate.delete(id);
      queryClient.invalidateQueries({ queryKey: ['calc-estimates'] });
      if (activeEstimateId === id) {
        setActiveEstimateId(null);
        setEstimateName('');
      }
      toast.success('Estimate deleted');
    } catch {
      toast.error('Failed to delete estimate');
    }
  };

  const handleNew = () => {
    setActiveEstimateId(null);
    setEstimateName('');
    setLineItems([]);
    setProjectDays(1);
    setTaxRate(0);
  };

  // Compute the multiplier for a given cost type from active formulas
  const getMultiplier = (costType) => {
    const relevant = activeFormulas.filter(f => f.applies_to === costType);
    return relevant.reduce((acc, f) => {
      const m = evalFormula(f.formula_expression, f.variables || []);
      return acc * m;
    }, 1);
  };

  const results = useMemo(() => {
    const subtotalMult = getMultiplier('subtotal');
    const regMult = getMultiplier('reg_cost');
    const otMult = getMultiplier('ot_cost');

    const rows = lineItems.map(l => {
      const regCost = l.quantity * l.unit_cost * regMult;
      const otCost = l.ot_value * l.ot_hours * otMult;
      const subtotal = (regCost + otCost) * subtotalMult;
      return { ...l, regCost, otCost, subtotal };
    });
    const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const totalMult = getMultiplier('total');
    const adjustedSubtotal = subtotal * totalMult;
    const taxAmount = adjustedSubtotal * (taxRate / 100);
    const total = (adjustedSubtotal + taxAmount) * projectDays;
    const totalUnits = rows.reduce((s, r) => s + r.quantity + r.ot_hours, 0);

    // Split by Manpower Group vs non-Manpower
    const isManpower = (r) => (r.item_group || '').toLowerCase() === 'manpower group';
    const manpowerRows = rows.filter(isManpower);
    const nonManpowerRows = rows.filter(r => !isManpower(r));

    const manpowerSubtotal = manpowerRows.reduce((s, r) => s + r.subtotal, 0) * totalMult;
    const nonManpowerSubtotal = nonManpowerRows.reduce((s, r) => s + r.subtotal, 0) * totalMult;
    const manpowerTax = adjustedSubtotal > 0 ? taxAmount * (manpowerSubtotal / adjustedSubtotal) : 0;
    const nonManpowerTax = adjustedSubtotal > 0 ? taxAmount * (nonManpowerSubtotal / adjustedSubtotal) : 0;
    const manpowerTotal = (manpowerSubtotal + manpowerTax) * projectDays;
    const nonManpowerTotal = (nonManpowerSubtotal + nonManpowerTax) * projectDays;
    const manpowerUnits = manpowerRows.reduce((s, r) => s + r.quantity + r.ot_hours, 0);
    const nonManpowerUnits = nonManpowerRows.reduce((s, r) => s + r.quantity + r.ot_hours, 0);

    return {
      rows, subtotal: adjustedSubtotal, taxAmount, total, totalUnits,
      manpowerSubtotal, manpowerTax, manpowerTotal, manpowerUnits,
      nonManpowerSubtotal, nonManpowerTax, nonManpowerTotal, nonManpowerUnits,
      hasManpower: manpowerRows.length > 0,
      hasNonManpower: nonManpowerRows.length > 0,
    };
  }, [lineItems, projectDays, taxRate, formulas]);

  const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="space-y-6">
      {/* Active Formula Badge */}
      {activeFormulas.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-xs">
          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">
            Active formulas from Calculation Engine:
          </span>
          {activeFormulas.map(f => (
            <Badge key={f.id} variant="outline" className="text-xs border-primary/40 text-primary">
              {f.name} → {f.applies_to}
            </Badge>
          ))}
        </div>
      )}

      {/* Parameters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Project Parameters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Estimate Name</label>
              <Input
                value={estimateName}
                onChange={e => setEstimateName(e.target.value)}
                placeholder="e.g. Keyera Manpower Estimate"
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Project Duration (days)</label>
              <Input
                type="number"
                min="1"
                value={projectDays}
                onChange={e => setProjectDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tax Rate (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxRate}
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-28"
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || lineItems.length === 0} size="sm">
                <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? 'Saving…' : activeEstimateId ? 'Update' : 'Save'}
              </Button>
              <Button onClick={() => setShowSavedList(s => !s)} variant="outline" size="sm">
                <FolderOpen className="h-4 w-4 mr-1" /> Load
              </Button>
              <Button onClick={handleNew} variant="ghost" size="sm">New</Button>
            </div>
          </div>

          {showSavedList && (
            <div className="mt-4 border border-border rounded-lg overflow-hidden">
              <div className="bg-secondary/60 px-3 py-2 text-xs font-semibold text-muted-foreground">Saved Estimates</div>
              {savedEstimates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No saved estimates yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {savedEstimates.map(est => (
                    <div key={est.id} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0 hover:bg-secondary/20">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{est.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {est.line_items?.length || 0} items · {fmt(est.total || 0)}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <Button onClick={() => loadEstimate(est)} size="sm" variant="outline">Load</Button>
                        <button onClick={() => deleteEstimate(est.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Equipment Line Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCategory}
              onChange={e => { setSelectedCategory(e.target.value); setSelectedItemId(''); }}
              className="px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm min-w-[180px]"
            >
              <option value="">Select category...</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              disabled={!selectedCategory}
              className="flex-1 px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm disabled:opacity-50"
            >
              <option value="">{selectedCategory ? 'Select item...' : 'Select a category first...'}</option>
              {itemsInCategory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.sku ? ` (${item.sku})` : ''}
                </option>
              ))}
            </select>
            <Button onClick={addLineItem} disabled={!selectedItemId} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No equipment added yet. Select items from inventory above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/60 border-b border-border text-left">
                    <th className="px-3 py-2 font-semibold text-muted-foreground">Item</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-24">Qty</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">Reg Value ($)</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-24">OT Hours</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">OT Rate ($)</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28 text-right">Reg Cost</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28 text-right">OT Cost</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28 text-right">Subtotal</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map(row => (
                    <tr key={row.item_id} className="border-b border-border hover:bg-secondary/20">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{row.name}</div>
                        {row.sku && <div className="text-muted-foreground">{row.sku}</div>}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min="1" value={row.quantity}
                          onChange={e => updateLineItem(row.item_id, 'quantity', e.target.value)}
                          className="h-7 text-xs w-20" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min="0" step="0.01" value={row.unit_cost}
                          onChange={e => updateLineItem(row.item_id, 'unit_cost', e.target.value)}
                          className="h-7 text-xs w-24" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min="0" value={row.ot_hours}
                          onChange={e => updateLineItem(row.item_id, 'ot_hours', e.target.value)}
                          className="h-7 text-xs w-20" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min="0" step="0.01" value={row.ot_value}
                          onChange={e => updateLineItem(row.item_id, 'ot_value', e.target.value)}
                          className="h-7 text-xs w-24" />
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">{fmt(row.regCost)}</td>
                      <td className="px-3 py-2 text-right text-foreground">{fmt(row.otCost)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{fmt(row.subtotal)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeLineItem(row.item_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      {lineItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cost Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Manpower Group</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Hours / Units</div>
                <div className="text-2xl font-bold text-foreground">{results.manpowerUnits}</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Project Duration</div>
                <div className="text-2xl font-bold text-foreground">{projectDays}d</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Subtotal</div>
                <div className="text-xl font-bold text-foreground">{fmt(results.manpowerSubtotal)}</div>
              </div>
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Grand Total (incl. tax)</div>
                <div className="text-xl font-bold text-primary">{fmt(results.manpowerTotal)}</div>
              </div>
            </div>

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-6">Non-Manpower Items</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Hours / Units</div>
                <div className="text-2xl font-bold text-foreground">{results.nonManpowerUnits}</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Project Duration</div>
                <div className="text-2xl font-bold text-foreground">{projectDays}d</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Subtotal</div>
                <div className="text-xl font-bold text-foreground">{fmt(results.nonManpowerSubtotal)}</div>
              </div>
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Grand Total (incl. tax)</div>
                <div className="text-xl font-bold text-primary">{fmt(results.nonManpowerTotal)}</div>
              </div>
            </div>
            {(taxRate > 0 || activeFormulas.length > 0) && (
              <div className="flex flex-wrap justify-end gap-6 text-sm text-muted-foreground border-t border-border pt-3">
                <span>Subtotal: <span className="text-foreground font-medium">{fmt(results.subtotal)}</span></span>
                {taxRate > 0 && (
                  <span>Tax ({taxRate}%): <span className="text-foreground font-medium">{fmt(results.taxAmount)}</span></span>
                )}
                {activeFormulas.length > 0 && (
                  <span className="text-primary text-xs flex items-center gap-1">
                    <Zap className="h-3 w-3" /> {activeFormulas.length} formula{activeFormulas.length !== 1 ? 's' : ''} applied
                  </span>
                )}
                <span className="font-semibold text-foreground">Total: {fmt(results.total)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}