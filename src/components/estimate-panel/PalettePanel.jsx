import React, { useState } from 'react';
import { Package, Wrench, Users, ChevronDown, ChevronRight, Plus, Search, Layers } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const GROUP_ICONS = {
  'Service Group': Wrench,
  'Equipment Group': Package,
  'Manpower Group': Users,
};

export default function PalettePanel({ inventory, sections, onAddSection, onAddItemToSection, projectNumber }) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [selectedSection, setSelectedSection] = useState(null);
  const [manualItem, setManualItem] = useState({ description: '', quantity: 1, unit_price: 0, markup: 0 });
  const [showManual, setShowManual] = useState(false);
  const [syncing, setSyncing] = useState(null);

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

  const handleAddInventoryItem = async (invItem) => {
    const targetSectionId = selectedSection || (sections[0]?.id);
    if (!targetSectionId) return;

    let unit_price = invItem.unit_cost || 0;

    // If project number exists, try to fetch synced total from ProjectDetailsSetup
    if (projectNumber && invItem.name) {
      setSyncing(invItem.id);
      try {
        const projects = await base44.entities.Project.list();
        const matchingProject = projects.find(p => p.project_number === projectNumber);
        
        if (matchingProject) {
          const equipmentRows = matchingProject.equipment_rows || [];
          const equipmentGrid = matchingProject.equipment_grid || {};
          const matchingRow = equipmentRows.find(r => r.label === invItem.name);
          
          if (matchingRow) {
            // Calculate total from equipment grid for this row
            let rowTotal = 0;
            Object.entries(equipmentGrid).forEach(([key, value]) => {
              if (key.startsWith(`${matchingRow.id}_`)) {
                rowTotal += parseInt(value, 10) || 0;
              }
            });
            
            // Use calculated total as the unit price
            if (rowTotal > 0) {
              unit_price = rowTotal;
            }
          }
        }
      } catch (error) {
        console.error('Error syncing project data:', error);
      }
      setSyncing(null);
    }

    onAddItemToSection(targetSectionId, {
      description: invItem.name || invItem.sku,
      quantity: 1,
      unit_price,
      markup: 0,
    });
  };

  const handleAddManual = () => {
    const targetSectionId = selectedSection || (sections[0]?.id);
    if (!targetSectionId || !manualItem.description) return;
    onAddItemToSection(targetSectionId, { ...manualItem });
    setManualItem({ description: '', quantity: 1, unit_price: 0, markup: 0 });
    setShowManual(false);
  };

  return (
    <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tool Palette</p>

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
          className="w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border border-dashed border-primary/50 text-primary hover:bg-primary/10 transition-colors mb-2"
        >
          <Layers className="h-3.5 w-3.5" /> Add New Section
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
          const groupOpen = expandedGroups[group] !== false; // default open
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
                    {catOpen && items.map(item => (
                      <div
                        key={item.id}
                        className="ml-3 flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-secondary group transition-colors cursor-default"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-foreground font-medium">{item.name || item.sku}</div>
                          <div className="text-muted-foreground">${(item.unit_cost || 0).toFixed(2)}</div>
                        </div>
                        <button
                          onClick={() => handleAddInventoryItem(item)}
                          className="shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                          title="Add to estimate"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
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