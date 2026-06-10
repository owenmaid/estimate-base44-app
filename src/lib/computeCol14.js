/**
 * Compute Col14 (total cost) for a single equipment/manpower row.
 * Mirrors the logic in PalettePanel and CalculationEngine.
 */
export function computeCol14(row, equipmentGrid, typeGrid, inventoryItems) {
  const inventoryEntry = inventoryItems.find(i => String(i.id) === String(row.item_id))
    || inventoryItems.find(i => (i.name || '').toLowerCase() === (row.label || '').toLowerCase())
    || null;

  if (!inventoryEntry) return null;

  const isManpower = inventoryEntry.item_group === 'Manpower Group';
  const label = (row.label || '').toLowerCase();
  const isSpecial = label.includes('pre-work') || label.includes('post-work');
  const shiftHrs = isSpecial ? 10 : 12;

  const rawReg = inventoryEntry.reg_value;
  const rawOt = inventoryEntry.ot_value;
  const regRate = (rawReg === '' || rawReg === undefined || rawReg === null) ? null : Number(rawReg);
  const otRate = (rawOt === '' || rawOt === undefined || rawOt === null) ? null : Number(rawOt);

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

  const col4 = isManpower ? (nDays * 8) + (saDays * 4) : 0;
  const col5 = isManpower ? nDays * Math.max(0, shiftHrs - 8) : 0;
  const col6 = isManpower ? saDays * Math.max(shiftHrs - 4, 0) : 0;
  const col7 = isManpower ? suDays * shiftHrs : 0;
  const col8 = isManpower ? stDays * shiftHrs : 0;

  const col11 = regRate != null ? ((isManpower ? col4 : col1) * regRate) : 0;
  const col12 = otRate != null ? ((col5 + col6 + col7) * otRate) : 0;
  const col13 = (isManpower && otRate != null)
    ? (col8 * 2 * (4 / (shiftHrs * 2)) * otRate) + (col8 * 2 * ((shiftHrs * 2 - 4) / (shiftHrs * 2)) * otRate)
    : 0;

  return col11 + col12 + col13;
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