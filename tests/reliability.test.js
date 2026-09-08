import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEstimateNumber,
  createNumericId,
  createStableId,
  getErrorMessage,
  validateEstimateData,
} from '../src/lib/reliability.js';
import { CALCULATION_CODES, calculationCodeFor, inferCalculationCode } from '../src/lib/calculationCodes.js';

test('creates unique prefixed stable IDs', () => {
  const ids = new Set(Array.from({ length: 100 }, () => createStableId('item')));
  assert.equal(ids.size, 100);
  assert.ok([...ids].every(id => id.startsWith('item_')));
});

test('creates safe unique numeric IDs for schema-compatible task records', () => {
  const ids = Array.from({ length: 100 }, () => createNumericId());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Number.isSafeInteger));
});

test('creates readable estimate numbers with a collision-resistant suffix', () => {
  assert.match(createEstimateNumber(new Date('2026-09-02T12:00:00Z')), /^EST-20260902-[A-Z0-9]{7}$/);
});

test('validates required estimate fields, dates and money inputs', () => {
  const valid = {
    client_name: 'Client',
    project_name: 'Project',
    tax_rate: 5,
    discount: 0,
    start_date: '2026-09-01',
    end_date: '2026-09-02',
  };
  const sections = [{ items: [{ description: 'Labour', quantity: 1, unit_price: 10 }] }];

  assert.equal(validateEstimateData(valid, sections), null);
  assert.match(validateEstimateData({ ...valid, client_name: ' ' }, sections), /client name/i);
  assert.match(validateEstimateData({ ...valid, end_date: '2026-08-31' }, sections), /end date/i);
  assert.match(validateEstimateData({ ...valid, discount: -1 }, sections), /discount/i);
  assert.match(validateEstimateData(valid, [{ items: [{ description: '', quantity: 1, unit_price: 10 }] }]), /line item/i);
  assert.match(validateEstimateData(valid, [{ items: [{ description: 'Labour', quantity: 1, unit_price: 10, markup: 1001 }] }]), /markup/i);
});

test('extracts useful API errors and preserves a fallback', () => {
  assert.equal(getErrorMessage({ response: { data: { message: 'Denied' } } }), 'Denied');
  assert.equal(getErrorMessage(null, 'Save failed'), 'Save failed');
});


test('infers stable calculation codes for legacy estimate labels', () => {
  assert.equal(inferCalculationCode('DCSM Est Total'), CALCULATION_CODES.DCSM_TOTAL);
  assert.equal(inferCalculationCode('[Lead Ventilation Tech]'), CALCULATION_CODES.LEAD_VENT_BRACKET);
  assert.equal(
    inferCalculationCode('Ventilation Total Labour | Logistics Cost', { section: true }),
    CALCULATION_CODES.VENT_LABOUR_LOGISTICS,
  );
});

test('stored calculation codes survive display-label changes', () => {
  const renamed = {
    description: 'Customer-facing renamed total',
    calculation_code: CALCULATION_CODES.PROJECT_COST_TOTAL,
  };
  assert.equal(calculationCodeFor(renamed), CALCULATION_CODES.PROJECT_COST_TOTAL);
});
