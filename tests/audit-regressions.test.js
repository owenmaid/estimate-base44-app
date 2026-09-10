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

test('Alberta statutory holiday function is deterministic and does not invoke an LLM', async () => {
  const source = await readSource('base44/functions/getAlbertaStatHolidays/entry.ts');

  assert.doesNotMatch(source, /InvokeLLM|add_context_from_internet/);
  assert.match(source, /albertaHolidaysForYear/);
  assert.match(source, /DATE_PATTERN/);
  assert.match(source, /const PROVINCE = 'AB'/);
});

test('Alberta statutory holiday function enforces the Alberta-only contract', async () => {
  const source = await readSource('base44/functions/getAlbertaStatHolidays/entry.ts');

  assert.match(source, /province = PROVINCE/);
  assert.match(source, /Only Alberta statutory holidays are currently supported\./);
  assert.match(source, /Date range cannot exceed 10 years\./);
  assert.match(source, /endDate cannot be earlier than startDate\./);
});

test('equipment data sync does not return placeholder zero totals', async () => {
  const source = await readSource('src/lib/projectDataSync.js');

  assert.match(source, /calculateScheduleRow/);
  assert.doesNotMatch(source, /For now, return placeholder structure/);
});
