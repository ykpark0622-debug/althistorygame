'use strict';
const assert = require('node:assert/strict');
const template = {
  id: 'testmap', name: '문서 시험 지도', width: 200, height: 100,
  countries: [{ id: 'a', name: '갑국', color: '#123456', focusBounds: [0, 0, 80, 100], available: true }, { id: 'b', name: '을국', color: '#778899' }],
  provinces: [{ id: 'alpha', name: '첫 지역', owner: 'a', influence: 'b', path: 'M0 0L1 0L1 1Z' }, { id: 'beta', name: '둘째 지역', owner: 'b', path: 'M1 0L2 0L2 1Z' }]
};
globalThis.MapTemplates = { get: id => id === 'testmap' || id === 'regional_eastasia_1592' ? template : null };
const E = require('../engine.js');
const M = require('../map-document.js');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
const copy = value => JSON.parse(JSON.stringify(value));
const base = () => M.create({ id: 'map_test', templateId: 'testmap', title: '갈림길 지도' });

test('a map is a separate portable document and local storage key', () => {
  const doc = base();
  assert.equal(M.STORAGE_KEY, 'hc:workingMap:v1');
  assert.notEqual(M.STORAGE_KEY, 'history-crossroads:web:v1:scenario');
  assert.equal(M.MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(M.isMap(doc), true); assert.equal(M.isMap(E.createBlankScenario()), false);
  assert.deepEqual(M.validate(doc), { errors: [], warnings: [] });
  assert.deepEqual(doc.map.initial, { owners: {}, occupation: {}, influence: {}, markers: {} });
  assert.equal(JSON.stringify(doc).includes('M0 0'), false);
  assert.equal('events' in doc, false);
});

test('map to scenario round trip preserves initial map data without adding fake play content', () => {
  const doc = base();
  doc.map.countries.push({ id: 'island_union', name: '도서 연방', color: '#AABBCC', focusBounds: [100, 0, 200, 80] });
  doc.map.playerCountry = 'island_union';
  doc.map.initial = { owners: { alpha: 'island_union' }, occupation: { beta: 'a' }, influence: { alpha: null }, markers: { beta: '협약' } };
  const scenario = M.toScenario(doc);
  assert.equal(scenario.schemaVersion, 2); assert.equal(scenario.mode, 'chronicle'); assert.equal(scenario.draft, true);
  assert.deepEqual(scenario.events, []); assert.deepEqual(scenario.endings, []); assert.deepEqual(scenario.stats, []);
  assert.equal(scenario.start, null); assert.equal(scenario.defaultEnding, null);
  assert.deepEqual(E.validateScenario(scenario, { allowDraft: true }).errors, []);
  assert.deepEqual(M.fromScenario(scenario), doc);
  scenario.map.initial.owners.alpha = 'b';
  assert.equal(doc.map.initial.owners.alpha, 'island_union');
});

test('canonicalization strips inherited metadata and redundant defaults without changing semantics', () => {
  const doc = base();
  doc.map.countries = [copy(template.countries[0]), { id: 'b', name: '새 을국' }];
  doc.map.initial = { owners: { alpha: 'a', beta: 'a' }, occupation: { alpha: null }, influence: { alpha: 'b', beta: null }, markers: { alpha: null, beta: '원정' } };
  const before = copy(doc), normalized = M.normalize(doc);
  assert.deepEqual(doc, before, 'normalization must never mutate caller data');
  assert.equal(M.validate(doc).warnings.length, 1);
  assert.deepEqual(normalized.map.countries, [{ id: 'b', name: '새 을국', color: '#778899' }]);
  assert.deepEqual(normalized.map.initial, { owners: { beta: 'a' }, occupation: {}, influence: {}, markers: { beta: '원정' } });
  assert.deepEqual(M.normalize(normalized), normalized, 'canonicalization is idempotent');
  doc.map.initial.influence.alpha = null;
  assert.deepEqual(M.normalize(doc).map.initial.influence, { alpha: null }, 'explicit clearing of template influence must survive');
});

test('unknown template, provinces, countries and unsupported geometry are rejected', () => {
  const mutations = [
    doc => { doc.map.templateId = 'does_not_exist'; },
    doc => { doc.map.initial.owners.other_region = 'a'; },
    doc => { doc.map.initial.owners.alpha = 'unknown_country'; },
    doc => { doc.map.initial.owners.alpha = null; },
    doc => { doc.map.playerCountry = 'unknown_country'; },
    doc => { doc.map.initial.occupation.alpha = { toString: 'invalid' }; },
    doc => { doc.map.initial.surprise = {}; },
    doc => { doc.map.provinces = template.provinces; },
    doc => { doc.events = []; },
    doc => { doc.map.countries = [{ id: 'a', name: '중복' }, { id: 'a', name: '중복' }]; },
    doc => { doc.map.countries = [{ id: 'custom', name: '국가', color: 'red' }]; },
    doc => { doc.map.countries = [{ id: 'a', focusBounds: [-1, 0, 100, 100] }]; }
  ];
  for (const mutate of mutations) {
    const doc = base(); mutate(doc);
    const before = copy(doc);
    assert.ok(M.validate(doc).errors.length > 0);
    assert.throws(() => M.normalize(doc)); assert.deepEqual(doc, before);
  }
});

test('invalid JSON objects, sparse arrays, accessors and prototype pollution stay data errors', () => {
  const polluted = JSON.parse(JSON.stringify(base()).replace('"initial":{', '"initial":{"__proto__":{"polluted":true},'));
  for (const doc of [null, [], new Date(), { type: 'scenario' }, polluted]) assert.ok(M.validate(doc).errors.length > 0);
  assert.equal({}.polluted, undefined);
  const cycle = base(); cycle.loop = cycle; assert.ok(M.validate(cycle).errors.some(message => /순환/.test(message)));
  const sparse = base(); sparse.map.countries = new Array(1); assert.ok(M.validate(sparse).errors.length > 0);
  const accessor = base(); let invoked = false;
  Object.defineProperty(accessor, 'title', { enumerable: true, get() { invoked = true; throw new Error('not allowed'); } });
  assert.ok(M.validate(accessor).errors.length > 0); assert.equal(invoked, false);
  const hiddenAccessor = base();
  Object.defineProperty(hiddenAccessor, 'title', { enumerable: false, get() { invoked = true; throw new Error('not allowed'); } });
  assert.ok(M.validate(hiddenAccessor).errors.length > 0); assert.equal(invoked, false);
  const typeAccessor = {};
  Object.defineProperty(typeAccessor, 'type', { get() { invoked = true; return 'map'; } });
  assert.equal(M.isMap(typeAccessor), false); assert.equal(invoked, false);
  const number = base(); number.map.initial.owners.alpha = Infinity; assert.ok(M.validate(number).errors.length > 0);
});

test('the 5MB limit counts UTF8 bytes and missing initial layers are filled', () => {
  const large = base(); large.description = '가'.repeat(1800000);
  assert.ok(M.validate(large).errors.some(message => message.includes('5MB')));
  assert.throws(() => M.normalize(large));
  const doc = base(); delete doc.map.countries; delete doc.map.initial;
  assert.deepEqual(M.validate(doc).errors, []);
  assert.deepEqual(M.normalize(doc).map.initial, { owners: {}, occupation: {}, influence: {}, markers: {} });
  assert.deepEqual(M.normalize(doc).map.countries, []);
});

test('fromScenario extracts only map content and accepts metadata overrides', () => {
  const scenario = M.toScenario(base());
  scenario.events.push({ id: 'unfinished' }); scenario.flags.push({ id: 'pending' });
  assert.deepEqual(M.fromScenario(scenario, { id: 'copy_map', title: '복사본', description: '시작 지도' }),
    Object.assign(base(), { id: 'copy_map', title: '복사본', description: '시작 지도' }));
  assert.throws(() => M.fromScenario(E.createBlankScenario()));
});

test('engine editor limits are checked after redundant template defaults are removed', () => {
  const originalLength = template.provinces.length;
  try {
    for (let i = 0; i < 51000; i++) template.provinces.push({ id: 'region_' + i, name: '지역 ' + i, owner: 'a' });
    const redundant = base();
    for (const province of template.provinces) redundant.map.initial.owners[province.id] = province.owner;
    assert.deepEqual(M.validate(redundant).errors, [], 'many redundant default entries stay portable');
    assert.deepEqual(M.normalize(redundant).map.initial.owners, {});
    const tooMany = base();
    for (const province of template.provinces) tooMany.map.initial.owners[province.id] = province.owner === 'a' ? 'b' : 'a';
    const before = JSON.stringify(tooMany);
    assert.ok(M.validate(tooMany).errors.some(message => message.includes('시나리오 편집기')));
    assert.throws(() => M.normalize(tooMany));
    assert.equal(JSON.stringify(tooMany), before, 'failed oversized import preserves the supplied document');
  } finally { template.provinces.length = originalLength; }
});

test('all bundled scenario maps convert to compact editable map documents', () => {
  const fs = require('node:fs'), path = require('node:path');
  delete globalThis.MapTemplates;
  globalThis.MapTemplates = require('../map-regions.js');
  for (const filename of ['imjin-world.json', 'regional-europe-demo.json', 'chronicle-sejong.json', 'reign-france.json', 'world-detailed-demo.json']) {
    const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples', filename), 'utf8'));
    const map = M.fromScenario(scenario);
    assert.deepEqual(M.validate(map).errors, [], filename);
    assert.deepEqual(E.validateScenario(M.toScenario(map), { allowDraft: true }).errors, [], filename);
    assert.ok(JSON.stringify(map).length < 5000, 'shared templates are referenced without embedding default ownership: ' + filename);
  }
  const doc = M.create();
  assert.equal(doc.map.templateId, 'regional_eastasia_1592');
  assert.equal(doc.map.playerCountry, 'joseon');
});
console.log(passed + ' map document tests passed.');
