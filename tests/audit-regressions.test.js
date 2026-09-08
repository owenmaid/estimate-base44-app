import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('application routes and Base44 client require authentication', async () => {
  const [app, client] = await Promise.all([
    readSource('src/App.jsx'),
    readSource('src/api/base44Client.js'),
  ]);

  assert.match(app, /<ProtectedRoute\b/);
  assert.match(client, /requiresAuth:\s*true/);
  assert.doesNotMatch(client, /requiresAuth:\s*false/);
});

test('statutory holidays are deterministic and do not invoke an LLM', async () => {
  const source = await readSource('base44/functions/getCanadaStatHolidays/entry.ts');

  assert.doesNotMatch(source, /InvokeLLM|add_context_from_internet/);
  assert.match(source, /albertaHolidaysForYear/);
  assert.match(source, /DATE_PATTERN/);
});

test('equipment data sync does not return placeholder zero totals', async () => {
  const source = await readSource('src/lib/projectDataSync.js');

  assert.match(source, /calculateScheduleRow/);
  assert.doesNotMatch(source, /For now, return placeholder structure/);
});


test('financial schemas enforce safe ranges and stable estimate metadata', async () => {
  const [estimateSource, projectSource, inventorySource] = await Promise.all([
    readSource('base44/entities/Estimate.jsonc'),
    readSource('base44/entities/Project.jsonc'),
    readSource('base44/entities/InventoryItem.jsonc'),
  ]);
  const estimate = JSON.parse(estimateSource);
  const project = JSON.parse(projectSource);
  const inventory = JSON.parse(inventorySource);

  assert.equal(estimate.properties.tax_rate.maximum, 100);
  assert.equal(estimate.properties.discount.minimum, 0);
  assert.equal(estimate.properties.line_items.items.properties.id.type, 'string');
  assert.equal(estimate.properties.line_items.items.properties.calculation_code.type, 'string');
  assert.equal(project.properties.progress.maximum, 100);
  assert.equal(project.properties.task_list.items.properties.tax_pct.maximum, 100);
  assert.equal(inventory.properties.unit_cost.minimum, 0);
});

test('estimate panel persists IDs and stable calculation codes', async () => {
  const source = await readSource('src/pages/CreateEstimatePanel.jsx');
  assert.match(source, /calculation_code:/);
  assert.match(source, /item\.id \|\| createStableId\('item'\)/);
  assert.match(source, /itemCode\(item\) === C\.DCSM_TOTAL/);
});
