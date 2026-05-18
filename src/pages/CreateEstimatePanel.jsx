import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import PalettePanel from '@/components/estimate-panel/PalettePanel';
import EstimateCanvas from '@/components/estimate-panel/EstimateCanvas';
import EstimateSearchBar from '@/components/estimate-panel/EstimateSearchBar';
import { X } from 'lucide-react';

export default function CreateEstimatePanel() {
  const queryClient = useQueryClient();

  // The estimate being edited (null = new)
  const [activeEstimate, setActiveEstimate] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Sections: [{id, title, items:[{id,description,quantity,unit_price,total,markup}]}]
  const [sections, setSections] = useState([
    { id: Date.now(), title: 'Section 1', items: [] }
  ]);

  // Client info
  const [clientInfo, setClientInfo] = useState({
    client_name: '', project_number: '', project_name: '', client_email: '',
    client_phone: '', client_address: '', notes: '',
    tax_rate: 0, discount: 0,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => base44.entities.InventoryItem.list(),
  });

  // ── Load an existing estimate into the canvas ──────────────────────────────
  const loadEstimate = (estimate) => {
    setActiveEstimate(estimate);
    setClientInfo({
      client_name: estimate.client_name || '',
      project_number: estimate.project_number || estimate.project_name || '',
      project_name: estimate.project_name || '',
      client_email: estimate.client_email || '',
      client_phone: estimate.client_phone || '',
      client_address: estimate.client_address || '',
      notes: estimate.notes || '',
      tax_rate: estimate.tax_rate || 0,
      discount: estimate.discount || 0,
    });

    // Reconstruct sections from line_items
    const lineItems = estimate.line_items || [];
    const rebuilt = [];
    let current = null;

    lineItems.forEach((item) => {
      if (item.description && item.description.startsWith('__SECTION__:')) {
        const title = item.description.slice('__SECTION__:'.length);
        current = { id: Date.now() + Math.random(), title, items: [] };
        rebuilt.push(current);
      } else {
        if (!current) {
          current = { id: Date.now() + Math.random(), title: 'Section 1', items: [] };
          rebuilt.push(current);
        }
        current.items.push({
          id: Date.now() + Math.random(),
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          markup: item.markup || 0,
          total: item.total,
        });
      }
    });

    setSections(rebuilt.length > 0 ? rebuilt : [{ id: Date.now(), title: 'Section 1', items: [] }]);
    toast.success(`Loaded: ${estimate.project_name || estimate.client_name}`);
  };

  // ── Reset to blank ─────────────────────────────────────────────────────────
  const handleNew = () => {
    setActiveEstimate(null);
    setSections([{ id: Date.now(), title: 'Section 1', items: [] }]);
    setClientInfo({ client_name: '', project_number: '', project_name: '', client_email: '', client_phone: '', client_address: '', notes: '', tax_rate: 0, discount: 0 });
  };

  const handleCloseEstimate = () => setShowCloseConfirm(true);

  const handleCloseNo = () => {
    setShowCloseConfirm(false);
    handleNew();
  };

  const handleCloseYes = () => {
    setShowCloseConfirm(false);
    saveMutation.mutate(undefined, { onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      handleNew();
    }});
  };

  // ── Sections CRUD ──────────────────────────────────────────────────────────
  const addSection = () => {
    setSections(prev => [...prev, { id: Date.now(), title: `Section ${prev.length + 1}`, items: [] }]);
  };

  const renameSection = (sectionId, title) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s));
  };

  const removeSection = (sectionId) => {
    setSections(prev => prev.filter(s => s.id !== sectionId));
  };

  // ── Items CRUD ─────────────────────────────────────────────────────────────
  const addItemToSection = useCallback((sectionId, item) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const markup = item.markup || 0;
      const unitPrice = item.unit_price || 0;
      const markedUp = unitPrice * (1 + markup / 100);
      const qty = item.quantity || 1;
      return {
        ...s,
        items: [...s.items, {
          id: Date.now() + Math.random(),
          description: item.description || '',
          quantity: qty,
          unit_price: unitPrice,
          markup,
          total: markedUp * qty,
        }]
      };
    }));
  }, []);

  const updateItem = (sectionId, itemId, field, value) => {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        items: s.items.map(item => {
          if (item.id !== itemId) return item;
          const updated = { ...item, [field]: value };
          const markedUp = updated.unit_price * (1 + updated.markup / 100);
          updated.total = markedUp * updated.quantity;
          return updated;
        })
      };
    }));
  };

  const removeItem = (sectionId, itemId) => {
    setSections(prev => prev.map(s => ({
      ...s,
      items: s.items.filter(i => i.id !== itemId)
    })));
  };

  const reorderItems = (sectionId, newItems) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, items: newItems } : s));
  };

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal = sections.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.total || 0), 0), 0);
  const taxAmount = subtotal * (clientInfo.tax_rate / 100);
  const total = subtotal + taxAmount - (clientInfo.discount || 0);

  // ── Save / Update ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const lineItems = [];
      sections.forEach(s => {
        lineItems.push({ description: `__SECTION__:${s.title}`, quantity: 0, unit_price: 0, total: 0 });
        s.items.forEach(item => {
          lineItems.push({ description: item.description, quantity: item.quantity, unit_price: item.unit_price, markup: item.markup, total: item.total });
        });
      });

      // If already editing a known record, always update it
      if (activeEstimate) {
        const payload = {
          ...clientInfo,
          line_items: lineItems,
          subtotal,
          tax_amount: taxAmount,
          total,
          status: activeEstimate.status,
          estimate_number: activeEstimate.estimate_number,
        };
        return base44.entities.Estimate.update(activeEstimate.id, payload);
      }

      // New save: if project_name is set, check for an existing record with that name first
      if (clientInfo.project_name.trim()) {
        const existing = await base44.entities.Estimate.filter({ project_name: clientInfo.project_name.trim() });
        if (existing && existing.length > 0) {
          // Update the existing record instead of creating a duplicate
          const match = existing[0];
          const payload = {
            ...clientInfo,
            line_items: lineItems,
            subtotal,
            tax_amount: taxAmount,
            total,
            status: match.status || 'draft',
            estimate_number: match.estimate_number,
          };
          return base44.entities.Estimate.update(match.id, payload);
        }
      }

      // Truly new — create
      const payload = {
        ...clientInfo,
        line_items: lineItems,
        subtotal,
        tax_amount: taxAmount,
        total,
        status: 'draft',
        estimate_number: `EST-${Date.now().toString().slice(-6)}`,
      };
      return base44.entities.Estimate.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      setActiveEstimate(saved);
      toast.success(activeEstimate ? 'Estimate updated!' : 'Estimate saved as draft!');
    },
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-foreground">Create Estimate Panel</h1>
          {activeEstimate && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              Editing: {activeEstimate.estimate_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <EstimateSearchBar onLoad={loadEstimate} />
          <button
            onClick={handleCloseEstimate}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
            title="Close estimate"
          >
            <X className="h-3.5 w-3.5" /> Close Estimate
          </button>
          <button onClick={handleNew} className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            + New
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="text-xs px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            {saveMutation.isPending ? 'Saving…' : activeEstimate ? 'Update Estimate' : 'Save Draft'}
          </button>
        </div>
      </div>

      {/* Close Confirmation Dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold text-foreground mb-2">Un-Saved Estimate!</h2>
            <p className="text-sm text-muted-foreground mb-6">Do you wish to save the document?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCloseNo}
                className="px-4 py-2 text-sm rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                No
              </button>
              <button
                onClick={handleCloseYes}
                disabled={saveMutation.isPending}
                className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                {saveMutation.isPending ? 'Saving…' : 'Yes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main split layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Tool Palette */}
        <PalettePanel
          inventory={inventory}
          sections={sections}
          onAddSection={addSection}
          onAddItemToSection={addItemToSection}
          projectNumber={clientInfo.project_name}
        />

        {/* RIGHT: Estimate Canvas */}
        <EstimateCanvas
          clientInfo={clientInfo}
          onClientInfoChange={setClientInfo}
          sections={sections}
          onRenameSection={renameSection}
          onRemoveSection={removeSection}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onReorderItems={reorderItems}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          inventory={inventory}
        />
      </div>
    </div>
  );
}