import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react';

function EditableCell({ value, onChange, type = 'text', className = '' }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        className={`bg-secondary border border-primary rounded px-1 py-0.5 text-xs text-foreground outline-none ${className}`}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onChange(type === 'number' ? parseFloat(local) || 0 : local); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onChange(type === 'number' ? parseFloat(local) || 0 : local); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <span className={`cursor-pointer hover:text-primary transition-colors ${className}`} onClick={() => { setLocal(value); setEditing(true); }}>
      {value}
    </span>
  );
}

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';

// For each subtotal-header item, compute the running sum of all non-header items
// below it until the next header (or end of list).
function buildSubtotals(items) {
  // subtotalMap[headerItemId] = sum of items below it until next header
  const map = {};
  for (let i = 0; i < items.length; i++) {
    if (isSubtotalHeader(items[i].description)) {
      let sum = 0;
      for (let j = i + 1; j < items.length; j++) {
      if (isSubtotalHeader(items[j].description)) break;
      if (isSpacer(items[j].description)) continue;
      sum += items[j].total || 0;
      }
      map[items[i].id] = sum;
    }
  }
  return map;
}

function SectionBlock({ section, onRename, onRemove, onUpdateItem, onRemoveItem, onReorderItems, inventory }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const sectionTotal = section.items.reduce((s, i) => s + (i.total || 0), 0);
  const subtotalMap = buildSubtotals(section.items);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(section.items);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    onReorderItems(section.id, items);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/60">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={() => setCollapsed(v => !v)} className="text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          {editingTitle ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                autoFocus
                className="flex-1 text-xs bg-secondary border border-primary rounded px-2 py-0.5 text-foreground outline-none"
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onBlur={() => { onRename(section.id, titleVal); setEditingTitle(false); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onRename(section.id, titleVal); setEditingTitle(false); }
                  if (e.key === 'Escape') { setEditingTitle(false); }
                }}
              />
              <button onClick={() => { onRename(section.id, titleVal); setEditingTitle(false); }}><Check className="h-3.5 w-3.5 text-primary" /></button>
              <button onClick={() => setEditingTitle(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
          ) : (
            <span
              className="text-xs font-semibold text-foreground truncate cursor-text hover:text-primary transition-colors"
              onClick={() => { setTitleVal(section.title); setEditingTitle(true); }}
              title="Click to rename section"
            >
              {section.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-primary">${sectionTotal.toFixed(2)}</span>
          <button onClick={() => onRemove(section.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Column headers */}
          <div className="grid gap-1 px-3 py-1.5 bg-secondary/30 border-b border-border text-xs text-muted-foreground font-medium" style={{gridTemplateColumns:'28px 1fr 56px 88px 60px 88px 88px 28px'}}>
            <div></div>
            <div>Description</div>
            <div className="text-right">Qty</div>
            <div className="text-right">Unit $</div>
            <div className="text-right">Mkup%</div>
            <div className="text-right">Total</div>
            <div className="text-center">Item_ID</div>
            <div></div>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`section-${section.id}`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {section.items.map((item, idx) => {
                    const isHeader = isSubtotalHeader(item.description);
                    const spacer = isSpacer(item.description);
                    const headerSubtotal = isHeader ? subtotalMap[item.id] : null;
                    return (
                    <Draggable key={String(item.id)} draggableId={String(item.id)} index={idx}>
                      {(drag, snapshot) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={`grid gap-1 px-3 border-b border-border last:border-b-0 items-center text-xs transition-colors
                            ${isHeader ? 'py-1.5 bg-orange-500/10 border-l-2 border-l-orange-500' : ''}
                            ${spacer ? 'py-2 bg-green-500/20' : ''}
                            ${!isHeader && !spacer ? 'py-1.5' : ''}
                            ${snapshot.isDragging ? 'bg-secondary/60' : (!isHeader && !spacer ? 'hover:bg-secondary/20' : '')}`}
                          style={{gridTemplateColumns:'28px 1fr 56px 88px 60px 88px 88px 28px', ...drag.draggableProps.style}}
                        >
                          <div className="flex items-center" {...drag.dragHandleProps}>
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
                          </div>
                          <div className={isHeader ? 'font-bold text-orange-400' : 'text-foreground'}>
                            {!spacer && (
                              <EditableCell
                                value={item.description}
                                onChange={v => onUpdateItem(section.id, item.id, 'description', v)}
                                className={`w-full ${isHeader ? 'text-orange-400 font-bold' : ''}`}
                              />
                            )}
                          </div>
                          <div className="text-right">
                            {!isHeader && !spacer && <EditableCell value={item.quantity} onChange={v => onUpdateItem(section.id, item.id, 'quantity', v)} type="number" className="w-14 text-right" />}
                          </div>
                          <div className="text-right">
                            {!isHeader && !spacer && <EditableCell value={item.unit_price} onChange={v => onUpdateItem(section.id, item.id, 'unit_price', v)} type="number" className="w-20 text-right" />}
                          </div>
                          <div className="text-right">
                            {!isHeader && !spacer && <EditableCell value={item.markup} onChange={v => onUpdateItem(section.id, item.id, 'markup', v)} type="number" className="w-14 text-right" />}
                          </div>
                          <div className={`text-right font-semibold ${isHeader ? 'text-orange-400' : 'text-foreground'}`}>
                            {!spacer && (isHeader
                              ? `$${(headerSubtotal || 0).toFixed(2)}`
                              : `$${(item.total || 0).toFixed(2)}`
                            )}
                          </div>
                          <div className="text-center text-muted-foreground font-mono truncate">
                            {!isHeader && !spacer && (() => {
                              const desc = (item.description || '').toLowerCase();
                              const match = inventory.find(i => (i.name || '').toLowerCase() === desc || (i.sku || '').toLowerCase() === desc);
                              return match ? <span className="text-primary">{match.id.slice(-8)}</span> : <span className="opacity-30">—</span>;
                            })()}
                          </div>
                          <div className="flex justify-end">
                            <button onClick={() => onRemoveItem(section.id, item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  {section.items.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      Drop items here from the palette →
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}
    </div>
  );
}

export default function EstimateCanvas({
  clientInfo, onClientInfoChange,
  sections, onRenameSection, onRemoveSection,
  onUpdateItem, onRemoveItem, onReorderItems,
  subtotal, taxAmount, total, inventory = [],
}) {
  const [showClient, setShowClient] = useState(true);

  const update = (field, value) => onClientInfoChange(prev => ({ ...prev, [field]: value }));

  return (
    <div className="flex-1 overflow-y-auto bg-background p-5 space-y-4">
      {/* Client Info */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowClient(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/40 text-xs font-semibold text-foreground hover:bg-secondary/60 transition-colors"
        >
          Client & Project Info
          {showClient ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showClient && (
          <div className="grid grid-cols-2 gap-3 p-4">
            {[
              { label: 'Client Name', field: 'client_name' },
              { label: 'Project Number', field: 'project_number' },
              { label: 'Email', field: 'client_email' },
              { label: 'Phone', field: 'client_phone' },
              { label: 'Address', field: 'client_address' },
            ].map(({ label, field }) => (
              <div key={field}>
                <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                <input
                  className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary transition-colors"
                  value={clientInfo[field]}
                  onChange={e => update(field, e.target.value)}
                  placeholder={label}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notes</label>
              <textarea
                className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 text-foreground outline-none focus:border-primary transition-colors resize-none h-16"
                value={clientInfo.notes}
                onChange={e => update('notes', e.target.value)}
                placeholder="Notes / terms…"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      {sections.map(section => (
        <SectionBlock
          key={section.id}
          section={section}
          onRename={onRenameSection}
          onRemove={onRemoveSection}
          onUpdateItem={onUpdateItem}
          onRemoveItem={onRemoveItem}
          onReorderItems={onReorderItems}
          inventory={inventory}
        />
      ))}

      {/* Totals */}
      <div className="border border-border rounded-lg p-4 bg-card ml-auto max-w-xs space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
          <span>Tax %</span>
          <input
            type="number" min="0" max="100"
            className="w-16 text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground outline-none text-right"
            value={clientInfo.tax_rate}
            onChange={e => update('tax_rate', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Tax Amount</span>
          <span>${taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
          <span>Discount $</span>
          <input
            type="number" min="0"
            className="w-16 text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground outline-none text-right"
            value={clientInfo.discount}
            onChange={e => update('discount', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="border-t border-border pt-2 flex justify-between text-sm font-bold text-foreground">
          <span>Total</span>
          <span className="text-primary">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}