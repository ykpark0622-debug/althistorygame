'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '..');
require(path.join(dir, 'map-templates.js'));
require(path.join(dir, 'ai-helper.js'));
const A = globalThis.ScenarioAI;
const E = require(path.join(dir, 'engine.js'));
let passed = 0;
function test(name, run) { run(); passed += 1; console.log('ok ' + name); }
const json = JSON.stringify(A.EXAMPLE);

test('V1 strict JSON and wrapped JSON stay readable', () => {
  assert.deepEqual(A.extract(json).value, A.EXAMPLE);
  assert.deepEqual(A.extract(JSON.stringify({ scenario: A.EXAMPLE })).value, A.EXAMPLE);
});
test('prose placeholders and unrelated objects do not mask the scenario', () => {
  for (const prefix of ['이름은 {name}으로 넣습니다.\n', '참고 { 이 문장은 닫지 않은 설명\n', '{"note":"안내"}\n', '{"schemaVersion":2}\n']) {
    assert.deepEqual(A.extract(prefix + json).value, A.EXAMPLE);
  }
});
test('markdown fences and appended prose are accepted', () => {
  assert.deepEqual(A.extract('다음입니다\n```json\n' + json + '\n```\n끝').value, A.EXAMPLE);
});
test('comment braces and comma before comment are cleaned outside strings', () => {
  const answer = '{\n// } ] {name}\n"schemaVersion":2,/* { } [ */"events":[], // trailing }\n}';
  const result = A.extract(answer);
  assert.equal(result.cleaned, true);
  assert.deepEqual(result.value, { schemaVersion: 2, events: [] });
});
test('quoted URLs, braces and comment-looking text are preserved', () => {
  const answer = { schemaVersion: 1, events: [], body: 'https://example.invalid/{name} /* text */ // text', marker: '{"quote":"x"}' };
  const result = A.extract(JSON.stringify(answer));
  assert.equal(result.cleaned, false);
  assert.deepEqual(result.value, answer);
});
test('empty, malformed and cut answers retain useful repair categories', () => {
  for (const [input, kind] of [['', 'empty'], ['{name}', 'empty'], ['{"schemaVersion":1,"events":[', 'truncated'], ['{"schemaVersion":1,"events":oops}', 'parse']]) {
    assert.throws(() => A.extract(input), error => error.kind === kind);
  }
});
test('normalization preserves V1 and fills unambiguous V2 defaults', () => {
  const old = JSON.parse(json); A.normalize(old);
  assert.equal(old.schemaVersion, 1); assert.equal(old.mode, undefined);
  const modern = { schemaVersion: '2', reign: {}, events: [], endings: [] }; A.normalize(modern);
  assert.equal(modern.schemaVersion, 2); assert.equal(modern.mode, 'reign');
  const inferred = { map: { templateId: 'eastasia1419' }, events: [], endings: [] }; A.normalize(inferred);
  assert.equal(inferred.schemaVersion, 2); assert.equal(inferred.mode, 'chronicle');
});
const options = [{}, { mode: 'reign' }];
for (const template of MapTemplates.list()) for (const mode of ['chronicle', 'reign']) options.push({ mode, mapTemplateId: template.id });
for (const option of options) test('example validates and replays: ' + JSON.stringify(option), () => {
  const scenario = A.buildExample(option);
  assert.deepEqual(E.validateScenario(scenario).errors, []);
  let state = E.createState(scenario, { seed: 12 });
  for (let guard = 0; !state.endingId && guard < 40; guard += 1) {
    if (state.activeRandomEventId || scenario.mode !== 'reign') {
      const choice = E.getChoices(scenario, state).find(item => item.enabled);
      assert.ok(choice); state = E.choose(scenario, state, choice.index);
    } else {
      const status = E.getReignStatus(scenario, state);
      const card = status.cards.find(item => !status.decisions?.[item.part.id]);
      if (card) state = E.choosePart(scenario, state, card.event.id, card.choices.find(item => item.enabled).index);
      else state = E.settleTurn(scenario, state);
    }
  }
  assert.ok(state.endingId, 'example must finish');
  assert.deepEqual(E.restoreState(scenario, JSON.parse(JSON.stringify(state))), state);
});
test('prompt includes selected map IDs, mode and base scenario without SVG', () => {
  for (const template of MapTemplates.list()) {
    const actual = MapTemplates.get(template.id);
    const prompt = A.buildPrompt({ mode: 'reign', mapTemplateId: template.id, baseScenario: A.buildExample() });
    assert.ok(prompt.includes(actual.provinces[0].id));
    assert.ok(prompt.includes(actual.countries[0].id));
    assert.ok(prompt.includes('mode:"reign"'));
    assert.ok(prompt.includes('[현재 시나리오]'));
    assert.ok(!prompt.includes(actual.provinces[0].path));
  }
  assert.throws(() => A.buildPrompt({ mapTemplateId: 'missing' }), /지도/);
});

async function gallerySortTest() {
  const source = fs.readFileSync(path.join(dir, 'gallery.js'), 'utf8');
  const loadSource = source.slice(source.indexOf('  async function load(reset)'), source.indexOf('  async function loadLiked(ids)'));
  const state = { user: { id: 'user_one' }, tab: 'liked', sort: 'popular', q: '', tag: '', items: [], total: 0, seq: 0 };
  const records = Array.from({ length: 51 }, (_, i) => ({ id: String(i), title: i % 2 ? '필터' : '기타', like_count: i, play_count: 50 - i, created_at: i, likedBy: 'user_one' }));
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'scenarios');
    const order = []; let rows = records.slice(), start = 0, end = rows.length;
    const query = {
      select(columns) { assert.ok(columns.includes('likes!inner(user_id)')); return query; },
      eq(field, value) { assert.equal(field, 'likes.user_id'); rows = rows.filter(item => item.likedBy === value); return query; },
      order(field, option) { order.push([field, option.ascending]); return query; },
      range(from, to) { start = from; end = to + 1; return query; },
      filterTitle(text) { rows = rows.filter(item => item.title.includes(text)); return query; },
      then(resolve) {
        calls.push({ order, start, end });
        rows.sort((a, b) => { for (const [field, ascending] of order) { if (a[field] !== b[field]) return (a[field] > b[field] ? 1 : -1) * (ascending ? 1 : -1); } return 0; });
        return Promise.resolve({ data: rows.slice(start, end), count: rows.length, error: null }).then(resolve);
      }
    };
    return query;
  } };
  const scope = { state, client, PAGE: 24, META: 'id,title', SORTS: { popular: [['like_count', false], ['created_at', false]], recent: [['created_at', false]], played: [['play_count', false], ['created_at', false]] }, applyFilters: query => state.q ? query.filterTitle(state.q) : query, renderList() {}, loadLiked: async () => {}, loadReports: async () => {}, friendlyError: String };
  vm.runInNewContext(loadSource + '\nthis.load = load;', scope);
  await scope.load(true);
  assert.equal(state.items[0].id, '50'); assert.equal(state.items[23].id, '27'); assert.equal(state.total, 51);
  await scope.load(false);
  assert.equal(state.items[24].id, '26'); assert.equal(calls[1].start, 24);
  state.sort = 'played'; await scope.load(true); assert.equal(state.items[0].id, '0');
  state.sort = 'recent'; state.q = '필터'; await scope.load(true);
  assert.equal(state.items[0].id, '49'); assert.equal(state.total, 25);
  passed += 1; console.log('ok liked collection sorts and filters globally before pagination (mock server, no network)');
}

gallerySortTest().then(() => {
  test('additive SQL migration does not replace authentication or RLS', () => {
    const migration = fs.readFileSync(path.join(dir, 'supabase/migrate-v2.sql'), 'utf8');
    assert.match(migration, /add column if not exists schema_version/);
    assert.match(migration, /schemaVersion' in \('1', '2'\)/);
    assert.match(migration, /create or replace function public\.hc_scenarios_metadata_v2/);
    assert.doesNotMatch(migration, /(?:drop\s+table|delete\s+from|create\s+policy|drop\s+policy|revoke\s+|grant\s+)/i);
  });
  console.log('Passed ' + passed + ' focused AI/gallery checks. SQL was inspected, not executed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
