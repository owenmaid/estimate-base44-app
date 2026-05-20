import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Check, X } from 'lucide-react';

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
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();
const HOUR_ITEMS = ['total labour | logistics cost', 'dcsm est total hours', 'total ventilation labour hours', 'total project labour hours'];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isHourSection = (title) => HOUR_ITEMS.includes(normalizeDesc(title));

// For each [bracket] row, sum all regular items below it until the next [bracket] row.
// Exception: [Total Project Labour Hours] uses its injected item.total directly (sum of DCSM + Vent hours).
function buildSubtotals(items) {
  const map = {};
  items.forEach((item, idx) => {
    if (!isSubtotalHeader(item.description)) return;
    const n = normalizeDesc(item.description);
    // [Total Project Labour Hours] uses injected total, not sum of items below
    if (n === 'total project labour hours') {
      map[item.id] = item.total || 0;
      return;
    }
    let sum = 0;
    for (let j = idx + 1; j < items.length; j++) {
      if (isSubtotalHeader(items[j].description)) break;
      if (isSpacer(items[j].description)) continue;
      sum += items[j].total || 0;
    }
    map[item.id] = sum;
  });
  return map;
}

function SectionBlock({ section, onRename, onRemove, onUpdateItem, onRemoveItem, onReorderItems, inventory, dragHandleProps }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const subtotalMap = buildSubtotals(section.items);

  // Section total = sum of all [bracket] row values if any exist, otherwise sum all line items
  const bracketItems = section.items.filter(i => isSubtotalHeader(i.description));
  const sectionTotal = bracketItems.length > 0
    ? bracketItems.reduce((s, i) => s + (subtotalMap[i.id] || 0), 0)
    : section.items.filter(i => !isSpacer(i.description)).reduce((s, i) => s + (i.total || 0), 0);

  // Check if this is the Project Totals section
  const isProjectTotalsSection = normalizeDesc(section.title) === 'project totals';

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
          <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
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
          {!isProjectTotalsSection && (
            <span className="text-xs font-semibold text-primary">
              {(isHourSection(section.title) || section.items.some(i => isHourItem(i.description)))
                ? Math.round(sectionTotal).toLocaleString()
                : `$${sectionTotal.toFixed(2)}`}
            </span>
          )}
          <button onClick={() => onRemove(section.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Column headers — only show if there are items */}
          {section.items.length > 0 && !isProjectTotalsSection && (
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
          )}

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`section-${section.id}`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {section.items.map((item, idx) => {
                    const isHeader = isSubtotalHeader(item.description);
                    const spacer = isSpacer(item.description);
                    const headerSubtotal = isHeader ? subtotalMap[item.id] : null;
                    // For [Total Project Cost] bracket, use the injected item.total directly instead of summing below items
                    const isProjectCostBracket = isHeader && normalizeDesc(item.description) === 'total project cost';
                    const displayTotal = isProjectCostBracket ? (item.total || 0) : (headerSubtotal || 0);
                    return (
                    <Draggable key={String(item.id)} draggableId={String(item.id)} index={idx}>
                      {(drag, snapshot) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={`grid gap-1 px-3 border-b border-border last:border-b-0 items-center text-xs transition-colors
                            ${isHeader ? 'py-1.5 bg-orange-500/10 border-l-2 border-l-orange-500' : ''}
                            ${spacer ? 'py-2 bg-gray-500/20' : ''}
                            ${!isHeader && !spacer ? 'py-1.5' : ''}
                            ${snapshot.isDragging ? 'bg-secondary/60' : (!isHeader && !spacer ? 'hover:bg-secondary/20' : '')}`}
                          style={{gridTemplateColumns: isProjectTotalsSection ? '28px 1fr 88px 28px' : '28px 1fr 56px 88px 60px 88px 88px 28px', ...drag.draggableProps.style}}
                        >
                          <div className="flex items-center" {...drag.dragHandleProps}>
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
                          </div>
                          {isProjectTotalsSection ? (
                            <>
                              <div className={isHeader ? 'font-bold text-orange-400' : 'text-foreground'}>
                                {!spacer && (
                                  <EditableCell
                                    value={item.description}
                                    onChange={v => onUpdateItem(section.id, item.id, 'description', v)}
                                    className={`w-full ${isHeader ? 'text-orange-400 font-bold' : ''}`}
                                  />
                                )}
                              </div>
                              <div className={`text-right font-semibold ${isHeader ? 'text-orange-400' : 'text-foreground'}`}>
                               {!spacer && (
                                 isHourItem(item.description)
                                   ? Math.round(item.total || 0).toLocaleString()
                                   : isProjectCostBracket
                                     ? `$${Number(displayTotal || 0).toFixed(2)}`
                                     : `$${Number(item.total || 0).toFixed(2)}`
                               )}
                              </div>
                              <div className="flex justify-end">
                                <button onClick={() => onRemoveItem(section.id, item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
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
                                 ? (isHourItem(item.description)
                                     ? Math.round(headerSubtotal || 0).toLocaleString()
                                     : isProjectCostBracket
                                       ? `$${Number(displayTotal || 0).toFixed(2)}`
                                       : `$${Number(headerSubtotal || 0).toFixed(2)}`)
                                 : (isHourItem(item.description)
                                     ? Math.round(item.total || 0).toLocaleString()
                                     : `$${Number(item.total || 0).toFixed(2)}`)
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
                            </>
                          )}
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
  onUpdateItem, onRemoveItem, onReorderItems, onReorderSections,
  subtotal, taxAmount, total, inventory = [], logoUrls = {},
}) {
  const [showClient, setShowClient] = useState(true);

  const update = (field, value) => onClientInfoChange(prev => ({ ...prev, [field]: value }));

  const handleSectionDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sections);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorderSections(reordered);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-5 space-y-4">
      {/* Header Preview — matches PDF layout */}
      <div className="border border-border rounded-lg overflow-hidden bg-white text-black">
        {/* Logo row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          {/* Left: InfoSignal logo */}
          <div className="w-32 flex items-center">
            {logoUrls.infoSignalLogo
              ? <img src={logoUrls.infoSignalLogo} alt="InfoSignal" className="h-9 w-auto object-contain" />
              : <span className="font-bold text-lg" style={{ color: '#dc6e1e' }}>InfoSignal</span>
            }
          </div>
          {/* Center: DynaVent logo */}
          <div className="flex flex-col items-center">
            {logoUrls.dynaVentLogo
              ? <img src={logoUrls.dynaVentLogo} alt="DynaVent" className="h-9 w-auto object-contain" />
              : <>
                  <span className="font-bold text-base" style={{ color: '#dc6e1e' }}>DynaVent</span>
                  <span className="text-gray-400 uppercase tracking-widest" style={{ fontSize: '7px' }}>Breathe Innovation</span>
                </>
            }
          </div>
          {/* Right: Title */}
          <div className="text-right">
            <span className="font-bold text-sm text-gray-900">DCSM Project Budgetary Estimate</span>
          </div>
        </div>

        {/* Customer details row */}
        <div className="flex px-5 py-2.5 text-xs gap-4 border-b border-gray-200">
          {/* Left: labels + values */}
          <div className="flex gap-4 flex-1">
            <div className="space-y-0.5 text-right shrink-0">
              {['Customer', 'Site / Location / Plant', 'Attention', 'Project Name', 'Project'].map(l => (
                <div key={l} className="font-semibold text-gray-800 leading-5">{l}</div>
              ))}
            </div>
            <div className="space-y-0.5">
              {[
                { field: 'client_name', placeholder: 'Client name' },
                { field: 'client_address', placeholder: 'Site / Location / Plant', wide: true },
                { field: 'client_email', placeholder: 'Attention / Contact' },
                { field: 'project_name', placeholder: 'Project Name', wide: true },
                { field: 'project_number', placeholder: 'Project Number' },
              ].map(({ field, placeholder, wide }) => (
                <input
                  key={field}
                  className={`block leading-5 bg-transparent border-b border-transparent hover:border-orange-300 focus:border-orange-500 outline-none transition-colors ${wide ? 'w-72' : 'w-48'}`}
                  style={{ color: '#dc6e1e' }}
                  value={clientInfo[field]}
                  onChange={e => update(field, e.target.value)}
                  placeholder={placeholder}
                />
              ))}
            </div>
          </div>
          {/* Right: Date */}
          <div className="shrink-0 text-right self-start flex gap-2 items-center">
            <span className="font-semibold text-gray-800">Date</span>
            <span style={{ color: '#dc6e1e' }}>{new Date().toLocaleDateString('en-CA', { day:'2-digit', month:'short', year:'2-digit' }).replace(/ /g, '-')}</span>
          </div>
        </div>

        {/* Edit remaining fields in collapsed section */}
        <div>
          <button
            onClick={() => setShowClient(v => !v)}
            className="w-full flex items-center justify-between px-4 py-1.5 bg-gray-50 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span>Additional fields (Phone, Notes)</span>
            {showClient ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showClient && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Phone</label>
                <input
                  className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 outline-none focus:border-orange-400 transition-colors"
                  value={clientInfo.client_phone}
                  onChange={e => update('client_phone', e.target.value)}
                  placeholder="Phone"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes</label>
                <textarea
                  className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 outline-none focus:border-orange-400 transition-colors resize-none h-12"
                  value={clientInfo.notes}
                  onChange={e => update('notes', e.target.value)}
                  placeholder="Notes / terms…"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sections */}
      <DragDropContext onDragEnd={handleSectionDragEnd}>
        <Droppable droppableId="sections-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
              {sections.map((section, idx) => (
                <Draggable key={String(section.id)} draggableId={`sec-${section.id}`} index={idx}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps}>
                      <SectionBlock
                        section={section}
                        onRename={onRenameSection}
                        onRemove={onRemoveSection}
                        onUpdateItem={onUpdateItem}
                        onRemoveItem={onRemoveItem}
                        onReorderItems={onReorderItems}
                        inventory={inventory}
                        dragHandleProps={drag.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

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