import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { calculateLineTotal } from '@/lib/calculations';

export default function LineItemRow({ item, index, onChange, onRemove }) {
  const handleChange = (field, value) => {
    const updated = { ...item, [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      updated.total = calculateLineTotal(updated.quantity, updated.unit_price);
    }
    onChange(index, updated);
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-5">
        <Input
          placeholder="Item description"
          value={item.description || ''}
          onChange={e => handleChange('description', e.target.value)}
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number"
          min="0"
          placeholder="Qty"
          value={item.quantity || ''}
          onChange={e => handleChange('quantity', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="Price"
          value={item.unit_price || ''}
          onChange={e => handleChange('unit_price', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div className="col-span-2 text-right font-semibold text-sm text-foreground pr-2">
        ${(item.total || 0).toFixed(2)}
      </div>
      <div className="col-span-1 flex justify-end">
        <Button variant="ghost" size="icon" onClick={() => onRemove(index)} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}