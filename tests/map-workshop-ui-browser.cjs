'use strict';
// Real Chrome workflow checks, served entirely from this release. No hosted
// gallery, Supabase account or production save is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const output = path.resolve(__dirname, '../../../outputs');
const origin = 'https://map-workshop-ui.test';
const report = { checks: [], browserErrors: [], notes: [
  'All requests are intercepted and served from the local release. No production services are contacted.',
  'JSON export checks inspect the real generated download Blob and round-trip the file import. Browser filesystem downloads are not exercised.'
] };
const editor = page => page.locator('#editor-root');
function passed(name, details) { report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS ' + name); }
async function ready(page, id) {
  await page.waitForFunction(id => MapTemplates.get(id) && document.querySelector('#editor-dialog[open]') && document.querySelector('#editor-root .map-heading h2')?.textContent.includes(MapTemplates.get(id).name), id);
}
async function save(page) { await page.getByRole('button', { name: '지도 저장', exact: true }).click(); return page.evaluate(() => MapMaker.getStored()); }
async function protectedGame(page) {
  return page.evaluate(() => ({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => /history-crossroads:web:v1:(scenario|autosave|save|collection:)/.test(key))) }));
}
async function openMap(page, doc) { await page.evaluate(async doc => { await MapTemplates.ensure(doc.map.templateId); await MapMaker.importDocument(doc); }, doc); await ready(page, doc.map.templateId); }
async function picker(page, label, id, query = id, scope = editor(page)) {
  const trigger = scope.getByRole('combobox', { name: label, exact: true });
  await trigger.click();
  const search = scope.getByLabel(label + ' 검색', { exact: true });
  await search.fill(query);
  await scope.locator('[role="option"][data-country-id="' + id + '"]:visible').click();
}
async function settings(page) {
  const field = page.getByLabel('① 사용할 지역 지도', { exact: true });
  if (!await field.isVisible()) await page.getByRole('button', { name: '지도 설정', exact: true }).click();
}
async function captureExport(page) {
  await page.evaluate(() => {
    if (!window.__uiExportCapture) {
      window.__uiExportCapture = true; const blobs = new Map(), create = URL.createObjectURL.bind(URL), click = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
      HTMLAnchorElement.prototype.click = function () { if (!this.hasAttribute('download')) return click.call(this); window.__uiDownloads.push({ name: this.download, blob: blobs.get(this.href) }); };
    }
    window.__uiDownloads = [];
  });
  await page.getByRole('button', { name: '지도 JSON 내보내기', exact: true }).click();
  return page.evaluate(async () => ({ name: __uiDownloads[0].name, text: await __uiDownloads[0].blob.text() }));
}
async function countryList(page, id) {
  await page.getByLabel('국가 목록 검색', { exact: true }).fill(id);
  // Country list rows are real controls rather than mutating internal editor state.
  await editor(page).locator('[data-country-row="' + id + '"]').click();
}
async function visibleLand(page, count = 4) {
  const svg = editor(page).locator('svg').first(); await svg.scrollIntoViewIfNeeded();
  return page.evaluate(count => {
    const svg = document.querySelector('#editor-root svg'), rect = svg.getBoundingClientRect(), found = [];
    const bounds = { left: Math.max(rect.left + 20, 0), top: Math.max(rect.top + 20, 0), right: Math.min(rect.right - 20, innerWidth), bottom: Math.min(rect.bottom - 20, innerHeight) };
    // Read actual hit-testing so concave/coastal province centroids and text do
    // not produce synthetic "paint" tests that miss the real pointer path.
    for (let y = bounds.top; y < bounds.bottom; y += 13) for (let x = bounds.left; x < bounds.right; x += 13) {
      const node = document.elementFromPoint(x, y), id = node?.closest('[data-province]')?.dataset.province;
      if (id && svg.contains(node) && !found.some(p => p.id === id)) found.push({ id, x, y });
      if (found.length >= count) return found;
    }
    return found;
  }, count);
}
async function stroke(page, points, cancel = false) {
  assert.ok(points.length >= 2, 'Two visible land regions are required');
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
  if (cancel) await editor(page).locator('svg').first().dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
  await page.mouse.up();
}
async function transform(page, selector = '#editor-root [data-map-world]') {
  return page.locator(selector).evaluate(node => { const m = node.transform.baseVal.consolidate().matrix; return { x: m.e, y: m.f, scale: m.a }; });
}
async function keyHold(page, key, ms = 140) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(35); }
async function routed(browser, offline = false) {
  const context = await browser.newContext({ viewport: { width: 1540, height: 1100 } }), page = await context.newPage(), requests = [], external = [];
  page.setDefaultTimeout(45000); page.on('pageerror', error => report.browserErrors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); requests.push(url.pathname);
    if (url.origin !== origin) { external.push(url.href); return route.abort(); }
    if (offline) return url.pathname === '/offline.html' ? route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'standalone.html')) }) : route.abort();
    if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.txt': 'text/plain' }[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto(origin + (offline ? '/offline.html' : '/index.html')); await page.evaluate(() => HistoryCrossroads.ready);
  return { context, page, requests, external };
}
async function workflow(page, initialGame) {
  const doc = await page.evaluate(async () => { await MapTemplates.ensure('europe-balanced'); return MapDocument.create({ id: 'workshop_ui_qa', title: '국가 목록 작업실 검사', templateId: 'europe-balanced', playerCountry: 'fra' }); });
  await openMap(page, doc); const original = await save(page);
  await page.getByRole('button', { name: '＋ 국가 만들기', exact: true }).click();
  await page.getByLabel('새 국가 이름', { exact: true }).fill('신생 갈림길 왕국'); await page.getByLabel('새 국가 색상', { exact: true }).fill('#6b459f');
  await page.getByRole('button', { name: '만들고 칠하기', exact: true }).click();
  const created = await save(page), custom = created.map.countries.find(c => c.name === '신생 갈림길 왕국');
  assert.ok(custom); assert.equal(custom.color, '#6b459f'); assert.equal(created.map.playerCountry, original.map.playerCountry);
  assert.equal(await page.getByRole('button', { name: '드래그 칠하기', exact: true }).getAttribute('aria-pressed'), 'true');
  passed('Creating a named colored country immediately selects it for editing and drag painting without changing the map center country');
  await editor(page).locator('[data-map-tool="country"]').click();
  const points = await visibleLand(page, 4), before = await save(page); await stroke(page, points.slice(0, 3));
  const painted = await save(page); for (const p of points.slice(0, 3)) assert.equal(painted.map.initial.owners[p.id], custom.id);
  assert.ok(Object.keys(painted.map.initial.owners).length >= 3);
  await page.getByRole('button', { name: '마지막 칠하기 되돌리기', exact: true }).click(); assert.deepEqual(await save(page), before);
  await stroke(page, await visibleLand(page, 3), true); assert.deepEqual(await save(page), before);
  passed('One real pointer drag paints multiple provinces as one undoable action, and pointer cancellation commits no partial territory');
  await page.getByRole('button', { name: '여러 지역 선택', exact: true }).click();
  const batch = await visibleLand(page, 3); await stroke(page, batch); const selectedBefore = await save(page); assert.deepEqual(selectedBefore.map, before.map);
  await page.getByRole('button', { name: /^선택한 지역 배정/ }).click(); const assigned = await save(page); for (const p of batch) assert.equal(assigned.map.initial.owners[p.id], custom.id);
  await page.getByRole('button', { name: '마지막 칠하기 되돌리기', exact: true }).click(); assert.deepEqual(await save(page), before);
  await page.getByRole('button', { name: '선택 해제', exact: true }).click();
  passed('Selecting multiple regions changes no ownership until explicit assignment, and the entire batch is reversible');
  await stroke(page, await visibleLand(page, 3)); await page.getByRole('button', { name: /^선택한 지역 배정/ }).click();
  await countryList(page, custom.id); await page.getByLabel('국가 색상', { exact: true }).fill('#1b806e');
  let changed = await save(page); assert.equal(changed.map.countries.find(c => c.id === custom.id).color, '#1b806e');
  const colors = await editor(page).locator('[data-province]').evaluateAll((nodes, id) => nodes.filter(node => node.style.getPropertyValue('--province-color') === '#1b806e').length, custom.id); assert.ok(colors >= 3);
  await page.getByRole('button', { name: '이동', exact: true }).click(); const regionPoint = (await visibleLand(page, 2))[0]; await page.mouse.click(regionPoint.x, regionPoint.y);
  for (const label of ['시작 소유국', '군사 점령국', '영향국']) await picker(page, label, custom.id, '신생');
  const provinceEdited = await save(page); for (const layer of ['owners', 'occupation', 'influence']) assert.equal(provinceEdited.map.initial[layer][regionPoint.id], custom.id);
  await picker(page, '군사 점령국', '__none__', '없음'); await picker(page, '영향국', '__none__', '없음');
  const cleared = await page.evaluate(doc => MapView.initialState(MapDocument.toScenario(doc)).map, await save(page)); assert.equal(cleared.occupation[regionPoint.id], undefined); assert.equal(cleared.influence[regionPoint.id], undefined);
  passed('Region details search custom countries for ownership, occupation and influence, and retain the explicit clear-to-none operations');
  await settings(page); const center = page.getByRole('combobox', { name: '중심 국가', exact: true });
  await picker(page, '중심 국가', 'deu', '독일'); changed = await save(page); assert.equal(changed.map.playerCountry, 'deu'); assert.equal(changed.map.countries.find(c => c.id === custom.id).color, '#1b806e');
  await center.click(); await page.getByLabel('중심 국가 검색', { exact: true }).fill('존재하지않는국가_zz'); const noMatch = await save(page); assert.deepEqual(noMatch, changed);
  await picker(page, '중심 국가', 'fra', 'fra');
  passed('Country-list editing and recoloring are independent of center selection; searchable center choices preserve all data when no country matches');
  // Keep metadata and the saved map title editable in the same settings panel.
  await page.getByLabel('지도 제목', { exact: true }).fill('국가 목록형 UI 검증 지도');
  const setup = await page.evaluate(() => ({ count: MapTemplates.list().length, regions: MapTemplates.regions().map(r => r.id) })); assert.equal(setup.count, 28); assert.equal(setup.regions.length, 6);
  assert.equal(await page.getByLabel('① 사용할 지역 지도', { exact: true }).inputValue(), 'europe_med');
  assert.equal(await page.getByLabel('② 시대 기본안', { exact: true }).inputValue(), 'balanced_modern');
  passed('The redesigned settings retain map title, the six regional selectors, existing era presets and all 28 template registrations');
  // Real label drag after previous painting; ownership must remain identical.
  await countryList(page, custom.id); await page.getByRole('button', { name: '국명 위치', exact: true }).click();
  await page.getByRole('button', { name: '선택한 국명 위치 지정', exact: true }).click();
  const svg = editor(page).locator('svg').first(); await svg.scrollIntoViewIfNeeded(); const box = await svg.boundingBox();
  assert.ok(await svg.evaluate(n => Math.abs(n.getBoundingClientRect().height - n.closest('.map-viewport').getBoundingClientRect().height) < 2), 'The visible map viewport must not clip a taller SVG');
  await page.mouse.click(box.x + box.width * .58, box.y + box.height * .55); const placed = await save(page); assert.ok(Array.isArray(placed.map.countries.find(c => c.id === custom.id).labelPosition));
  const label = editor(page).locator('[data-map-country-label="' + custom.id + '"]'), lb = await label.boundingBox(); assert.ok(lb);
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2); await page.mouse.down(); await page.mouse.move(lb.x + lb.width / 2 + 24, lb.y + lb.height / 2 + 12, { steps: 6 }); await page.mouse.up();
  const moved = await save(page); assert.notDeepEqual(moved.map.countries.find(c => c.id === custom.id).labelPosition, placed.map.countries.find(c => c.id === custom.id).labelPosition); assert.deepEqual(moved.map.initial, placed.map.initial);
  await page.getByRole('button', { name: '국명 숨기기', exact: true }).click(); assert.equal((await save(page)).map.countries.find(c => c.id === custom.id).labelPosition, null);
  await page.getByRole('button', { name: '국명 위치 자동 배치', exact: true }).click(); assert.equal(Object.hasOwn((await save(page)).map.countries.find(c => c.id === custom.id), 'labelPosition'), false);
  passed('Country labels can still be placed, dragged, hidden and restored to automatic positioning without painting territory');
  await settings(page); const beforeBlank = await save(page); await page.getByRole('button', { name: '백지도 만들기', exact: true }).click(); const blank = await save(page);
  const effective = await page.evaluate(doc => MapView.initialState(MapDocument.toScenario(doc)).map, blank); assert.equal(new Set(Object.values(effective.owners)).size, 1);
  await page.getByRole('button', { name: '백지도 만들기 되돌리기', exact: true }).click(); assert.deepEqual(await save(page), beforeBlank);
  const downloaded = await captureExport(page); assert.deepEqual(JSON.parse(downloaded.text), beforeBlank); assert.match(downloaded.name, /\.map\.json$/);
  await page.getByRole('button', { name: '닫기', exact: true }).last().click(); await page.locator('#scenario-import').setInputFiles({ name: 'ui-round-trip.map.json', mimeType: 'application/json', buffer: Buffer.from(downloaded.text) }); await ready(page, 'europe-balanced'); assert.deepEqual(await save(page), beforeBlank); assert.deepEqual(await protectedGame(page), initialGame);
  passed('Blank-map undo and actual exported JSON reimport preserve the exact edited document while map-only work leaves game and save bytes unchanged');
  return { doc: beforeBlank, custom: custom.id };
}
async function keyboard(page) {
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await editor(page).locator('[data-map-tool="reset"]').click(); for (let i = 0; i < 4; i++) await editor(page).locator('[data-map-tool="in"]').click();
  const svg = editor(page).locator('svg').first(); await svg.scrollIntoViewIfNeeded(); const beforeDoc = await save(page);
  for (const [key, axis, sign] of [['w', 'y', 1], ['s', 'y', -1], ['a', 'x', 1], ['d', 'x', -1]]) {
    await svg.focus(); const before = await transform(page); await keyHold(page, key); const after = await transform(page); assert.ok((after[axis] - before[axis]) * sign > 0, key + ' must pan in the promised direction');
    await page.waitForTimeout(100); assert.deepEqual(await transform(page), after, key + ' movement must stop after keyup');
  }
  await svg.focus(); let before = await transform(page); await keyHold(page, 'd', 180); let after = await transform(page); const normal = before.x - after.x;
  await svg.focus(); before = await transform(page); await page.keyboard.down('Shift'); await keyHold(page, 'd', 180); await page.keyboard.up('Shift'); after = await transform(page); assert.ok(before.x - after.x > normal * 1.4);
  await page.getByLabel('국가 목록 검색', { exact: true }).fill('wasd'); before = await transform(page); await keyHold(page, 'w'); assert.deepEqual(await transform(page), before);
  await svg.focus(); await page.keyboard.down('Control'); await keyHold(page, 'a'); await page.keyboard.up('Control'); assert.deepEqual(await transform(page), before);
  await svg.dispatchEvent('keydown', { key: 'w', code: 'KeyW', isComposing: true, bubbles: true }); await page.waitForTimeout(100); assert.deepEqual(await transform(page), before);
  assert.deepEqual(await save(page), beforeDoc);
  passed('Focused WASD pans in all four directions, held movement stops on keyup, Shift accelerates and typing/shortcuts/IME never pan or change ownership');
  // Holding a key while closing must cancel every animation. Detached maps may
  // not continue changing after the editor has released them.
  await svg.focus(); const handle = await editor(page).locator('[data-map-world]').elementHandle(); await page.keyboard.down('d'); await page.waitForTimeout(80); await page.evaluate(() => ScenarioEditor.close()); const detached = await handle.getAttribute('transform'); await page.waitForTimeout(120); await page.keyboard.up('d'); assert.equal(await handle.getAttribute('transform'), detached);
  passed('Closing the workshop while a key is held cancels keyboard animation and leaves its detached map stable');
}
async function scenarioPickers(page, doc, custom) {
  await page.evaluate(doc => {
    const scenario = MapDocument.toScenario(doc), prov = MapTemplates.get(doc.map.templateId).provinces[0].id;
    scenario.draft = false; scenario.stats = [{ id: 'trust', name: '민심', min: 0, max: 100, initial: 50 }]; scenario.start = 'first'; scenario.defaultEnding = 'done';
    scenario.events = [{ id: 'first', title: '국가 선택 검사', body: '선택한 국가와 조건을 기록합니다.', next: 'END', choices: [{ text: '영토 변화 검사', effects: {}, setFlags: {}, when: [{ kind: 'territory', key: prov, field: 'owner', op: 'eq', value: 'fra' }], territory: [{ prov }] }] }];
    scenario.endings = [{ id: 'done', title: '끝', summary: '검사 완료', body: '기록됩니다.', kind: 'mixed', priority: 0, immediate: false, when: [] }];
    window.__uiScenario = scenario; window.__uiDraft = null; ScenarioEditor.open(scenario, draft => { window.__uiDraft = draft; }, { page: 'events' });
  }, doc);
  const scope = editor(page); for (const label of ['대상 국가', '소유국', '군사 점령국', '영향국']) await picker(page, label, custom, '신생', scope);
  // The same selector must keep special null/keep choices available under a
  // search term, without silently replacing an already-chosen country.
  await page.getByRole('combobox', { name: '영향국', exact: true }).click(); await page.getByLabel('영향국 검색', { exact: true }).fill('없는국가_zz'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '지도·초기 영토', exact: true }).click(); await settings(page); await picker(page, '플레이어 국가', 'fra', '프랑스');
  await page.getByRole('button', { name: '사건·선택지', exact: true }).click();
  await page.getByRole('button', { name: '적용하고 새 게임', exact: true }).click(); const draft = await page.evaluate(() => __uiDraft); assert.ok(draft);
  const choice = draft.events[0].choices[0]; assert.equal(choice.when[0].value, custom); for (const key of ['to', 'occupation', 'influence']) assert.equal(choice.territory[0][key], custom); assert.equal(draft.map.playerCountry, 'fra');
  passed('Actual scenario condition, ownership, occupation, influence and player-country controls all search and retain the chosen custom country in the applied manuscript');
  await page.evaluate(() => ScenarioEditor.open(__uiDraft, draft => { window.__uiDraft = draft; }, { page: 'events' }));
  await picker(page, '대상 국가', '__none__', '없음'); await picker(page, '소유국', '__keep__', '변경하지'); await picker(page, '군사 점령국', '__clear__', '지우기'); await picker(page, '영향국', '__keep__', '변경하지');
  // Choose a real result entirely through the keyboard before restoring the
  // sentinel, exercising navigation without native selectOption shortcuts.
  await page.getByRole('combobox', { name: '영향국', exact: true }).click(); await page.getByLabel('영향국 검색', { exact: true }).fill(custom); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); assert.equal(await page.getByRole('combobox', { name: '영향국', exact: true }).getAttribute('data-country-id'), custom); await picker(page, '영향국', '__keep__', '변경하지');
  await page.getByRole('button', { name: '적용하고 새 게임', exact: true }).click(); const sentinel = await page.evaluate(() => __uiDraft.events[0].choices[0]); assert.equal(sentinel.when[0].value, null); assert.equal(Object.hasOwn(sentinel.territory[0], 'to'), false); assert.equal(sentinel.territory[0].occupation, null); assert.equal(Object.hasOwn(sentinel.territory[0], 'influence'), false);
  passed('Country popovers support keyboard selection and preserve condition-null, keep-existing and clear-occupation sentinel semantics');
}
async function isolatedMaps(page, doc) {
  await page.evaluate(doc => {
    const scenario = MapDocument.toScenario(doc), state = MapView.initialState(scenario);
    window.__uiIsolated = { scenario, state, original: JSON.stringify({ scenario, state }) };
    for (const id of ['ui-map-a', 'ui-map-b']) { const node = document.createElement('div'); node.id = id; node.style.width = '800px'; document.body.append(node); MapView.render(node, scenario, state); }
  }, doc);
  const a = page.locator('#ui-map-a'), b = page.locator('#ui-map-b');
  await a.locator('svg').scrollIntoViewIfNeeded(); for (let i = 0; i < 3; i++) await a.locator('[data-map-tool="in"]').click();
  await a.locator('svg').focus(); const bBefore = await transform(page, '#ui-map-b [data-map-world]'); await keyHold(page, 'd'); assert.deepEqual(await transform(page, '#ui-map-b [data-map-world]'), bBefore);
  await a.locator('svg').focus(); await page.keyboard.down('d'); await page.waitForTimeout(60); await a.evaluate(node => { node.hidden = true; }); await page.waitForTimeout(60); const hidden = await transform(page, '#ui-map-a [data-map-world]'); await page.waitForTimeout(100); assert.deepEqual(await transform(page, '#ui-map-a [data-map-world]'), hidden); await page.keyboard.up('d');
  await a.evaluate(node => { node.hidden = false; }); await a.locator('svg').scrollIntoViewIfNeeded(); await a.locator('svg').focus(); await page.keyboard.down('d'); await page.waitForTimeout(60); await a.evaluate(node => MapView.dispose(node)); const disposed = await transform(page, '#ui-map-a [data-map-world]'); await page.waitForTimeout(100); await page.keyboard.up('d'); assert.deepEqual(await transform(page, '#ui-map-a [data-map-world]'), disposed);
  assert.equal(await page.evaluate(() => JSON.stringify({ scenario: __uiIsolated.scenario, state: __uiIsolated.state }) === __uiIsolated.original), true);
  await page.evaluate(() => { for (const id of ['ui-map-a', 'ui-map-b']) { const node = document.getElementById(id); MapView.dispose(node); node.remove(); } });
  passed('Two map widgets have independent keyboard focus; hidden and disposed views stop immediately without changing scenario or game-state data');
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const f = await routed(browser), { page, requests } = f; assert.equal(requests.filter(p => p.startsWith('/assets/maps/')).length, 0);
    const initialGame = await protectedGame(page), edited = await workflow(page, initialGame);
    // A fresh import of an already loaded template reuses cached geometry.
    const before = requests.length; await openMap(page, edited.doc); assert.equal(requests.slice(before).filter(p => p.startsWith('/assets/maps/')).length, 0);
    await page.screenshot({ path: path.join(output, 'map-country-list-v2.11-preview.png'), fullPage: true }); report.screenshot = path.join(output, 'map-country-list-v2.11-preview.png');
    await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.equal(await page.locator('#editor-dialog').evaluate(n => n.getBoundingClientRect().width <= innerWidth), true); await page.getByRole('button', { name: '＋ 국가 만들기', exact: true }).scrollIntoViewIfNeeded(); assert.equal(await page.getByRole('button', { name: '＋ 국가 만들기', exact: true }).isVisible(), true); await page.setViewportSize({ width: 1540, height: 1100 });
    passed('Reopening cached maps makes no new geometry requests and the actual country-list workshop fits a 390px mobile viewport');
    await keyboard(page); assert.deepEqual(await protectedGame(page), initialGame); await scenarioPickers(page, edited.doc, edited.custom); assert.deepEqual(await protectedGame(page), initialGame); await isolatedMaps(page, edited.doc); assert.deepEqual(f.external, []); await f.context.close();
    if (!process.argv.includes('--web-only')) {
      const off = await routed(browser, true), p = off.page; await openMap(p, edited.doc); await p.getByRole('button', { name: '＋ 국가 만들기', exact: true }).click(); await p.getByLabel('새 국가 이름', { exact: true }).fill('오프라인 왕국'); await p.getByLabel('새 국가 색상', { exact: true }).fill('#9475a5'); await p.getByRole('button', { name: '만들고 칠하기', exact: true }).click(); assert.ok((await save(p)).map.countries.some(c => c.name === '오프라인 왕국')); await keyboard(p); assert.deepEqual(off.requests, ['/offline.html']); assert.deepEqual(off.external, []); passed('The final generated standalone supports the redesigned country workflow and WASD with zero network assets'); await off.context.close();
    } else report.offlineSkipped = true;
    assert.deepEqual(report.browserErrors, []); report.passed = true;
  } finally { fs.writeFileSync(path.join(output, 'map-workshop-ui-v2.11-browser-report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
}
main().catch(error => { report.passed = false; report.failure = error.stack || String(error); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'map-workshop-ui-v2.11-browser-report.json'), JSON.stringify(report, null, 2) + '\n'); console.error(error); process.exitCode = 1; });
