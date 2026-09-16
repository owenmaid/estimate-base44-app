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
  assert.match(source, /allCanadaHolidaysForYear/);
  assert.match(source, /DATE_PATTERN/);
  assert.match(source, /normalizeProvince/);
  assert.match(source, /National Day for Truth and Reconciliation/);
});

test('statutory holiday source supports all Canadian jurisdictions', async () => {
  const source = await readSource('base44/functions/getCanadaStatHolidays/entry.ts');

  assert.match(source, /const PROVINCES = \['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'\]/);
  assert.doesNotMatch(source, /Only Alberta statutory holidays are currently supported/);
  assert.match(source, /province must be a valid Canadian province or territory code/);
});

test('equipment data sync does not return placeholder zero totals', async () => {
  const source = await readSource('src/lib/projectDataSync.js');

  assert.match(source, /calculateScheduleRow/);
  assert.doesNotMatch(source, /For now, return placeholder structure/);
});
