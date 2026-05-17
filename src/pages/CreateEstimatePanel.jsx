import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { ArrowLeft, Plus, Trash2, GripVertical, Tag, ChevronDown, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const TABS = ['Client', 'Line Items', 'Totals', 'Notes', 'Preview'];

const STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'expired'];

function genEstimateNumber() {
  return `EST-${Date.now().toString().slice(-6)}`;
}

function newLineItem(id) {
  return { id, description: '', quantity: 1, unit_price: 0, total: 0, is_category: false, category_name: '' };
}

function newCategory(id, name = '') {
  return { id, description: '', quantity: 0, unit_price: 0, total: 0, is_category: true, category_name: name };
}

export default function CreateEstimatePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('Client');

  const [client, setClient] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_address: '',
  });

  const [details, setDetails] = useState({
    estimate_number: genEstimateNumber(),
    project_name: '',
    status: 'draft',
    valid_until: '',
    description: '',
  });

  const [lineItems, setLineItems] = useState([
    newLineItem(1),
  ]);
  const [nextId, setNextId] = useState(2);

  const [totals, setTotals] = useState({
    tax_rate: 0,
    markup_pct: 0,
    discount: 0,
  });

  const [notes, setNotes] = useState('');
  const [editingEstimateId, setEditingEstimateId] = useState(null); // null = new, id = editing existing
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef(null);

  const { data: allEstimates = [] } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => base44.entities.Estimate.list('-created_date', 50),
  });

  const filteredEstimates = useMemo(() => {
    if (!searchQuery.trim()) return allEstimates.slice(0, 8);
    const q = searchQuery.toLowerCase();
    return allEstimates.filter(e =>
      e.client_name?.toLowerCase().includes(q) ||
      e.project_name?.toLowerCase().includes(q) ||
      e.estimate_number?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allEstimates, searchQuery]);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  // Load an existing estimate into the editor
  const loadEstimate = (est) => {
    setEditingEstimateId(est.id);
    setClient({
      client_name: est.client_name || '',
      client_email: est.client_email || '',
      client_phone: est.client_phone || '',
      client_address: est.client_address || '',
    });
    setDetails({
      estimate_number: est.estimate_number || genEstimateNumber(),
      project_name: est.project_name || '',
      status: est.status || 'draft',
      valid_until: est.valid_until || '',
      description: est.description || '',
    });
    setTotals({
      tax_rate: est.tax_rate || 0,
      markup_pct: 0, // markup not stored separately, reset
      discount: est.discount || 0,
    });
    setNotes(est.notes || '');

    // Reconstruct line items from saved data
    const loaded = (est.line_items || []).map((li, i) => {
      const isCat = li.description?.startsWith('──') && li.quantity === 0 && li.unit_price === 0;
      return {
        id: i + 1,
        description: isCat ? '' : li.description || '',
        quantity: li.quantity || 1,
        unit_price: li.unit_price || 0,
        total: li.total || 0,
        is_category: isCat,
        category_name: isCat ? li.description.replace(/^──\s*/, '').replace(/\s*──$/, '').trim() : '',
      };
    });
    setLineItems(loaded.length > 0 ? loaded : [newLineItem(1)]);
    setNextId((loaded.length || 1) + 1);
    setShowSearch(false);
    setSearchQuery('');
    setActiveTab('Client');
    toast.success(`Loaded: ${est.estimate_number || est.project_name}`);
  };

  // --- Calculations ---
  const subtotalBeforeMarkup = useMemo(() => {
    return lineItems
      .filter(i => !i.is_category)
      .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  }, [lineItems]);

  const markupAmount = useMemo(() => {
    return subtotalBeforeMarkup * ((parseFloat(totals.markup_pct) || 0) / 100);
  }, [subtotalBeforeMarkup, totals.markup_pct]);

  const subtotal = subtotalBeforeMarkup + markupAmount;
  const taxAmount = subtotal * ((parseFloat(totals.tax_rate) || 0) / 100);
  const discount = parseFloat(totals.discount) || 0;
  const grandTotal = subtotal + taxAmount - discount;

  // --- Line Item Handlers ---
  const addLineItem = () => {
    setLineItems(prev => [...prev, newLineItem(nextId)]);
    setNextId(n => n + 1);
  };

  const addCategory = () => {
    setLineItems(prev => [...prev, newCategory(nextId)]);
    setNextId(n => n + 1);
  };

  const removeItem = (id) => {
    setLineItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = (id, field, value) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (!item.is_category && (field === 'quantity' || field === 'unit_price')) {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(item.quantity) || 0;
        const price = field === 'unit_price' ? parseFloat(value) || 0 : parseFloat(item.unit_price) || 0;
        updated.total = qty * price;
      }
      return updated;
    }));
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(lineItems);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setLineItems(reordered);
  };

  // --- Save ---
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        estimate_number: details.estimate_number || undefined,
        client_name: client.client_name,
        client_email: client.client_email || undefined,
        client_phone: client.client_phone || undefined,
        client_address: client.client_address || undefined,
        project_name: details.project_name,
        status: details.status,
        ...(details.valid_until ? { valid_until: details.valid_until } : {}),
        ...(details.description ? { description: details.description } : {}),
        line_items: lineItems.map(i => ({
          description: i.is_category ? `── ${i.category_name} ──` : i.description,
          quantity: i.is_category ? 0 : parseFloat(i.quantity) || 0,
          unit_price: i.is_category ? 0 : parseFloat(i.unit_price) || 0,
          total: i.is_category ? 0 : parseFloat(i.total) || 0,
        })),
        subtotal,
        tax_rate: parseFloat(totals.tax_rate) || 0,
        tax_amount: taxAmount,
        discount,
        total: grandTotal,
        notes: notes || undefined,
      };
      if (editingEstimateId) {
        return base44.entities.Estimate.update(editingEstimateId, payload);
      }
      return base44.entities.Estimate.create(payload);
    },
    onSuccess: (estimate) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success(editingEstimateId ? 'Estimate updated!' : 'Estimate saved!');
      navigate(`/estimates/${estimate.id}`);
    },
    onError: (err) => toast.error(`Failed to save: ${err?.message || 'Unknown error'}`),
  });

  const handleSave = () => {
    if (!client.client_name?.trim()) { setActiveTab('Client'); toast.error('Client name is required'); return; }
    if (!details.project_name?.trim()) { setActiveTab('Client'); toast.error('Project name is required'); return; }
    saveMutation.mutate();
  };

  // --- Input style ---
  const inp = "w-full bg-[#1e1e1e] border border-[#333] rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary";
  const lbl = "block text-xs text-gray-400 mb-1";

  return (
    <div className="min-h-screen bg-[#111] flex flex-col font-inter">
      {/* Tab Bar */}
      <div className="flex border-b border-[#2a2a2a] bg-[#111]">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-4 text-sm font-medium transition-colors border-r border-[#2a2a2a] last:border-r-0 ${
              activeTab === tab
                ? 'text-white border-b-2 border-b-primary bg-[#1a1a1a]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#161616]'
            }`}
            style={activeTab === tab ? { borderBottom: '2px solid hsl(var(--primary))', outline: '1px solid hsl(var(--primary))', outlineOffset: '-1px' } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Page Header */}
      <div className="px-8 pt-6 pb-4 flex items-center gap-4 border-b border-[#1e1e1e]">
        <button onClick={() => navigate('/estimates')} className="w-9 h-9 rounded-full bg-[#1e1e1e] border border-[#333] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{editingEstimateId ? 'Edit Estimate' : 'New Estimate'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{editingEstimateId ? `Editing ${details.estimate_number}` : 'Fill in the details to create a new estimate'}</p>
        </div>

        {/* Search Existing Estimates */}
        <div className="relative">
          {showSearch ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <input
                  ref={searchRef}
                  className="w-72 bg-[#1e1e1e] border border-[#444] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  placeholder="Search by client, project, or EST#..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="text-gray-500 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
              {/* Dropdown */}
              {(searchQuery.trim() || allEstimates.length > 0) && (
                <div className="absolute top-full right-0 mt-1 w-[420px] bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#2a2a2a] text-xs text-gray-500">
                    {searchQuery ? `${filteredEstimates.length} result(s) for "${searchQuery}"` : 'Recent estimates'}
                  </div>
                  {filteredEstimates.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">No estimates found</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      {filteredEstimates.map(est => (
                        <button
                          key={est.id}
                          onClick={() => loadEstimate(est)}
                          className="w-full text-left px-4 py-3 hover:bg-[#222] transition-colors border-b border-[#222] last:border-b-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-mono">{est.estimate_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              est.status === 'accepted' ? 'bg-green-900/40 text-green-400' :
                              est.status === 'declined' ? 'bg-red-900/40 text-red-400' :
                              est.status === 'sent' ? 'bg-blue-900/40 text-blue-400' :
                              'bg-gray-800 text-gray-400'
                            }`}>{est.status}</span>
                          </div>
                          <div className="text-sm text-white font-medium mt-0.5">{est.client_name}</div>
                          <div className="text-xs text-gray-400">{est.project_name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-[#333] hover:border-[#555] bg-[#1e1e1e] rounded-lg px-4 py-2 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Find Estimate
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto px-8 py-6">

        {/* CLIENT TAB */}
        {activeTab === 'Client' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
            {/* Client Information */}
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Client Information</h2>
              <div>
                <label className={lbl}>Client Name <span className="text-primary">*</span></label>
                <input className={inp} placeholder="Acme Corp" value={client.client_name} onChange={e => setClient(p => ({ ...p, client_name: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input className={inp} placeholder="client@email.com" value={client.client_email} onChange={e => setClient(p => ({ ...p, client_email: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input className={inp} placeholder="(555) 123-4567" value={client.client_phone} onChange={e => setClient(p => ({ ...p, client_phone: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Address</label>
                <input className={inp} placeholder="123 Main St..." value={client.client_address} onChange={e => setClient(p => ({ ...p, client_address: e.target.value }))} />
              </div>
            </div>

            {/* Estimate Details */}
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Estimate Details</h2>
              <div>
                <label className={lbl}>Estimate Number</label>
                <input className={inp} value={details.estimate_number} onChange={e => setDetails(p => ({ ...p, estimate_number: e.target.value }))} />
              </div>
              <div>
                <label className={lbl}>Project Name <span className="text-primary">*</span></label>
                <input className={inp} placeholder="Website Redesign" value={details.project_name} onChange={e => setDetails(p => ({ ...p, project_name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Status</label>
                  <div className="relative">
                    <select className={inp + ' appearance-none pr-8'} value={details.status} onChange={e => setDetails(p => ({ ...p, status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Valid Until</label>
                  <input type="date" className={inp} value={details.valid_until} onChange={e => setDetails(p => ({ ...p, valid_until: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={lbl}>Description</label>
                <textarea className={inp + ' resize-none h-20'} placeholder="Brief project overview for this estimate..." value={details.description} onChange={e => setDetails(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* LINE ITEMS TAB */}
        {activeTab === 'Line Items' && (
          <div className="max-w-5xl">
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid text-xs text-gray-400 font-semibold bg-[#1a1a1a] border-b border-[#2a2a2a] px-4 py-3" style={{ gridTemplateColumns: '2rem 1fr 6rem 9rem 8rem 2.5rem' }}>
                <span></span>
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Total</span>
                <span></span>
              </div>

              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="line-items">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {lineItems.map((item, index) => (
                        <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                          {(drag, snapshot) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className={`border-b border-[#222] ${snapshot.isDragging ? 'bg-[#2a2a2a]' : item.is_category ? 'bg-[#1c1c1c]' : 'bg-[#161616]'}`}
                            >
                              {item.is_category ? (
                                // Category Header Row
                                <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: '2rem 1fr 6rem 9rem 8rem 2.5rem' }}>
                                  <span {...drag.dragHandleProps} className="text-gray-600 hover:text-gray-400 cursor-grab">
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                  <div className="flex items-center gap-2 col-span-4">
                                    <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <input
                                      className="bg-transparent border-b border-primary/50 focus:border-primary text-primary text-xs font-bold uppercase tracking-widest outline-none flex-1 placeholder-primary/40"
                                      placeholder="CATEGORY NAME"
                                      value={item.category_name}
                                      onChange={e => updateItem(item.id, 'category_name', e.target.value)}
                                    />
                                  </div>
                                  <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-destructive transition-colors flex justify-center">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                // Line Item Row
                                <div className="grid items-center px-4 py-2" style={{ gridTemplateColumns: '2rem 1fr 6rem 9rem 8rem 2.5rem' }}>
                                  <span {...drag.dragHandleProps} className="text-gray-600 hover:text-gray-400 cursor-grab">
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                  <input
                                    className="bg-[#1e1e1e] border border-[#2d2d2d] rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary mr-3"
                                    placeholder="Description"
                                    value={item.description}
                                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    className="bg-[#1e1e1e] border border-[#2d2d2d] rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-primary mx-1"
                                    value={item.quantity}
                                    onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                                  />
                                  <div className="relative mx-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded pl-5 pr-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-primary"
                                      value={item.unit_price}
                                      onChange={e => updateItem(item.id, 'unit_price', e.target.value)}
                                    />
                                  </div>
                                  <span className="text-sm text-white text-right px-2 font-medium">
                                    ${(parseFloat(item.total) || 0).toFixed(2)}
                                  </span>
                                  <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-destructive transition-colors flex justify-center">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              {/* Add Buttons Row */}
              <div className="px-4 py-3 flex items-center gap-3 bg-[#141414]">
                <button onClick={addLineItem} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-[#2d2d2d] hover:border-[#444] rounded px-3 py-1.5 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
                <button onClick={addCategory} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary border border-[#2d2d2d] hover:border-primary/40 rounded px-3 py-1.5 transition-colors">
                  <Tag className="h-3.5 w-3.5" /> Add Category
                </button>
                <span className="ml-auto text-xs text-gray-500">Subtotal: <span className="text-white font-semibold">${subtotalBeforeMarkup.toFixed(2)}</span></span>
              </div>
            </div>
          </div>
        )}

        {/* TOTALS TAB */}
        {activeTab === 'Totals' && (
          <div className="max-w-xl space-y-4">
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Adjustments</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={lbl}>Markup %</label>
                  <div className="relative">
                    <input type="number" min="0" step="0.1" className={inp + ' pr-6'} value={totals.markup_pct} onChange={e => setTotals(p => ({ ...p, markup_pct: e.target.value }))} />
                    <span className="absolute right-2 top-2 text-gray-500 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Tax Rate %</label>
                  <div className="relative">
                    <input type="number" min="0" step="0.1" className={inp + ' pr-6'} value={totals.tax_rate} onChange={e => setTotals(p => ({ ...p, tax_rate: e.target.value }))} />
                    <span className="absolute right-2 top-2 text-gray-500 text-sm">%</span>
                  </div>
                </div>
                <div>
                  <label className={lbl}>Discount $</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-gray-500 text-sm">$</span>
                    <input type="number" min="0" step="0.01" className={inp + ' pl-5'} value={totals.discount} onChange={e => setTotals(p => ({ ...p, discount: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white mb-3">Summary</h2>
              {[
                { label: 'Subtotal (before markup)', value: subtotalBeforeMarkup },
                ...(markupAmount !== 0 ? [{ label: `Markup (${totals.markup_pct}%)`, value: markupAmount }] : []),
                { label: 'Subtotal', value: subtotal },
                ...(taxAmount !== 0 ? [{ label: `Tax (${totals.tax_rate}%)`, value: taxAmount }] : []),
                ...(discount !== 0 ? [{ label: 'Discount', value: -discount }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm text-gray-400">
                  <span>{label}</span>
                  <span className={value < 0 ? 'text-destructive' : 'text-white'}>{value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-[#2a2a2a] pt-3 flex justify-between">
                <span className="font-bold text-white">Grand Total</span>
                <span className="font-bold text-lg text-primary">${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === 'Notes' && (
          <div className="max-w-2xl">
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Notes & Terms</h2>
              <textarea
                className={inp + ' resize-none h-64'}
                placeholder="Add payment terms, conditions, or any additional notes for the client..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'Preview' && (
          <div className="max-w-3xl">
            <div className="bg-white text-gray-900 rounded-xl p-10 shadow-2xl">
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">ESTIMATE</h1>
                  <p className="text-gray-500 text-sm mt-1">{details.estimate_number}</p>
                </div>
                <div className="text-right text-sm text-gray-600 space-y-1">
                  {details.valid_until && <p>Valid until: <span className="font-medium">{details.valid_until}</span></p>}
                  <p className="capitalize font-semibold" style={{ color: 'hsl(var(--primary))' }}>{details.status}</p>
                </div>
              </div>

              {/* Client & Project */}
              <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-gray-200">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Bill To</p>
                  <p className="font-bold text-gray-900">{client.client_name || '—'}</p>
                  {client.client_email && <p className="text-sm text-gray-600">{client.client_email}</p>}
                  {client.client_phone && <p className="text-sm text-gray-600">{client.client_phone}</p>}
                  {client.client_address && <p className="text-sm text-gray-600">{client.client_address}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Project</p>
                  <p className="font-bold text-gray-900">{details.project_name || '—'}</p>
                  {details.description && <p className="text-sm text-gray-600 mt-1">{details.description}</p>}
                </div>
              </div>

              {/* Line Items */}
              <table className="w-full text-sm mb-8">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 text-xs text-gray-400 uppercase tracking-wide">Description</th>
                    <th className="text-center py-2 text-xs text-gray-400 uppercase tracking-wide w-16">Qty</th>
                    <th className="text-right py-2 text-xs text-gray-400 uppercase tracking-wide w-28">Unit Price</th>
                    <th className="text-right py-2 text-xs text-gray-400 uppercase tracking-wide w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => item.is_category ? (
                    <tr key={i} className="bg-gray-50">
                      <td colSpan={4} className="py-2 px-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--primary))' }}>
                        {item.category_name || 'Category'}
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 text-gray-800">{item.description || '—'}</td>
                      <td className="py-2 text-center text-gray-700">{item.quantity}</td>
                      <td className="py-2 text-right text-gray-700">${(parseFloat(item.unit_price) || 0).toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">${(parseFloat(item.total) || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>${subtotalBeforeMarkup.toFixed(2)}</span></div>
                  {markupAmount > 0 && <div className="flex justify-between text-gray-600"><span>Markup ({totals.markup_pct}%)</span><span>${markupAmount.toFixed(2)}</span></div>}
                  {taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({totals.tax_rate}%)</span><span>${taxAmount.toFixed(2)}</span></div>}
                  {discount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>}
                  <div className="border-t-2 border-gray-900 pt-2 flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span style={{ color: 'hsl(var(--primary))' }}>${grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {notes && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Notes & Terms</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Bottom Status Bar */}
      <div className="sticky bottom-0 bg-[#0e0e0e] border-t border-[#2a2a2a] px-8 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-400">
          Estimate Total: <span className="text-white font-bold">${grandTotal.toFixed(2)}</span>
        </span>
        <div className="flex items-center gap-3">
          {editingEstimateId && (
            <button
              onClick={() => {
                setEditingEstimateId(null);
                setClient({ client_name: '', client_email: '', client_phone: '', client_address: '' });
                setDetails({ estimate_number: genEstimateNumber(), project_name: '', status: 'draft', valid_until: '', description: '' });
                setLineItems([newLineItem(1)]);
                setNextId(2);
                setTotals({ tax_rate: 0, markup_pct: 0, discount: 0 });
                setNotes('');
                setActiveTab('Client');
              }}
              className="text-sm text-gray-400 hover:text-white border border-[#333] hover:border-[#555] rounded-md px-4 py-2 transition-colors"
            >
              + New Estimate
            </button>
          )}
          <button onClick={() => navigate('/estimates')} className="text-sm text-gray-400 hover:text-white transition-colors px-4 py-2">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-6 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : editingEstimateId ? 'Update Estimate' : 'Save Estimate'}
          </button>
        </div>
      </div>
    </div>
  );
}