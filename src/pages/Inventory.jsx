import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Pencil, Trash2, Package, AlertTriangle, XCircle, Archive } from 'lucide-react';
import { toast } from 'sonner';
import InventoryModal from '@/components/inventory/InventoryModal';

const STATUS_CONFIG = {
  in_stock:     { label: 'In Stock',     style: 'bg-green-500/15 text-green-400 border-green-500/30',   icon: Package },
  low_stock:    { label: 'Low Stock',    style: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', icon: AlertTriangle },
  out_of_stock: { label: 'Out of Stock', style: 'bg-red-500/15 text-red-400 border-red-500/30',          icon: XCircle },
  discontinued: { label: 'Discontinued', style: 'bg-muted text-muted-foreground border-border',          icon: Archive },
};

export default function Inventory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalItem, setModalItem] = useState(null); // null = closed, false = new, object = edit

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventoryItems'],
    queryFn: () => base44.entities.InventoryItem.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InventoryItem.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); setModalItem(null); toast.success('Item added!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InventoryItem.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); setModalItem(null); toast.success('Item updated!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.InventoryItem.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventoryItems'] }); toast.success('Item deleted'); },
  });

  const handleSave = (form) => {
    if (modalItem && modalItem.id) {
      updateMutation.mutate({ id: modalItem.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = items.filter(item =>
    [item.name, item.sku, item.category, item.supplier, item.location]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  // Stats
  const totalValue = items.reduce((sum, i) => sum + ((i.unit_cost || 0) * (i.quantity || 0)), 0);
  const lowStockCount = items.filter(i => i.status === 'low_stock' || (i.min_stock > 0 && i.quantity <= i.min_stock)).length;

  const stats = [
    { label: 'Total Items', value: items.length, color: 'text-foreground' },
    { label: 'In Stock', value: items.filter(i => i.status === 'in_stock').length, color: 'text-green-400' },
    { label: 'Low / Out of Stock', value: lowStockCount, color: 'text-yellow-400' },
    { label: 'Total Value', value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'text-primary' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your stock and materials</p>
        </div>
        <Button size="sm" onClick={() => setModalItem(false)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Item
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-5">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search ? 'No items match your search.' : 'No inventory items yet. Add your first one!'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Name', 'SKU', 'Category', 'Qty', 'Unit Cost', 'Supplier', 'Location', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.in_stock;
                const isLow = item.min_stock > 0 && item.quantity <= item.min_stock && item.status !== 'out_of_stock';
                return (
                  <tr key={item.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-4 py-3 font-medium">
                      {item.name}
                      {isLow && <AlertTriangle className="inline ml-1.5 h-3.5 w-3.5 text-yellow-400" title="Low stock" />}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.sku || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.category || '—'}</td>
                    <td className="px-4 py-3 font-medium">{item.quantity} <span className="text-muted-foreground text-xs">{item.unit}</span></td>
                    <td className="px-4 py-3">{item.unit_cost != null && item.unit_cost !== '' ? `$${Number(item.unit_cost).toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.supplier || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.location || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${cfg.style}`}>{cfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModalItem(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalItem !== null && (
        <InventoryModal
          item={modalItem || null}
          onClose={() => setModalItem(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}