import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ITEM_GROUPS = ['Service Group', 'Equipment Group', 'Manpower Group', 'Totals Group'];

const EMPTY_FORM = {
  name: '', sku: '', category: '', item_group: '', sub_group_01: '', sub_group_02: '', quantity: 0, unit: 'pcs',
  unit_cost: '', reg_value: '', ot_value: '', supplier: '', location: '', min_stock: 0, notes: '', status: 'in_stock',
};

export default function InventoryModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = !!item;

  useEffect(() => {
    if (item) setForm({ ...EMPTY_FORM, ...item });
  }, [item]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Item' : 'New Inventory Item'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Item Name *</Label>
              <Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Steel Beam 6m" />
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. STL-001" />
            </div>
            <div>
              <Label>Item Group</Label>
              <Select value={form.item_group} onValueChange={v => set('item_group', v)}>
                <SelectTrigger><SelectValue placeholder="Select group..." /></SelectTrigger>
                <SelectContent>
                  {ITEM_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIRECT LABOUR">Indirect Labour</SelectItem>
                  <SelectItem value="DIRECT LABOUR">Direct Labour</SelectItem>
                  <SelectItem value="LOGISTICS">Logistics</SelectItem>
                  <SelectItem value="DIGITAL MONITORING EQUIPMENT">Digital Monitoring Equipment</SelectItem>
                  <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                  <SelectItem value="VENTILATION LABOUR">Ventilation Labour</SelectItem>
                  <SelectItem value="VENTILATION EQUIPMENT LOG">Ventilation Equipment Log</SelectItem>
                  <SelectItem value="VENTILATION EQUIPMENT">Ventilation Equipment</SelectItem>
                  <SelectItem value="CONNECTIVITY">Connectivity</SelectItem>
                  <SelectItem value="CONVENTIONAL COSTS">Conventional Costs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="0" value={form.quantity} onChange={e => set('quantity', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="pcs, kg, m..." />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', parseFloat(e.target.value) || '')} placeholder="0.00" />
            </div>
            <div>
              <Label>Reg Value ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.reg_value ?? ''} onChange={e => { const v = parseFloat(e.target.value); set('reg_value', isNaN(v) ? null : v); }} placeholder="0.00" />
            </div>
            <div>
              <Label>OT Value ($)</Label>
              <Input type="number" min="0" step="0.01" value={form.ot_value ?? ''} onChange={e => { const v = parseFloat(e.target.value); set('ot_value', isNaN(v) ? null : v); }} placeholder="0.00" />
            </div>
            <div>
              <Label>Min Stock Level</Label>
              <Input type="number" min="0" value={form.min_stock} onChange={e => set('min_stock', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Supplier name" />
            </div>
            <div>
              <Label>Storage Location</Label>
              <Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Warehouse A" />
            </div>
            <div>
              <Label>Sub Group 01</Label>
              <Input value={form.sub_group_01} onChange={e => set('sub_group_01', e.target.value)} placeholder="Sub Group 01 value" />
            </div>
            <div>
              <Label>Sub Group 02</Label>
              <Input value={form.sub_group_02} onChange={e => set('sub_group_02', e.target.value)} placeholder="Sub Group 02 value" />
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                  <SelectItem value="discontinued">Discontinued</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." className="min-h-[70px]" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isEdit ? 'Update Item' : 'Add Item'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}