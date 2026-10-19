'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), context = vm.createContext({ console });
for (const file of ['map-templates.js', 'map-regions.js', 'engine.js', 'editor.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
}
const plain = value => JSON.parse(JSON.stringify(value));
require('./preloaded-map-fixture.cjs')(context);
const realm = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
const oldTemplate = context.MapTemplates.get('regional_eastasia_1592');
const nextTemplate = context.MapTemplates.get('regional_asia_1754');
const oldCountry = oldTemplate.countries.find(country => country.id === 'joseon');
const nextCountry = nextTemplate.countries.find(country => country.id === 'joseon');
function scenario(override) {
  const draft = context.GameEngine.createBlankScenario();
  draft.schemaVersion = 2; draft.mode = 'chronicle';
  draft.map = realm({ templateId: oldTemplate.id, playerCountry: 'joseon', countries: [override], initial: {} });
  return draft;
}
let cases = 0;
function test(title, run) { run(); cases++; console.log('PASS ' + title); }

test('renamed country uses new crop bounds instead of persisted template bounds', () => {
  // Existing files may contain fields copied by an older editor rename.
  const draft = scenario({ ...plain(oldCountry), name: '사용자 조선', color: '#123456' });
  const result = context.ScenarioEditorV2.planMapChange(draft, nextTemplate.id);
  const override = result.nextMap.countries.find(country => country.id === 'joseon');
  assert.equal(override.name, '사용자 조선'); assert.equal(override.color, '#123456');
  assert.equal(Object.hasOwn(override, 'focusBounds'), false);
  assert.equal(Object.hasOwn(override, 'available'), false);
  draft.map = result.nextMap;
  const merged = context.ScenarioEditorV2.mapConfig(draft).countries.find(country => country.id === 'joseon');
  assert.deepEqual(plain(merged.focusBounds), plain(nextCountry.focusBounds));
  assert.notDeepEqual(plain(merged.focusBounds), plain(oldCountry.focusBounds));
});

test('explicit custom country bounds translate between regional map origins', () => {
  const bounds = oldCountry.focusBounds.map((value, index) => value + (index < 2 ? 1 : -1));
  const draft = scenario({ id: 'joseon', name: '조선', color: '#123456', focusBounds: bounds, available: false });
  const result = context.ScenarioEditorV2.planMapChange(draft, nextTemplate.id);
  const override = result.nextMap.countries[0];
  const dx = oldTemplate.offsetX - nextTemplate.offsetX, dy = oldTemplate.offsetY - nextTemplate.offsetY;
  assert.deepEqual(plain(override.focusBounds), [bounds[0] + dx, bounds[1] + dy, bounds[2] + dx, bounds[3] + dy]);
  assert.equal(Object.hasOwn(override, 'available'), false);
  assert.deepEqual(plain(draft.map.countries[0].focusBounds), plain(bounds));
});

test('legacy projection changes discard incompatible custom focus bounds', () => {
  const draft = scenario({ id: 'joseon', name: '사용자 조선', color: '#123456', focusBounds: [1, 2, 10, 20] });
  const result = context.ScenarioEditorV2.planMapChange(draft, 'world1754');
  const override = result.nextMap.countries[0];
  assert.equal(Object.hasOwn(override, 'focusBounds'), false);
  assert.equal(override.name, '사용자 조선'); assert.equal(override.color, '#123456');
});

test('custom bounds outside new crop are removed instead of creating invalid boxes', () => {
  const draft = scenario({ id: 'joseon', name: '조선', color: '#123456', focusBounds: [1, 2, 10, 20] });
  const result = context.ScenarioEditorV2.planMapChange(draft, 'regional_europe_med_1754');
  assert.equal(Object.hasOwn(result.nextMap.countries[0], 'focusBounds'), false);
});
console.log('Editor regional country bounds: ' + cases + ' passed');
