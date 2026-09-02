import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateCostComponents,
  calculateEstimateFromLineItems,
  calculateEstimateSummary,
  calculateLineTotal,
  calculateScheduleRow,
  getShiftHours,
  roundMoney,
} from '../src/lib/calculations.js';

const manpower = {
  id: 'mp-1',
  name: 'Ventilation Technician',
  item_group: 'Manpower Group',
  reg_value: 50,
  ot_value: 75,
};

const row = { id: 'row-1', item_id: manpower.id, label: manpower.name };
const dates = {
  normal: '2026-09-01',
  saturday: '2026-09-05',
  sunday: '2026-09-06',
  statutory: '2026-09-07',
};

test('uses 12-hour shifts by default and 10 hours for pre/post-work rows', () => {
  assert.equal(getShiftHours('Ventilation Technician'), 12);
  assert.equal(getShiftHours('Pre-Work Crew'), 10);
  assert.equal(getShiftHours('POST-WORK Crew'), 10);
});

test('calculates normal manpower regular and overtime costs', () => {
  const result = calculateScheduleRow(
    row,
    { [`${row.id}_${dates.normal}`]: 1 },
    { [dates.normal]: 'N' },
    [manpower],
  );

  assert.deepEqual(
    {
      col1: result.col1,
      col2: result.col2,
      col3: result.col3,
      col4: result.col4,
      col5: result.col5,
      regularCost: result.regularCost,
      overtimeCost: result.overtimeCost,
      specialCost: result.specialCost,
      totalCost: result.totalCost,
    },
    {
      col1: 1,
      col2: 12,
      col3: 12,
      col4: 8,
      col5: 4,
      regularCost: 400,
      overtimeCost: 300,
      specialCost: 0,
      totalCost: 700,
    },
  );
});

test('applies Saturday, Sunday and statutory rules consistently', () => {
  const equipmentGrid = {
    [`${row.id}_${dates.normal}`]: 1,
    [`${row.id}_${dates.saturday}`]: 1,
    [`${row.id}_${dates.sunday}`]: 1,
    [`${row.id}_${dates.statutory}`]: 1,
  };
  const typeGrid = {
    [dates.normal]: 'N',
    [dates.saturday]: 'Sa',
    [dates.sunday]: 'Su',
    [dates.statutory]: 'St',
  };
  const result = calculateScheduleRow(row, equipmentGrid, typeGrid, [manpower]);

  assert.equal(result.col1, 4);
  assert.equal(result.col2, 48);
  assert.equal(result.col3, 48);
  assert.equal(result.col4, 12);
  assert.equal(result.col5, 4);
  assert.equal(result.col6, 8);
  assert.equal(result.col7, 12);
  assert.equal(result.col8, 12);
  assert.equal(result.regularCost, 600);
  assert.equal(result.overtimeCost, 1800);
  assert.equal(result.specialCost, 1800);
  assert.equal(result.totalCost, 4200);
});

test('uses the 10-hour pre-work shift rule', () => {
  const preWork = { ...manpower, id: 'mp-2', name: 'Pre-Work Crew' };
  const preWorkRow = { id: 'row-2', item_id: preWork.id, label: preWork.name };
  const result = calculateScheduleRow(
    preWorkRow,
    { [`${preWorkRow.id}_${dates.normal}`]: 1 },
    { [dates.normal]: 'N' },
    [preWork],
  );

  assert.equal(result.col2, 10);
  assert.equal(result.col4, 8);
  assert.equal(result.col5, 2);
  assert.equal(result.totalCost, 550);
});

test('charges non-manpower equipment by scheduled quantity only', () => {
  const equipment = {
    id: 'eq-1',
    name: 'Air Mover',
    item_group: 'Equipment Group',
    reg_value: 100,
    ot_value: 999,
  };
  const equipmentRow = { id: 'row-eq', item_id: equipment.id, label: equipment.name };
  const result = calculateScheduleRow(
    equipmentRow,
    {
      [`${equipmentRow.id}_${dates.normal}`]: 2,
      [`${equipmentRow.id}_${dates.sunday}`]: 1,
    },
    {
      [dates.normal]: 'N',
      [dates.sunday]: 'Su',
    },
    [equipment],
  );

  assert.equal(result.col1, 3);
  assert.equal(result.col2, 0);
  assert.equal(result.regularCost, 300);
  assert.equal(result.overtimeCost, 0);
  assert.equal(result.specialCost, 0);
  assert.equal(result.totalCost, 300);
});

test('missing rates safely produce zero cost instead of NaN', () => {
  assert.deepEqual(
    calculateCostComponents({
      isManpower: true,
      shiftHours: 12,
      col1: 1,
      col4: 8,
      col5: 4,
      col6: 0,
      col7: 0,
      col8: 0,
      regRate: null,
      otRate: undefined,
    }),
    { regularCost: 0, overtimeCost: 0, specialCost: 0, totalCost: 0 },
  );
});

test('rounds line items, tax and final totals to cents', () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(calculateLineTotal(3, 19.995), 59.99);
  assert.deepEqual(
    calculateEstimateFromLineItems(
      [{ quantity: 3, unit_price: 19.995 }],
      5,
      0,
    ),
    { subtotal: 59.99, taxAmount: 3, discount: 0, total: 62.99 },
  );
});

test('never returns a negative estimate total after discount', () => {
  assert.deepEqual(
    calculateEstimateSummary(100, 5, 200),
    { subtotal: 100, taxAmount: 5, discount: 200, total: 0 },
  );
});

test('ignores invalid or negative scheduled quantities', () => {
  const result = calculateScheduleRow(
    row,
    {
      [`${row.id}_a`]: -3,
      [`${row.id}_b`]: 'invalid',
      [`${row.id}_c`]: 2,
    },
    { a: 'N', b: 'Sa', c: 'N' },
    [manpower],
  );
  assert.equal(result.col1, 2);
  assert.equal(result.totalCost, 1400);
});
