import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Save, ChevronDown, FileText } from 'lucide-react';
import LineItemRow from './LineItemRow';
import { calculateEstimateFromLineItems, roundMoney } from '@/lib/calculations';
import { createStableId, validateEstimateData } from '@/lib/reliability';
import { toast } from 'sonner';
import { inferCalculationCode } from '@/lib/calculationCodes';

const emptyItem = () => ({ id: createStableId('line'), description: '', quantity: 1, unit_price: 0, total: 0 });

export default function EstimateForm({ initialData, onSubmit, isSubmitting }) {
  const [form, setForm] = useState({
    estimate_number: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
    project_name: '',
    description: '',
    status: 'draft',
    line_items: [emptyItem()],
    tax_rate: 0,
    discount: 0,
    valid_until: '',
    notes: '',
    ...initialData,
  });

  useEffect(() => {
    if (initialData) setForm(prev => ({
      ...prev,
      ...initialData,
      line_items: (initialData.line_items || []).map(item => ({
        ...item,
        id: item.id || createStableId('line'),
        calculation_code: item.calculation_code || inferCalculationCode(item.description) || undefined,
      })),
    }));
  }, [initialData]);

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const updateLineItem = (index, updated) => {
    const items = [...form.line_items];
    items[index] = updated;
    setForm(prev => ({ ...prev, line_items: items }));
  };

  const addLineItem = () => setForm(prev => ({ ...prev, line_items: [...prev.line_items, emptyItem()] }));

  const removeLineItem = (index) => {
    if (form.line_items.length <= 1) return;
    setForm(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== index) }));
  };

  const { subtotal, taxAmount, total } = calculateEstimateFromLineItems(
    form.line_items,
    form.tax_rate,
    form.discount,
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationError = validateEstimateData(form, [{ items: form.line_items }]);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const payload = {
      ...form,
      client_name: form.client_name.trim(),
      project_name: form.project_name.trim(),
      tax_rate: Number(form.tax_rate || 0),
      discount: roundMoney(form.discount),
      line_items: form.line_items.map(item => ({
        ...item,
        id: item.id || createStableId('line'),
        calculation_code: item.calculation_code || inferCalculationCode(item.description) || undefined,
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit_price: roundMoney(item.unit_price),
        total: roundMoney(item.total),
      })),
      subtotal: roundMoney(subtotal),
      tax_amount: roundMoney(taxAmount),
      total: roundMoney(total),
    };
    // Keep transient UI state and Base44-managed metadata out of saved records.
    ['_notesOpen', 'id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample']
      .forEach(key => delete payload[key]);
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client & Project Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Client Name *</Label>
              <Input required value={form.client_name} onChange={e => updateField('client_name', e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.client_email} onChange={e => updateField('client_email', e.target.value)} placeholder="client@email.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.client_phone} onChange={e => updateField('client_phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea value={form.client_address} onChange={e => updateField('client_address', e.target.value)} placeholder="123 Main St..." className="h-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Estimate Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Estimate Number</Label>
              <Input value={form.estimate_number} onChange={e => updateField('estimate_number', e.target.value)} placeholder="EST-001" />
            </div>
            <div>
              <Label>Project Name *</Label>
              <Input required value={form.project_name} onChange={e => updateField('project_name', e.target.value)} placeholder="Website Redesign" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => updateField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valid Until</Label>
              <Input type="date" value={form.valid_until} onChange={e => updateField('valid_until', e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Brief project overview..." className="h-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-1">
            <div className="col-span-5">Description</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-2">Unit Price</div>
            <div className="col-span-2 text-right">Total</div>
            <div className="col-span-1" />
          </div>
          {form.line_items.map((item, i) => (
            <LineItemRow key={item.id} item={item} index={i} onChange={updateLineItem} onRemove={removeLineItem} />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="mt-2">
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>

          <Separator className="my-4" />

          <div className="flex flex-col items-end space-y-2 text-sm">
            <div className="flex items-center gap-4 w-64">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="ml-auto font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2 w-64">
              <span className="text-muted-foreground">Tax (%)</span>
              <Input type="number" min="0" step="0.1" className="w-20 h-8 text-sm ml-auto" value={form.tax_rate || ''} onChange={e => updateField('tax_rate', parseFloat(e.target.value) || 0)} />
              <span className="font-semibold w-20 text-right">${taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2 w-64">
              <span className="text-muted-foreground">Discount</span>
              <Input type="number" min="0" step="0.01" className="w-20 h-8 text-sm ml-auto" value={form.discount || ''} onChange={e => updateField('discount', parseFloat(e.target.value) || 0)} />
            </div>
            <Separator className="w-64" />
            <div className="flex items-center gap-4 w-64">
              <span className="font-bold text-base">Total</span>
              <span className="ml-auto font-bold text-lg text-primary">${total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => updateField('_notesOpen', !form._notesOpen)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-base font-semibold">Notes & Terms</span>
            {form.notes && <span className="text-xs text-muted-foreground ml-1">({form.notes.length} chars)</span>}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${(form._notesOpen || form.notes) ? 'rotate-180' : ''}`} />
        </button>
        {(form._notesOpen || form.notes) && (
          <CardContent className="pt-0 pb-4">
            <Textarea
              value={form.notes}
              onChange={e => {
                updateField('notes', e.target.value);
                if (!form._notesOpen) updateField('_notesOpen', true);
              }}
              placeholder="Payment terms, conditions, etc."
              className="min-h-[96px] resize-y"
              autoFocus={form._notesOpen && !form.notes}
            />
          </CardContent>
        )}
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting} className="px-6">
          <Save className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Saving...' : (initialData ? 'Update Estimate' : 'Create Estimate')}
        </Button>
      </div>
    </form>
  );
}