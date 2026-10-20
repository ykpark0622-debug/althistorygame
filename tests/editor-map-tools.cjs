'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), context = vm.createContext({ console });
for (const file of ['map-templates.js', 'map-regions.js', 'engine.js', 'map-view.js', 'editor.js']) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
require('./preloaded-map-fixture.cjs')(context);
const plain = value => JSON.parse(JSON.stringify(value));
const realm = value => vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify(value)) + ')', context);
const tools = context.ScenarioEditorV2;
let cases = 0;
function test(title, run) { run(); cases++; console.log('PASS ' + title); }
function scenario(templateId = 'world-balanced', overrides = []) {
  const value = context.GameEngine.createBlankScenario(); value.schemaVersion = 2;
  value.map = realm({ templateId, playerCountry: 'kor', countries: overrides, initial: { owners: {}, occupation: {}, influence: {}, markers: {} } });
  return value;
}
test('blank world keeps 5939 province IDs, countries, and story while clearing every default layer', () => {
  const draft = scenario('world-balanced', [{ id: 'kor', name: '나의 조선', color: '#223344', labelPosition: [1840, 325] }]);
  draft.events.push(realm({ id: 'retained', title: '유지할 이야기', choices: [] }));
  const original = plain(draft), result = tools.planBlankMap(draft), map = plain(result.nextMap);
  assert.equal(Object.keys(map.initial.owners).length, 5939);
  assert.deepEqual(new Set(Object.values(map.initial.owners)), new Set([result.neutralId]));
  assert.equal(map.playerCountry, result.neutralId);
  assert.equal(map.countries.at(-1).labelPosition, null);
  assert.deepEqual(map.countries[0], original.map.countries[0]);
  const effective = context.MapView.initialState({ map: result.nextMap }).map;
  for (const layer of ['occupation', 'influence', 'markers']) assert.equal(Object.keys(effective[layer]).length, 0);
  assert.deepEqual(plain(draft), original, 'Planning never mutates the map or story.');
});
test('repeated blanking reuses its neutral country and historical overlays are cleared with sparse nulls', () => {
  const entry = context.MapTemplates.list().find(template => template.id.includes('1444') && template.historicalRegionId);
  const draft = scenario(entry.id, []), template = context.MapTemplates.get(entry.id), first = tools.planBlankMap(draft);
  draft.map = first.nextMap;
  const second = tools.planBlankMap(draft), effective = context.MapView.initialState({ map: second.nextMap }).map;
  assert.equal(second.neutralId, first.neutralId); assert.equal(second.nextMap.countries.length, first.nextMap.countries.length);
  for (const layer of ['occupation', 'influence', 'markers']) assert.equal(Object.keys(effective[layer]).length, 0);
  const expectedInfluence = new Set([...template.provinces.filter(province => province.influence).map(province => province.id), ...Object.keys(template.historicalInitial?.influence || {})]);
  assert.equal(Object.keys(second.nextMap.initial.influence).length, expectedInfluence.size);
  assert.equal(Object.keys(second.nextMap.initial.markers).length, Object.keys(template.historicalInitial?.markers || {}).length);
});
test('blanking at the 1000 custom-country limit leaves current data untouched', () => {
  const draft = scenario('world-balanced', Array.from({ length: 1000 }, (_, i) => ({ id: 'custom_' + i, name: '국가 ' + i, color: '#123456' })));
  const original = plain(draft), plan = tools.planBlankMap(draft);
  assert.ok(plan.error.includes('1,000')); assert.equal(plan.nextMap, undefined); assert.deepEqual(plain(draft), original);
});
test('custom label point translates world to crop to world without requiring focusBounds', () => {
  const point = [1840, 325], draft = scenario('world-balanced', [{ id: 'kor', name: '조선', color: '#123456', labelPosition: point }]);
  for (const id of ['balanced_eastasia_modern', 'balanced_asia_modern', 'world-balanced']) {
    const template = context.MapTemplates.get(id), plan = tools.planMapChange(draft, id), country = plan.nextMap.countries.find(country => country.id === 'kor');
    assert.deepEqual(plain(country.labelPosition), [point[0] - (template.offsetX || 0), point[1] - (template.offsetY || 0)]);
    draft.map = plan.nextMap;
  }
});
test('label point outside a new crop falls back to automatic, hidden labels remain hidden', () => {
  const draft = scenario('world-balanced', [{ id: 'kor', name: '한국', color: '#123456', labelPosition: [100, 100] }, { id: 'jpn', name: '일본', color: '#654321', labelPosition: null }]);
  const plan = tools.planMapChange(draft, 'balanced_eastasia_modern');
  assert.equal(Object.hasOwn(plan.nextMap.countries[0], 'labelPosition'), false);
  assert.equal(plan.nextMap.countries[1].labelPosition, null);
  assert.deepEqual(plain(draft.map.countries[0].labelPosition), [100, 100]);
});
test('unrelated legacy projections discard manual label coordinates', () => {
  const draft = scenario('world-balanced', [{ id: 'kor', name: '한국', color: '#123456', labelPosition: [1840, 325] }]);
  assert.equal(Object.hasOwn(tools.planMapChange(draft, 'world1754').nextMap.countries[0], 'labelPosition'), false);
});
test('country search matches Korean names and IDs without treating no matches as another country', () => {
  const country = { id: 'joseon', name: '조선 왕국' };
  assert.equal(tools.countryMatches(country, '조선'), true); assert.equal(tools.countryMatches(country, ' JOSEON '), true);
  assert.equal(tools.countryMatches(country, ''), true); assert.equal(tools.countryMatches(country, '없는 나라'), false);
});
test('the existing 61940-region detailed atlas can also save and reimport a blank map below 5MiB', () => {
  vm.runInContext(fs.readFileSync(path.join(base, 'map-document.js'), 'utf8'), context, { filename: 'map-document.js' });
  const draft = scenario('world-detailed'), original = plain(draft);
  const plan = tools.planBlankMap(draft); assert.equal(plan.error, undefined); draft.map = plan.nextMap;
  const document = context.MapDocument.fromScenario(draft), json = JSON.stringify(document);
  assert.ok(Buffer.byteLength(json) < 5 * 1024 * 1024);
  assert.equal(Object.keys(document.map.initial.owners).length, 61940);
  assert.deepEqual(plain(context.MapDocument.validate(document).errors), []);
  const restored = context.MapDocument.toScenario(realm(JSON.parse(json)));
  assert.ok(Object.values(context.MapView.initialState(restored).map.owners).every(id => id === plan.neutralId));
  assert.equal(original.map.templateId, restored.map.templateId);
});
console.log('Editor map tools: ' + cases + ' passed');
