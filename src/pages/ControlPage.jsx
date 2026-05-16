import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react';

const STORAGE_KEY = 'sa_su_st_list';
const VLOOKUP_KEY = 'type_vlookup_table';

function loadList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function loadVlookup() {
  try {
    const raw = localStorage.getItem(VLOOKUP_KEY);
    return raw ? JSON.parse(raw) : [{ key: '', value: '' }];
  } catch {
    return [{ key: '', value: '' }];
  }
}

function saveVlookup(rows) {
  localStorage.setItem(VLOOKUP_KEY, JSON.stringify(rows));
}

export default function ControlPage() {
  const [items, setItems] = useState(() => loadList());
  const [newItem, setNewItem] = useState('');
  const [vlookupRows, setVlookupRows] = useState(() => loadVlookup());

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    const updated = [...items, trimmed];
    setItems(updated);
    saveList(updated);
    setNewItem('');
  };

  const handleDelete = (idx) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    saveList(updated);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleVlookupChange = (idx, field, value) => {
    const updated = vlookupRows.map((row, i) => i === idx ? { ...row, [field]: value } : row);
    setVlookupRows(updated);
    saveVlookup(updated);
  };

  const handleVlookupAddRow = () => {
    const updated = [...vlookupRows, { key: '', value: '' }];
    setVlookupRows(updated);
    saveVlookup(updated);
  };

  const handleVlookupDeleteRow = (idx) => {
    const updated = vlookupRows.filter((_, i) => i !== idx);
    setVlookupRows(updated.length ? updated : [{ key: '', value: '' }]);
    saveVlookup(updated.length ? updated : [{ key: '', value: '' }]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6 text-primary" />
            Control Page
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage reference lists used across the application.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sa_Su_St List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add new item..."
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleAdd} disabled={!newItem.trim()}>
              <Plus className="h-4 w-4 mr-1.5" /> Add
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No items yet. Add items above to populate the Type row in Equipment Schedule.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between px-3 py-2 bg-secondary rounded-lg text-sm">
                  <span className="text-foreground">{item}</span>
                  <button
                    onClick={() => handleDelete(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {/* Vlookup Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Type Vlookup Table</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Two-column lookup array used to resolve Type dropdown values.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-secondary/60 border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground text-xs w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-primary text-xs">Key (Type)</th>
                  <th className="px-3 py-2 text-left font-semibold text-primary text-xs">Value</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {vlookupRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-secondary/20">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.key}
                        onChange={e => handleVlookupChange(idx, 'key', e.target.value)}
                        placeholder="e.g. SA"
                        className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-xs text-foreground outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.value}
                        onChange={e => handleVlookupChange(idx, 'value', e.target.value)}
                        placeholder="e.g. Standard"
                        className="w-full bg-secondary border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 text-xs text-foreground outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => handleVlookupDeleteRow(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={handleVlookupAddRow}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Row
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}