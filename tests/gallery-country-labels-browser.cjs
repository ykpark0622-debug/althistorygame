'use strict';
// Render the real gallery detail against a local, read-only Supabase double.
// No production account, database, network request or gallery write is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..'), out = path.resolve(root, '../../outputs');
const origin = 'https://gallery-country-labels.test';
const report = { checks: [], browserErrors: [], externalRequests: [], screenshots: [], notes: [
  'The actual gallery.html detail route uses the unmodified 195 CE map document and geometry.',
  'A separate synthetic map checks template countries without overrides or focus bounds, tiny and colliding realms, the old 90-label cap, hidden labels, and manual label positions.',
  'All requests are fulfilled locally; the mocked backend rejects all database writes.'
] };
const pass = (name, details) => { report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS ' + name); };
function mockBackend(input) {
  window.__writes = []; window.__queries = []; window.__galleryRecords = input.records;
  const client = {
    auth: { async getSession() { return { data: { session: null } }; }, onAuthStateChange() {} },
    async rpc() { return { data: false, error: null }; },
    from(table) {
      let rows = table === 'scenarios' ? input.records.slice() : [], one = false, start = 0, end = 10000;
      const q = {
        select() { return q; }, eq(field, value) { rows = rows.filter(row => row[field] === value); return q; },
        in(field, values) { rows = rows.filter(row => values.includes(row[field])); return q; },
        contains(field, values) { rows = rows.filter(row => values.every(v => row[field].includes(v))); return q; },
        order() { return q; }, or() { return q; }, range(a, b) { start = a; end = b + 1; return q; },
        single() { one = true; return q; }, maybeSingle() { one = true; return q; },
        insert() { __writes.push('insert'); throw Error('Unexpected gallery write'); },
        update() { __writes.push('update'); throw Error('Unexpected gallery write'); },
        delete() { __writes.push('delete'); throw Error('Unexpected gallery write'); },
        then(resolve) { __queries.push(table); return Promise.resolve({ data: one ? rows[0] || null : rows.slice(start, end), count: rows.length, error: null }).then(resolve); }
      }; return q;
    }
  };
  window.supabase = { createClient: () => client };
}
async function serve(page, records) {
  const harness = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/map-view.css"><style>body{margin:0;background:#efeee7}#map{margin:16px;max-width:1450px}.province-map{max-height:700px}</style><div id="map"></div><script src="/map-templates.js"></script><script src="/map-view.js"></script>';
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { report.externalRequests.push(url.href); return route.abort(); }
    if (url.pathname === '/fixture.html') return route.fulfill({ contentType: 'text/html', body: harness });
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.HC_COMMUNITY={supabaseUrl:"https://mock.invalid",supabaseKey:"public-test"};' });
    if (url.pathname === '/vendor/supabase.js') return route.fulfill({ contentType: 'text/javascript', body: '(' + mockBackend.toString() + ')(' + JSON.stringify({ records }) + ');' });
    if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
  });
}
async function shot(locator, file) { const target = path.join(out, file); await locator.screenshot({ path: target }); report.screenshots.push(target); }
async function galleryChecks(browser) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'examples/gallery-atlas/02-warlords-195.map.json')));
  const record = { id: '00000000-0000-4000-8000-000000000195', author_id: 'fixture', author_name: '지도 시험', title: doc.title,
    subtitle: '195년 기준', summary: '삼국지 시대 지도', tags: ['역사'], event_count: 0, ending_count: 0,
    like_count: 0, play_count: 0, report_count: 0, status: 'public', created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z',
    content_kind: 'map', schema_version: 1, mode: 'map', map_template_id: doc.map.templateId, data: doc };
  const page = await browser.newPage({ viewport: { width: 1540, height: 1280 } });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('hc:autosave', 'keep-autosave'); localStorage.setItem('hc:workingMap:v1', 'keep-map'); sessionStorage.setItem('hc:manual-save', 'keep-session'); });
  await serve(page, [record]); await page.goto(origin + '/gallery.html?kind=map');
  await page.locator('.g-card [data-act="open"]').click();
  const map = page.locator('#gallery-map-preview'); await map.locator('.province-map').waitFor();
  const snapshot = () => page.evaluate(() => ({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), records: JSON.stringify(__galleryRecords) }));
  const before = await snapshot();
  const expected = [...new Set(Object.values(doc.map.initial.owners))].filter(id => doc.map.countries.find(c => c.id === id)?.labelPosition !== null).sort();
  const actual = await map.locator('[data-map-country-label]').evaluateAll(nodes => nodes.map(n => n.dataset.mapCountryLabel).sort());
  assert.deepEqual(actual, expected, 'The gallery overview must not silently omit smaller warlords');
  assert.equal(await map.locator('[data-map-label-background]').count(), expected.length);
  const controls = map.locator('[data-map-tool="countries"]'), places = map.locator('[data-map-tool="labels"]');
  await controls.getAttribute('aria-label').then(value => { if (value) assert.match(value, /국명/); });
  assert.match(await controls.textContent(), /국명/); assert.equal(await controls.getAttribute('aria-pressed'), 'true');
  assert.equal(await places.getAttribute('aria-pressed'), 'false');
  const leaders = await map.locator('[data-map-label-leader]').count(); assert.ok(leaders > 0, 'Displaced automatic labels should retain their geographic anchor with a fine guide line');
  const blockedByToolbar = await map.evaluate(node => {
    const tool = node.querySelector('.map-toolbar').getBoundingClientRect();
    return [...node.querySelectorAll('[data-map-label-background]')].filter(n => { const b = n.getBoundingClientRect(); return Math.min(b.right, tool.right) - Math.max(b.left, tool.left) > 1 && Math.min(b.bottom, tool.bottom) - Math.max(b.top, tool.top) > 1; }).map(n => n.dataset.mapLabelBackground);
  });
  assert.deepEqual(blockedByToolbar, [], 'Automatic 195 CE country labels must avoid the gallery toolbar');
  await shot(map.locator('.map-viewport'), 'gallery-country-labels-v2.13.2-on.png');
  pass('The actual gallery detail shows all 46 owned states in the unmodified 195 CE map, with backgrounds and no toolbar obstruction', { expected: expected.length, actual: actual.length, leaders, blockedByToolbar });
  const camera = () => map.evaluate(node => MapView.getCamera(node));
  const fills = () => map.locator('[data-province]').evaluateAll(nodes => nodes.map(n => n.getAttribute('style')));
  const initialCamera = await camera(), initialFills = await fills();
  await controls.click(); assert.equal(await controls.getAttribute('aria-pressed'), 'false');
  assert.equal(await map.locator('[data-map-country-label],[data-map-label-background],[data-map-label-frame],[data-map-label-leader]').count(), 0);
  assert.equal(await places.getAttribute('aria-pressed'), 'false'); assert.deepEqual(await camera(), initialCamera); assert.deepEqual(await fills(), initialFills);
  await shot(map.locator('.map-viewport'), 'gallery-country-labels-v2.13.2-off.png');
  await controls.click(); assert.equal(await controls.getAttribute('aria-pressed'), 'true'); assert.deepEqual(await map.locator('[data-map-country-label]').evaluateAll(nodes => nodes.map(n => n.dataset.mapCountryLabel).sort()), expected); assert.equal(await map.locator('[data-map-label-leader]').count(), leaders);
  pass('The accessible country-name toggle hides/restores names and backgrounds without changing province-label state, ownership, camera, or colors');
  for (let i = 0; i < 5; i++) await map.locator('[data-map-tool="in"]').click();
  await places.click(); assert.equal(await places.getAttribute('aria-pressed'), 'true');
  const provinceLabels = await map.locator('.map-label').count(); assert.ok(provinceLabels > 0, 'Province labels must remain available after zoom');
  const zoomed = await camera(), countriesBefore = await map.locator('[data-map-country-label]').count(); assert.ok(countriesBefore > 0);
  await controls.click(); assert.equal(await places.getAttribute('aria-pressed'), 'true');
  assert.equal(await map.locator('[data-map-country-label]').count(), 0); assert.ok(await map.locator('.map-label').count() > 0); assert.deepEqual(await camera(), zoomed);
  await controls.click(); await places.click(); assert.equal(await controls.getAttribute('aria-pressed'), 'true'); assert.equal(await places.getAttribute('aria-pressed'), 'false');
  assert.equal(await map.locator('.map-label').count(), 0); assert.equal(await map.locator('[data-map-country-label]').count(), countriesBefore);
  await map.locator('[data-map-tool="reset"]').click(); assert.deepEqual(await camera(), initialCamera); assert.equal(await map.locator('[data-map-country-label]').count(), expected.length);
  assert.deepEqual(await fills(), initialFills); assert.deepEqual(await snapshot(), before); assert.deepEqual(await page.evaluate(() => __writes), []);
  pass('Country and province names toggle independently after zoom and reset; stored work and gallery records stay unchanged');
  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(100); assert.equal(await map.locator('[data-map-country-label]').count(), expected.length);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await controls.click(); assert.equal(await map.locator('[data-map-country-label]').count(), 0); await controls.click();
  assert.equal(await map.locator('[data-map-country-label]').count(), expected.length); assert.deepEqual(await snapshot(), before);
  await shot(map.locator('.map-viewport'), 'gallery-country-labels-v2.13.2-mobile.png');
  pass('430px gallery detail keeps all country names, responsive controls, and independent toggles');
  await page.close();
}
async function syntheticChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); page.on('pageerror', error => report.browserErrors.push(error.message));
  await serve(page, []); await page.goto(origin + '/fixture.html');
  await page.evaluate(() => {
    window.holder = document.getElementById('map');
    const countries = Array.from({ length: 100 }, (_, i) => ({ id: 'c' + i, name: '작은 제후국 ' + i, color: '#778c77', ...(i === 1 ? { labelPosition: null } : {}), ...(i === 2 ? { labelPosition: [120, 100] } : {}) }));
    countries.push({ id: 'empty', name: '영토 없는 나라', color: '#778c77' });
    const provinces = Array.from({ length: 100 }, (_, i) => { const x = 350 + i % 10 * 8, y = 190 + Math.floor(i / 10) * 8; return { id: 'p' + i, owner: 'c' + i, name: '작은 지역 ' + i, path: `M${x} ${y}h7v7h-7Z`, cx: x + 3.5, cy: y + 3.5, bbox: [x, y, x + 7, y + 7], area: 49 }; });
    window.template = MapTemplates.register({ id: 'country_label_minimal', name: '좁은 제후국 자동 국명 검사', width: 800, height: 480, countries, provinces });
    window.scenario = { id: 'country_label_no_overrides', map: { templateId: template.id, playerCountry: 'c0', countries: [], initial: {} } };
    window.state = MapView.initialState(scenario); window.original = JSON.stringify({ scenario, state, template });
    MapView.render(holder, scenario, state);
  });
  const map = page.locator('#map'), names = map.locator('[data-map-country-label]');
  assert.equal(await names.count(), 99, 'All tiny/colliding template states need labels without override/focusBounds, apart from explicitly hidden labels');
  assert.equal(await map.locator('[data-map-country-label="c1"]').count(), 0); assert.equal(await map.locator('[data-map-country-label="empty"]').count(), 0);
  assert.equal(await map.locator('[data-map-country-label="c2"]').getAttribute('x'), '120'); assert.equal(await map.locator('[data-map-country-label="c2"]').getAttribute('y'), '100');
  assert.equal(await map.locator('[data-map-label-background]').count(), 99);
  assert.equal(await page.evaluate(() => JSON.stringify({ scenario, state, template })), await page.evaluate(() => original));
  pass('All 99 eligible template countries survive tiny territories, collisions, and the old 90-name cap; explicit hidden/manual positions and empty countries are respected');
  await map.locator('[data-map-tool="countries"]').click(); await page.evaluate(() => MapView.render(holder, scenario, state));
  assert.equal(await names.count(), 0); assert.equal(await map.locator('[data-map-tool="countries"]').getAttribute('aria-pressed'), 'false');
  await map.locator('[data-map-tool="countries"]').click(); assert.equal(await names.count(), 99);
  await page.evaluate(() => { state.map.owners.p99 = 'c0'; MapView.render(holder, scenario, state); });
  assert.equal(await names.count(), 98); assert.equal(await map.locator('[data-map-country-label="c99"]').count(), 0);
  await page.evaluate(() => { state.map.owners.p99 = 'c99'; MapView.render(holder, scenario, state, { labelEditMode: true, selectedLabelCountry: 'c2' }); });
  assert.equal(await names.count(), 99); assert.equal(await map.locator('[data-map-label-frame="c2"]').count(), 1);
  await map.locator('[data-map-tool="countries"]').click(); assert.equal(await map.locator('[data-map-country-label],[data-map-label-background],[data-map-label-frame],[data-map-label-leader]').count(), 0);
  await map.locator('[data-map-tool="countries"]').click(); assert.equal(await names.count(), 99); assert.equal(await map.locator('[data-map-label-frame="c2"]').count(), 1);
  pass('The toggle survives ordinary rerenders, ownership changes remove stale country names, and edit mode frames hide/restore with names');
  await page.evaluate(() => MapView.dispose(holder)); await page.close();
}
async function offlineChecks(browser) {
  if (!process.argv.includes('--offline')) return;
  const page = await browser.newPage({ viewport: { width: 1540, height: 1000 } });
  page.on('pageerror', error => report.browserErrors.push(error.message)); await serve(page, []);
  await page.goto(origin + '/standalone.html?home=1'); await page.evaluate(() => HistoryCrossroads.ready);
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'examples/gallery-atlas/02-warlords-195.map.json')));
  const before = await page.evaluate(() => JSON.stringify({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), state: HistoryCrossroads.getState(), scenario: HistoryCrossroads.getScenario() }));
  await page.evaluate(async doc => {
    await MapTemplates.ensure(doc.map.templateId); const holder = document.createElement('div'); holder.id = 'offline-country-fixture';
    document.body.prepend(holder); MapView.render(holder, { id: doc.id, map: doc.map }, null); holder.scrollIntoView();
  }, doc);
  const map = page.locator('#offline-country-fixture'), names = map.locator('[data-map-country-label]');
  assert.equal(await names.count(), 46); const camera = await map.evaluate(n => MapView.getCamera(n));
  await map.locator('[data-map-tool="countries"]').click(); assert.equal(await map.locator('[data-map-country-label],[data-map-label-background],[data-map-label-leader]').count(), 0);
  assert.equal(await map.locator('[data-map-tool="labels"]').getAttribute('aria-pressed'), 'false');
  await map.locator('[data-map-tool="countries"]').click(); assert.equal(await names.count(), 46); assert.deepEqual(await map.evaluate(n => MapView.getCamera(n)), camera);
  assert.equal(await page.evaluate(() => JSON.stringify({ local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)), state: HistoryCrossroads.getState(), scenario: HistoryCrossroads.getScenario() })), before);
  await page.evaluate(() => { const node = document.getElementById('offline-country-fixture'); MapView.dispose(node); node.remove(); });
  pass('The generated offline program embeds the same 46-name layout and country toggle, without game/save changes or asset requests');
  await page.close();
}
async function worldPerformanceCheck(browser) {
  if (!process.argv.includes('--perf')) return;
  const page = await browser.newPage({ viewport: { width: 1540, height: 1000 } });
  page.on('pageerror', error => report.browserErrors.push(error.message)); await serve(page, []); await page.goto(origin + '/fixture.html');
  const result = await page.evaluate(async () => {
    const template = await MapTemplates.ensure('world-balanced'), holder = document.getElementById('map');
    const scenario = { id: 'world_country_perf', map: { templateId: template.id, countries: [], initial: {} } };
    const names = () => holder.querySelectorAll('[data-map-country-label]').length, durations = {}, expected = new Set(template.provinces.map(p => p.owner)).size;
    let start = performance.now(); MapView.render(holder, scenario, null); durations.initialRender = performance.now() - start; const first = names();
    start = performance.now(); holder.querySelector('[data-map-tool="countries"]').click(); durations.hide = performance.now() - start; const hidden = names();
    start = performance.now(); holder.querySelector('[data-map-tool="countries"]').click(); durations.show = performance.now() - start; const restored = names();
    start = performance.now(); holder.querySelector('[data-map-tool="in"]').click(); durations.zoom = performance.now() - start; const zoomed = names();
    MapView.dispose(holder); return { regions: template.provinces.length, expected, first, hidden, restored, zoomed, milliseconds: durations };
  });
  assert.equal(result.first, result.expected); assert.equal(result.restored, result.expected); assert.equal(result.hidden, 0); assert.ok(result.zoomed > 0);
  report.worldPerformance = result; pass('Actual 5,939-region balanced world renders all owned-country names and responds to toggles and zoom', result);
  await page.close();
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { await galleryChecks(browser); await syntheticChecks(browser); await offlineChecks(browser); await worldPerformanceCheck(browser); assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.externalRequests, []); report.passed = true; }
  finally { await browser.close(); }
})().catch(error => { report.passed = false; report.failure = error.stack; console.error(error); process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(out, 'gallery-country-labels-v2.13.2-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
});
