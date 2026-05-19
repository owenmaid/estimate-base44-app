import React, { useState, useEffect, useMemo } from 'react';
import { Package, Wrench, Users, ChevronDown, ChevronRight, Plus, Search, Layers, Minus } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const GROUP_ICONS = {
  'Service Group': Wrench,
  'Equipment Group': Package,
  'Manpower Group': Users,
};

// Compute col14 for a given row using the same logic as CalculationEngine
function computeCol14(row, equipmentGrid, typeGrid, inventoryItems) {
  const inventoryEntry = inventoryItems.find(i => String(i.id) === String(row.item_id))
    || inventoryItems.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
    || null;

  if (!inventoryEntry) return null;

  const isManpower = inventoryEntry.item_group === 'Manpower Group';
  const label = (row.label || '').toLowerCase();
  const isSpecial = label.includes('pre-work') || label.includes('post-work');
  const shiftHrs = isSpecial ? 10 : 12;

  const regRate = inventoryEntry.reg_value ?? null;
  const otRate = inventoryEntry.ot_value ?? null;

  // Col1: sum of all scheduled days for this row
  let col1 = 0;
  let nDays = 0, saDays = 0, suDays = 0, stDays = 0;

  Object.entries(equipmentGrid).forEach(([key, value]) => {
    if (!key.startsWith(`${row.id}_`)) return;
    const dateStr = key.slice(`${row.id}_`.length);
    const num = parseInt(value, 10);
    if (isNaN(num) || num <= 0) return;
    col1 += num;
    const dayType = typeGrid[dateStr];
    if (dayType === 'N') nDays += num;
    else if (dayType === 'Sa') saDays += num;
    else if (dayType === 'Su') suDays += num;
    else if (dayType === 'St') stDays += num;
  });

  // Col4–Col8: Manpower only (non-Manpower rows are zeroed)
  const col4 = isManpower ? (nDays * 8) + (saDays * 4) : 0;
  const col5 = isManpower ? nDays * Math.max(0, shiftHrs - 8) : 0;
  const col6 = isManpower ? saDays * Math.max(shiftHrs - 4, 0) : 0;
  const col7 = isManpower ? suDays * shiftHrs : 0;
  const col8 = isManpower ? stDays * shiftHrs : 0;

  // Col11: Manpower = col4 × regRate, non-Manpower = col1 × regRate
  const col11 = regRate != null ? ((isManpower ? col4 : col1) * regRate) : 0;
  // Col12: (col5 + col6 + col7) × otRate (Manpower only)
  const col12 = otRate != null ? ((col5 + col6 + col7) * otRate) : 0;
  // Col13: St special cost (Manpower only)
  const col13 = (isManpower && otRate != null)
    ? (col8 * 2 * (4 / (shiftHrs * 2)) * otRate) + (col8 * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
    : 0;

  return col11 + col12 + col13;
}

export default function PalettePanel({ inventory, sections, onAddSection, onAddItemToSection, projectNumber }) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [selectedSection, setSelectedSection] = useState(null);
  const [manualItem, setManualItem] = useState({ description: '', quantity: 1, unit_price: 0, markup: 0 });
  const [showManual, setShowManual] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [activeProject, setActiveProject] = useState(null);

  // Load the active project once when projectNumber changes
  useEffect(() => {
    if (!projectNumber) { setActiveProject(null); return; }
    base44.entities.Project.list().then(all => {
      const match = all.find(p =>
        (p.project_number || '').trim().toLowerCase() === projectNumber.trim().toLowerCase()
      );
      setActiveProject(match || null);
    }).catch(() => setActiveProject(null));
  }, [projectNumber]);

  // Build a col14 lookup map keyed by inventory item id
  const col14Map = useMemo(() => {
    if (!activeProject) return {};
    const map = {};
    const rows = activeProject.equipment_rows || [];
    const eGrid = activeProject.equipment_grid || {};
    const tGrid = activeProject.type_grid || {};

    rows.forEach(row => {
      if (!row.item_id) return;
      const val = computeCol14(row, eGrid, tGrid, inventory);
      if (val != null && val > 0) {
        map[String(row.item_id)] = val;
      }
    });
    return map;
  }, [activeProject, inventory]);

  // Group inventory by item_group → category
  const grouped = {};
  inventory
    .filter(i => !search || (i.name || '').toLowerCase().includes(search.toLowerCase()) || (i.sku || '').toLowerCase().includes(search.toLowerCase()) || (i.category || '').toLowerCase().includes(search.toLowerCase()))
    .forEach(item => {
      const group = item.item_group || 'Other';
      const cat = item.category || 'Uncategorized';
      if (!grouped[group]) grouped[group] = {};
      if (!grouped[group][cat]) grouped[group][cat] = [];
      grouped[group][cat].push(item);
    });

  const toggleGroup = (key) => setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const handleAddInventoryItem = (invItem) => {
    if (!sections || sections.length === 0) return;
    const targetSectionId = selectedSection || sections[0].id;
    if (!targetSectionId) return;

    // Use col14 from project if available, otherwise fall back to unit_cost
    const col14 = col14Map[String(invItem.id)];
    const unit_price = (col14 != null && col14 > 0) ? col14 : (invItem.unit_cost || 0);

    onAddItemToSection(targetSectionId, {
      description: invItem.name || invItem.sku,
      quantity: 1,
      unit_price,
      markup: 0,
    });
  };

  const handleAddSpacer = () => {
    if (!sections || sections.length === 0) return;
    const targetSectionId = selectedSection || sections[0].id;
    if (!targetSectionId) return;
    onAddItemToSection(targetSectionId, {
      description: '__SPACER__',
      quantity: 0,
      unit_price: 0,
      markup: 0,
    });
  };

  const handleAddManual = () => {
    if (!sections || sections.length === 0) return;
    const targetSectionId = selectedSection || sections[0].id;
    if (!targetSectionId || !manualItem.description) return;
    onAddItemToSection(targetSectionId, { ...manualItem });
    setManualItem({ description: '', quantity: 1, unit_price: 0, markup: 0 });
    setShowManual(false);
  };

  return (
    <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tool Palette</p>
        {projectNumber && (
          <p className="text-xs text-primary mb-2">🔗 Project: <span className="font-semibold">{projectNumber}</span></p>
        )}

        {/* Section selector */}
        <div className="mb-2">
          <label className="text-xs text-muted-foreground">Add to section:</label>
          <select
            value={selectedSection || ''}
            onChange={e => setSelectedSection(Number(e.target.value) || e.target.value)}
            className="w-full mt-1 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground outline-none"
          >
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        {/* Add Section */}
        <button
          onClick={onAddSection}
          className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border border-dashed border-primary/50 text-primary hover:bg-primary/10 transition-colors mb-1"
        >
          <Layers className="h-3.5 w-3.5" /> Add New Section
        </button>

        {/* Add Spacer */}
        <button
          onClick={handleAddSpacer}
          className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border border-dashed border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors mb-2"
        >
          <Minus className="h-3.5 w-3.5" /> Add Spacer Line
        </button>

        {/* Search inventory */}
        <div className="flex items-center gap-1 border border-border rounded bg-secondary px-2 py-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            className="bg-transparent text-xs text-foreground outline-none w-full placeholder:text-muted-foreground"
            placeholder="Search inventory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Inventory tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {Object.entries(grouped).map(([group, categories]) => {
          const GroupIcon = GROUP_ICONS[group] || Package;
          const groupOpen = expandedGroups[group] !== false;
          return (
            <div key={group}>
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                {groupOpen ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <GroupIcon className="h-3.5 w-3.5 text-primary" />
                {group}
              </button>
              {groupOpen && Object.entries(categories).map(([cat, items]) => {
                const catKey = `${group}__${cat}`;
                const catOpen = expandedGroups[catKey] !== false;
                return (
                  <div key={cat} className="ml-3">
                    <button
                      onClick={() => toggleGroup(catKey)}
                      className="w-full flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {catOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {cat}
                    </button>
                    {catOpen && items.map(item => {
                      const col14 = col14Map[String(item.id)];
                      const displayPrice = (col14 != null && col14 > 0) ? col14 : (item.unit_cost || 0);
                      const hasProjectPrice = col14 != null && col14 > 0;
                      return (
                        <div
                          key={item.id}
                          className="ml-3 flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-secondary group transition-colors cursor-default"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-foreground font-medium">{item.name || item.sku}</div>
                            <div className={hasProjectPrice ? 'text-primary font-semibold' : 'text-muted-foreground'}>
                              ${displayPrice.toFixed(2)}
                              {hasProjectPrice && <span className="ml-1 text-muted-foreground font-normal">(Col14)</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddInventoryItem(item)}
                            className="shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                            title="Add to estimate"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No inventory items found</p>
        )}
      </div>

      {/* Manual line item */}
      <div className="border-t border-border p-3">
        <button
          onClick={() => setShowManual(v => !v)}
          className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add custom line item
        </button>
        {showManual && (
          <div className="space-y-1.5">
            <input
              className="w-full text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Description"
              value={manualItem.description}
              onChange={e => setManualItem(p => ({ ...p, description: e.target.value }))}
            />
            <div className="flex gap-1">
              <input type="number" min="0" className="w-1/3 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground outline-none" placeholder="Qty" value={manualItem.quantity} onChange={e => setManualItem(p => ({ ...p, quantity: parseFloat(e.target.value) || 1 }))} />
              <input type="number" min="0" className="w-1/3 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground outline-none" placeholder="$/unit" value={manualItem.unit_price} onChange={e => setManualItem(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} />
              <input type="number" min="0" className="w-1/3 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground outline-none" placeholder="Markup %" value={manualItem.markup} onChange={e => setManualItem(p => ({ ...p, markup: parseFloat(e.target.value) || 0 }))} />
            </div>
            <button onClick={handleAddManual} className="w-full text-xs bg-primary text-primary-foreground rounded py-1.5 hover:bg-primary/90 transition-colors font-medium">
              Add Line Item
            </button>
          </div>
        )}
      </div>
    </div>
  );
}