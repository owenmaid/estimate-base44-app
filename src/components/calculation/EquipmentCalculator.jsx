import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Calculator, Package } from 'lucide-react';

export default function EquipmentCalculator() {
  const [lineItems, setLineItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [projectDays, setProjectDays] = useState(1);
  const [taxRate, setTaxRate] = useState(0);

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-equipment'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  const availableItems = inventory.filter(i => i.status !== 'discontinued');

  const addLineItem = () => {
    if (!selectedItemId) return;
    const item = inventory.find(i => i.id === selectedItemId);
    if (!item) return;
    // Avoid duplicates
    if (lineItems.find(l => l.item_id === selectedItemId)) return;
    setLineItems(prev => [...prev, {
      item_id: item.id,
      name: item.name,
      sku: item.sku || '',
      unit: item.unit || 'pcs',
      unit_cost: item.unit_cost || 0,
      reg_value: item.reg_value || 0,
      ot_value: item.ot_value || 0,
      quantity: 1,
      ot_hours: 0,
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

  const results = useMemo(() => {
    const rows = lineItems.map(l => {
      const regCost = l.quantity * l.unit_cost * projectDays;
      const otCost = l.quantity * l.ot_value * l.ot_hours;
      const subtotal = regCost + otCost;
      return { ...l, regCost, otCost, subtotal };
    });
    const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);
    return { rows, subtotal, taxAmount, total, totalUnits };
  }, [lineItems, projectDays, taxRate]);

  const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="space-y-6">
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
          </div>
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
          <div className="flex items-center gap-2">
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="flex-1 px-3 py-2 border border-border rounded-md bg-secondary text-foreground text-sm"
            >
              <option value="">Select equipment from inventory...</option>
              {availableItems.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}{item.sku ? ` (${item.sku})` : ''} — {item.status?.replace('_', ' ')}
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
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">Unit Cost ($)</th>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total Equipment Items</div>
                <div className="text-2xl font-bold text-foreground">{results.totalUnits}</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Project Duration</div>
                <div className="text-2xl font-bold text-foreground">{projectDays}d</div>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Subtotal</div>
                <div className="text-xl font-bold text-foreground">{fmt(results.subtotal)}</div>
              </div>
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">Grand Total (incl. tax)</div>
                <div className="text-xl font-bold text-primary">{fmt(results.total)}</div>
              </div>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-end gap-6 text-sm text-muted-foreground border-t border-border pt-3">
                <span>Subtotal: <span className="text-foreground font-medium">{fmt(results.subtotal)}</span></span>
                <span>Tax ({taxRate}%): <span className="text-foreground font-medium">{fmt(results.taxAmount)}</span></span>
                <span className="font-semibold text-foreground">Total: {fmt(results.total)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}