'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(base, 'flowchart.js'), 'utf8'), context, { filename: 'flowchart.js' });
const flow = context.ScenarioFlowchart;
const sample = () => JSON.parse(fs.readFileSync(path.join(base, 'examples/reign-france.json'), 'utf8'));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }

test('actual reign sample reaches all registered turn cards without false next warnings', () => {
  const scenario = sample();
  const model = flow.analyze(scenario);
  const turnIDs = scenario.reign.turns.flatMap(turn => turn.eventIds);
  for (const id of turnIDs) assert.ok(model.reachableIds.includes(id), id);
  assert.equal(model.warnings.length, 0, JSON.stringify(model.warnings));
  assert.equal(model.edges.filter(edge => turnIDs.includes(edge.source) && !model.linkedEventIds.includes(edge.source)).length, 0, 'ordinary reign cards must not imply next-based year progression');
});

test('ordinary reign next values are preserved but ignored by analysis and connecting', () => {
  const scenario = sample();
  const event = scenario.events.find(item => item.id === scenario.reign.turns[0].eventIds[0]);
  event.next = 'ignored_missing_target';
  event.choices[0].next = 'another_ignored_target';
  scenario.start = 'ignored_missing_start';
  assert.equal(flow.analyze(scenario).warnings.length, 0);
  assert.equal(flow.connect(scenario, event.id, 0, 'END'), false);
  assert.equal(event.choices[0].next, 'another_ignored_target');
});

test('unregistered reign events get an actionable membership warning', () => {
  const scenario = sample();
  scenario.events.push({ id: 'unregistered', title: '미등록', next: 'END', choices: [{ text: '선택' }] });
  const model = flow.analyze(scenario);
  assert.ok(model.warnings.some(item => item.eventId === 'unregistered' && item.message.includes('연도 사건 목록이나 활성 돌발 규칙')));
});

test('reign random roots and their response chains retain usable links', () => {
  const scenario = sample();
  scenario.events.push(
    { id: 'random_root', title: '돌발', next: 'response', choices: [{ text: '대응' }] },
    { id: 'response', title: '후속 대응', next: 'RETURN', choices: [{ text: '복귀' }] }
  );
  (scenario.randomEvents ||= []).push({ id: 'rule', eventId: 'random_root', chance: 30, when: [] });
  const model = flow.analyze(scenario);
  assert.equal(model.warnings.length, 0, JSON.stringify(model.warnings));
  assert.ok(model.reachableIds.includes('random_root'));
  assert.ok(model.reachableIds.includes('response'));
  assert.ok(model.edges.some(edge => edge.source === 'response' && edge.target === 'RETURN'));
  assert.equal(flow.connect(scenario, 'random_root', 0, 'RETURN'), true);
  assert.equal(scenario.events.find(event => event.id === 'random_root').choices[0].next, 'RETURN');
});

test('chronicle graph connections and missing-target warnings remain unchanged', () => {
  const scenario = { schemaVersion: 1, start: 'first', events: [
    { id: 'first', next: 'second', choices: [{ text: '계속' }] },
    { id: 'second', next: 'END', choices: [{ text: '끝' }] }
  ] };
  assert.equal(flow.analyze(scenario).warnings.length, 0);
  assert.equal(flow.connect(scenario, 'first', 0, 'END'), true);
  scenario.events[0].next = 'missing';
  assert.ok(flow.analyze(scenario).warnings.some(item => item.message.includes('대상 사건이 없습니다')));
});

console.log(passed + ' flow reign smoke tests passed');
