import { calculateScheduleRow } from './calculations.js';

/**
 * Compute Col14 (total cost) through the shared calculation engine.
 */
export function computeCol14(row, equipmentGrid, typeGrid, inventoryItems) {
  return calculateScheduleRow(row, equipmentGrid, typeGrid, inventoryItems)?.totalCost ?? null;
}

/**
 * Build a col14 lookup map: { [inventoryItemName.toLowerCase()]: col14Value }
 * Also keyed by inventory item id for direct matches.
 */
export function buildCol14Map(project, inventoryItems) {
  if (!project) return {};
  const map = {};
  const rows = project.equipment_rows || [];
  const eGrid = project.equipment_grid || {};
  const tGrid = project.type_grid || {};

  rows.forEach(row => {
    const val = computeCol14(row, eGrid, tGrid, inventoryItems);
    if (val == null || val <= 0) return;

    // Key by inventory item id — accumulate in case multiple rows share the same item_id
    if (row.item_id) {
      const k = `id:${String(row.item_id)}`;
      map[k] = (map[k] || 0) + val;
    }
    // Key by row label (lowercased) — accumulate so duplicate labels are summed, not overwritten
    if (row.label) {
      const k = `name:${row.label.toLowerCase()}`;
      map[k] = (map[k] || 0) + val;
    }
  });
  return map;
}

/**
 * Look up col14 for a line item description against the map.
 * Returns the col14 value or null if not found.
 */
export function lookupCol14(description, col14Map, inventoryItems) {
  if (!description || !col14Map) return null;
  const desc = description.toLowerCase().trim();

  // Try direct name match
  const byName = col14Map[`name:${desc}`];
  if (byName != null) return byName;

  // Try matching via inventory item id
  const invItem = inventoryItems.find(i => (i.name || '').toLowerCase() === desc);
  if (invItem) {
    const byId = col14Map[`id:${String(invItem.id)}`];
    if (byId != null) return byId;
  }

  return null;
}