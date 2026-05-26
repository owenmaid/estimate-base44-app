import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Trash2, ChevronDown, ChevronUp, Columns, X } from 'lucide-react';

const isSubtotalHeader = (desc) => /[\[\]]/.test(desc || '');
const isSpacer = (desc) => (desc || '') === '__SPACER__';
const normalizeDesc = (desc) => (desc || '').replace(/[\[\]]/g, '').toLowerCase().trim();
const HOUR_ITEMS = ['total labour | logistics cost', 'dcsm est total hours', 'total ventilation labour hours', 'total project labour hours'];
const isHourItem = (desc) => HOUR_ITEMS.includes(normalizeDesc(desc));
const isHourSection = (title) => HOUR_ITEMS.includes(normalizeDesc(title));

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

function buildSubtotals(items) {
  const map = {};
  items.forEach((item, idx) => {
    if (!isSubtotalHeader(item.description)) return;
    const n = normalizeDesc(item.description);
    // Use the bracket's own total if already injected (for aggregated values)
    if (item.total != null && item.total > 0) {
      map[item.id] = item.total;
      return;
    }
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

function ItemRow({ item, sectionId, onUpdateItem, onRemoveItem, inventory, isProjectTotalsSection, subtotalMap, dragHandleProps }) {
  const isHeader = isSubtotalHeader(item.description);
  const spacer = isSpacer(item.description);
  const headerSubtotal = isHeader ? subtotalMap[item.id] : null;
  const isProjectCostBracket = isHeader && normalizeDesc(item.description) === 'total project cost';
  const displayTotal = isProjectCostBracket ? (item.total || 0) : (headerSubtotal || 0);

  if (isProjectTotalsSection) {
    return (
      <div
        className={`grid gap-1 px-3 border-b border-border last:border-b-0 items-center text-xs transition-colors
          ${isHeader ? 'py-1.5 bg-orange-500/10 border-l-2 border-l-orange-500' : ''}
          ${spacer ? 'py-2 bg-gray-500/20' : ''}
          ${!isHeader && !spacer ? 'py-1.5' : ''}
          hover:bg-secondary/20`}
        style={{gridTemplateColumns: '28px 1fr 88px 28px'}}
      >
        <div className="flex items-center" {...dragHandleProps}>
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
        </div>
        <div className={isHeader ? 'font-bold text-orange-400' : 'text-foreground'}>
          {!spacer && (
            <EditableCell
              value={item.description}
              onChange={v => onUpdateItem(sectionId, item.id, 'description', v)}
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
          <button onClick={() => onRemoveItem(sectionId, item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-1 px-3 border-b border-border last:border-b-0 items-center text-xs transition-colors
        ${isHeader ? 'py-1.5 bg-orange-500/10 border-l-2 border-l-orange-500' : ''}
        ${spacer ? 'py-2 bg-gray-500/20' : ''}
        ${!isHeader && !spacer ? 'py-1.5' : ''}
        hover:bg-secondary/20`}
      style={{gridTemplateColumns: '28px 1fr 56px 88px 60px 88px 88px 28px'}}
    >
      <div className="flex items-center" {...dragHandleProps}>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
      </div>
      <div className={isHeader ? 'font-bold text-orange-400' : 'text-foreground'}>
        {!spacer && (
          <EditableCell
            value={item.description}
            onChange={v => onUpdateItem(sectionId, item.id, 'description', v)}
            className={`w-full ${isHeader ? 'text-orange-400 font-bold' : ''}`}
          />
        )}
      </div>
      <div className="text-right">
        {!spacer && (isHeader ? (
          <span className="text-xs text-muted-foreground">1</span>
        ) : (
          <EditableCell value={item.quantity} onChange={v => onUpdateItem(sectionId, item.id, 'quantity', v)} type="number" className="w-14 text-right" />
        ))}
      </div>
      <div className="text-right">
        {!spacer && (isHeader ? (
          <span className="text-xs text-foreground">
            {isHourItem(item.description)
              ? `${Math.round(displayTotal).toLocaleString()} hrs`
              : `$${Number(displayTotal).toFixed(2)}`}
          </span>
        ) : (
          <EditableCell value={item.unit_price} onChange={v => onUpdateItem(sectionId, item.id, 'unit_price', v)} type="number" className="w-20 text-right" />
        ))}
      </div>
      <div className="text-right">
        {!spacer && (isHeader ? (
          <span className="text-xs text-muted-foreground">0%</span>
        ) : (
          <EditableCell value={item.markup} onChange={v => onUpdateItem(sectionId, item.id, 'markup', v)} type="number" className="w-14 text-right" />
        ))}
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
        <button onClick={() => onRemoveItem(sectionId, item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function SectionBlock({ section, onRename, onRemove, onSplit, onUpdateItem, onRemoveItem, onReorderItems, inventory, dragHandleProps }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  const isProjectTotalsSection = normalizeDesc(section.title) === 'project totals';
  const itemsToRender = section.items;

  const subtotalMap = buildSubtotals(itemsToRender);

  // Section total: if the section has bracket headers, sum the bracket subtotals (avoids double-counting raw children).
  // Otherwise sum raw leaf items directly.
  const bracketItems = itemsToRender.filter(i => isSubtotalHeader(i.description));
  const sectionTotal = bracketItems.length > 0
    ? bracketItems.reduce((s, i) => s + (subtotalMap[i.id] || 0), 0)
    : itemsToRender
        .filter(i => !isSubtotalHeader(i.description) && !isSpacer(i.description))
        .reduce((s, i) => s + (i.total || 0), 0);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(itemsToRender);
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
              <button onClick={() => { onRename(section.id, titleVal); setEditingTitle(false); }}><X className="h-3.5 w-3.5 text-primary" /></button>
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
              {(isHourSection(section.title) || itemsToRender.some(i => isHourItem(i.description)))
                ? Math.round(sectionTotal).toLocaleString()
                : `$${sectionTotal.toFixed(2)}`}
            </span>
          )}
          <button onClick={() => onSplit(section.id)} className="text-muted-foreground hover:text-primary transition-colors" title="Split section into two">
            <Columns className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onRemove(section.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {itemsToRender.length > 0 && !isProjectTotalsSection && (
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
                  {itemsToRender.map((item, idx) => (
                    <Draggable key={String(item.id)} draggableId={String(item.id)} index={idx}>
                      {(drag, snapshot) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          className={snapshot.isDragging ? 'bg-secondary/60' : ''}
                          style={drag.draggableProps.style}
                        >
                          <ItemRow
                            item={item}
                            sectionId={section.id}
                            onUpdateItem={onUpdateItem}
                            onRemoveItem={onRemoveItem}
                            inventory={inventory}
                            isProjectTotalsSection={isProjectTotalsSection}
                            subtotalMap={subtotalMap}
                            dragHandleProps={drag.dragHandleProps}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {itemsToRender.length === 0 && (
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