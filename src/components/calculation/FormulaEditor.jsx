import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Save, FlaskConical, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import FormulaVariableRow from './FormulaVariableRow';
import { nanoid } from '@/lib/nanoid';

const APPLIES_TO_OPTIONS = [
  { value: 'subtotal', label: 'Subtotal' },
  { value: 'reg_cost', label: 'Regular Cost' },
  { value: 'ot_cost', label: 'Overtime Cost' },
  { value: 'total', label: 'Grand Total' },
];

const defaultFormula = () => ({
  name: '',
  description: '',
  is_active: true,
  applies_to: 'subtotal',
  variables: [],
  formula_expression: '',
});

export default function FormulaEditor({ formula, onSave, onDelete, onToggle, isNew }) {
  const [draft, setDraft] = useState(formula || defaultFormula());
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setDraft(formula || defaultFormula());
    setPreview(null);
  }, [formula]);

  const updateField = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const addVariable = () => {
    const id = nanoid();
    const newVar = { id, name: '', label: '', value: 1, description: '' };
    setDraft(prev => ({
      ...prev,
      variables: [...prev.variables, newVar],
    }));
  };

  const updateVariable = (id, field, value) => {
    setDraft(prev => ({
      ...prev,
      variables: prev.variables.map(v => v.id === id ? { ...v, [field]: value } : v),
    }));
  };

  const removeVariable = (id) => {
    setDraft(prev => ({
      ...prev,
      variables: prev.variables.filter(v => v.id !== id),
    }));
  };

  const handleAutoExpression = () => {
    if (draft.variables.length === 0) return;
    const expr = draft.variables.map(v => v.name || 'var').join(' * ');
    updateField('formula_expression', expr);
  };

  const evaluatePreview = () => {
    try {
      const scope = {};
      draft.variables.forEach(v => { scope[v.name] = v.value; });
      // Safe evaluation: replace var names with values
      let expr = draft.formula_expression;
      Object.entries(scope).forEach(([k, v]) => {
        expr = expr.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
      });
      const result = Function(`"use strict"; return (${expr})`)();
      setPreview(typeof result === 'number' ? result : null);
    } catch {
      setPreview(null);
    }
  };

  const totalMultiplier = draft.variables.reduce((acc, v) => acc * (v.value || 1), 1);

  return (
    <Card className={`border-2 transition-colors ${draft.is_active ? 'border-primary/30' : 'border-border'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <FlaskConical className="h-4 w-4 text-primary shrink-0" />
            <Input
              value={draft.name}
              onChange={e => updateField('name', e.target.value)}
              placeholder="Formula name..."
              className="h-8 text-sm font-semibold border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:border-b focus-visible:border-primary"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={draft.is_active ? 'default' : 'secondary'} className="text-xs cursor-pointer" onClick={() => onToggle && onToggle(draft)}>
              {draft.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {!isNew && (
              <button onClick={() => onDelete(draft)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <Input
          value={draft.description}
          onChange={e => updateField('description', e.target.value)}
          placeholder="Description (optional)..."
          className="h-7 text-xs border-0 bg-transparent px-1 text-muted-foreground focus-visible:ring-0"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Applies To */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground w-20">Applies to:</span>
          <div className="flex gap-2 flex-wrap">
            {APPLIES_TO_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateField('applies_to', opt.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  draft.applies_to === opt.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-transparent border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Multiplier Variables</span>
            <Button variant="outline" size="sm" onClick={addVariable} className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add Variable
            </Button>
          </div>
          {draft.variables.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
              No variables yet — add one to define a multiplier.
            </p>
          ) : (
            <div className="bg-secondary/20 rounded-md px-3">
              {draft.variables.map(v => (
                <FormulaVariableRow
                  key={v.id}
                  variable={v}
                  onChange={(field, value) => updateVariable(v.id, field, value)}
                  onRemove={() => removeVariable(v.id)}
                />
              ))}
            </div>
          )}
          {draft.variables.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1.5 text-right">
              Combined multiplier: <span className="font-semibold text-foreground">{totalMultiplier.toFixed(4)}×</span>
            </p>
          )}
        </div>

        {/* Formula Expression */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">Formula Expression</span>
            <button onClick={handleAutoExpression} className="text-xs text-primary hover:underline">
              Auto-build from variables
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              value={draft.formula_expression}
              onChange={e => updateField('formula_expression', e.target.value)}
              placeholder="e.g. complexity * risk_factor"
              className="font-mono text-xs h-8"
            />
            <Button variant="outline" size="sm" onClick={evaluatePreview} className="h-8 text-xs shrink-0">
              Preview
            </Button>
          </div>
          {preview !== null && (
            <p className="text-xs mt-1 text-primary font-mono">
              Result: {preview.toFixed(4)} → applied as <strong>{preview.toFixed(4)}×</strong> to {draft.applies_to}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Use variable names defined above. Supports +, -, *, /, parentheses.
          </p>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => onSave(draft)} disabled={!draft.name.trim()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> {isNew ? 'Create Formula' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}