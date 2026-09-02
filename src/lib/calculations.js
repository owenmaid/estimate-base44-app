const MONEY_SCALE = 100;

export function toFiniteNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundMoney(value) {
  return Math.round((toFiniteNumber(value) + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

export function calculateLineTotal(quantity, unitPrice) {
  return roundMoney(toFiniteNumber(quantity) * toFiniteNumber(unitPrice));
}

export function calculateEstimateSummary(subtotal, taxRate = 0, discount = 0) {
  const roundedSubtotal = roundMoney(subtotal);
  const safeTaxRate = Math.max(0, toFiniteNumber(taxRate));
  const safeDiscount = Math.max(0, toFiniteNumber(discount));
  const taxAmount = roundMoney(roundedSubtotal * safeTaxRate / 100);
  return {
    subtotal: roundedSubtotal,
    taxAmount,
    discount: roundMoney(safeDiscount),
    total: roundMoney(Math.max(0, roundedSubtotal + taxAmount - safeDiscount)),
  };
}

export function calculateEstimateFromLineItems(lineItems = [], taxRate = 0, discount = 0) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + calculateLineTotal(item?.quantity, item?.unit_price),
    0,
  );
  return calculateEstimateSummary(subtotal, taxRate, discount);
}

export function getShiftHours(label = '') {
  const normalized = String(label).toLowerCase();
  return normalized.includes('pre-work') || normalized.includes('post-work') ? 10 : 12;
}

export function calculateScheduleHours(row, equipmentGrid = {}, typeGrid = {}, isManpower = false) {
  const rowPrefix = `${row.id}_`;
  const shiftHours = getShiftHours(row.label);
  let col1 = 0;
  let normalUnits = 0;
  let saturdayUnits = 0;
  let sundayUnits = 0;
  let statutoryUnits = 0;

  Object.entries(equipmentGrid).forEach(([key, value]) => {
    if (!key.startsWith(rowPrefix)) return;
    const units = Number.parseInt(value, 10);
    if (!Number.isFinite(units) || units <= 0) return;

    col1 += units;
    const dayType = typeGrid[key.slice(rowPrefix.length)];
    if (dayType === 'N') normalUnits += units;
    else if (dayType === 'Sa') saturdayUnits += units;
    else if (dayType === 'Su') sundayUnits += units;
    else if (dayType === 'St') statutoryUnits += units;
  });

  const col2 = isManpower ? col1 * shiftHours : 0;
  const col4 = isManpower ? (normalUnits * 8) + (saturdayUnits * 4) : 0;
  const col5 = isManpower ? normalUnits * Math.max(0, shiftHours - 8) : 0;
  const col6 = isManpower ? saturdayUnits * Math.max(0, shiftHours - 4) : 0;
  const col7 = isManpower ? sundayUnits * shiftHours : 0;
  const col8 = isManpower ? statutoryUnits * shiftHours : 0;
  const col3 = col4 + col5 + col6 + col7 + col8;

  return { shiftHours, col1, col2, col3, col4, col5, col6, col7, col8 };
}

export function calculateCostComponents({
  isManpower,
  shiftHours,
  col1 = 0,
  col4 = 0,
  col5 = 0,
  col6 = 0,
  col7 = 0,
  col8 = 0,
  regRate,
  otRate,
}) {
  const hasRegRate = regRate !== '' && regRate !== null && regRate !== undefined && Number.isFinite(Number(regRate));
  const hasOtRate = otRate !== '' && otRate !== null && otRate !== undefined && Number.isFinite(Number(otRate));
  const regularCost = hasRegRate
    ? roundMoney((isManpower ? col4 : col1) * Number(regRate))
    : 0;
  const overtimeCost = isManpower && hasOtRate
    ? roundMoney((col5 + col6 + col7) * Number(otRate))
    : 0;
  const specialCost = isManpower && hasOtRate
    ? roundMoney(
        (col8 * 2 * (4 / (shiftHours * 2)) * Number(otRate))
        + (col8 * 2 * ((shiftHours * 2 - 4) / (shiftHours * 2)) * Number(otRate)),
      )
    : 0;

  return {
    regularCost,
    overtimeCost,
    specialCost,
    totalCost: roundMoney(regularCost + overtimeCost + specialCost),
  };
}

export function findInventoryItem(row, inventoryItems = []) {
  return inventoryItems.find(item => String(item.id) === String(row.item_id))
    || inventoryItems.find(item => String(item.name || '').toLowerCase() === String(row.label || '').toLowerCase())
    || null;
}

export function calculateScheduleRow(row, equipmentGrid, typeGrid, inventoryItems) {
  const inventoryItem = findInventoryItem(row, inventoryItems);
  if (!inventoryItem) return null;

  const isManpower = inventoryItem.item_group === 'Manpower Group';
  const hours = calculateScheduleHours(row, equipmentGrid, typeGrid, isManpower);
  const costs = calculateCostComponents({
    isManpower,
    shiftHours: hours.shiftHours,
    col1: hours.col1,
    col4: hours.col4,
    col5: hours.col5,
    col6: hours.col6,
    col7: hours.col7,
    col8: hours.col8,
    regRate: inventoryItem.reg_value,
    otRate: inventoryItem.ot_value,
  });

  return { inventoryItem, isManpower, ...hours, ...costs };
}
