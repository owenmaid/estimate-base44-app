import React from 'react';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';

export default function FormulaVariableRow({ variable, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-b-0">
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs text-muted-foreground">Variable Name</label>
        <Input
          value={variable.name}
          onChange={e => onChange('name', e.target.value.replace(/\s+/g, '_').toLowerCase())}
          placeholder="e.g. complexity"
          className="h-8 text-xs font-mono"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs text-muted-foreground">Label</label>
        <Input
          value={variable.label}
          onChange={e => onChange('label', e.target.value)}
          placeholder="e.g. Project Complexity"
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1 w-28">
        <label className="text-xs text-muted-foreground">Multiplier</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={variable.value}
          onChange={e => onChange('value', parseFloat(e.target.value) || 0)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs text-muted-foreground">Description</label>
        <Input
          value={variable.description}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Optional note"
          className="h-8 text-xs"
        />
      </div>
      <button
        onClick={onRemove}
        className="mt-5 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}