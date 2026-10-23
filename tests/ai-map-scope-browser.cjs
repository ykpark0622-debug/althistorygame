'use strict';
// Real browser coverage for the AI request's map catalog. Every map and page
// comes from this release; clipboard writes stay in memory, never an AI or DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..'), output = path.resolve(root, '../../outputs');
const origin = 'https://ai-map-scope.test';
const report = { checks: [], browserErrors: [], externalRequests: [], screenshots: [], notes: ['Local release and generated standalone only; no real AI or community writes.', 'The 300-ID prompt bound remains deliberate; the chosen template still determines the complete map scope.'] };
const pass = (name, details) => { report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS ' + name); };
const field = (page, name) => page.locator('[data-ai-field="' + name + '"]:visible');
const preview = page => page.locator('[data-ai-prompt]').last().inputValue();
async function settled(page) { await page.waitForFunction(() => [...document.querySelectorAll('[data-launch-action="ai-copy-prompt"]')].every(n => !n.disabled)); }
async function copied(page) { await page.locator('[data-launch-action="ai-copy-prompt"]:visible').click(); return page.evaluate(() => __copiedPrompt); }
async function setup(browser, offline = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage(), requests = [];
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.addInitScript(() => { window.__copiedPrompt = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) { window.__copiedPrompt = value; } } }); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); requests.push(url.pathname);
    if (url.origin !== origin) { report.externalRequests.push(url.href); return route.abort(); }
    if (offline) return url.pathname === '/offline.html' ? route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'standalone.html')) }) : route.abort();
    if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
  });
  await page.goto(origin + (offline ? '/offline.html?home=1' : '/index.html?home=1')); await page.evaluate(() => HistoryCrossroads.ready);
  await page.locator('[data-launch-action="mode-ai"]:visible').click();
  return { context, page, requests };
}
async function catalogChecks(page, requests, offline) {
  const expected = await page.evaluate(() => ({
    regions: MapTemplates.regions().map(r => ({ id: r.id, name: r.name, eras: ScenarioEditorV2.mapSetupEras(r.id).map(e => ({ id: e.id, name: e.name, templateId: ScenarioEditorV2.mapSetupTemplateId(r.id, e.id) })) })),
    legacy: MapTemplates.list().filter(t => !ScenarioEditorV2.mapSetupSelection(t.id)).map(t => t.id)
  }));
  assert.equal(expected.regions.length, 6); assert.equal(expected.regions.reduce((n, r) => n + r.eras.length, 0), 35); assert.equal(expected.legacy.length, 7);
  assert.deepEqual(await field(page, 'mapRegion').locator('option').evaluateAll(nodes => nodes.filter(n => n.value && n.value !== 'legacy').map(n => n.value)), expected.regions.map(r => r.id));
  if (!offline) assert.deepEqual(requests.filter(p => p.startsWith('/assets/maps/')), [], 'Opening the blank AI form must not fetch every map');
  for (const region of expected.regions) {
    await field(page, 'mapRegion').selectOption(region.id); await settled(page);
    const actual = await field(page, 'mapEra').locator('option').evaluateAll(nodes => nodes.map(n => ({ id: n.value, name: n.textContent })));
    assert.deepEqual(actual, region.eras.map(({ id, name }) => ({ id, name })), 'AI and workshop eras must agree for ' + region.id);
  }
  await field(page, 'mapRegion').selectOption('legacy'); await settled(page);
  assert.deepEqual(await field(page, 'mapTemplateId').locator('option').evaluateAll(nodes => nodes.map(n => n.value)), expected.legacy);
  pass((offline ? 'Offline' : 'Web') + ' AI selectors expose all six regions, all 35 workshop era choices and all seven compatibility maps');
  return expected;
}
async function choose(page, region, era, templateId, title) {
  await field(page, 'mapRegion').selectOption(region); await settled(page);
  await field(page, 'mapEra').selectOption(era); await settled(page);
  const prompt = await copied(page);
  assert.ok(prompt.includes('- templateId: ' + templateId + ' /'), title + ' must use the exact selected template');
  assert.ok(prompt.includes(title));
  const metadata = await page.evaluate(id => { const t = MapTemplates.get(id); return { path: t.provinces[0].path, countries: t.countries.map(c => c.id), provinces: t.provinces.map(p => p.id) }; }, templateId);
  assert.ok(!prompt.includes(metadata.path), 'The prompt must not contain SVG geometry');
  for (const [prefix, ids] of [['국가 목록: ', metadata.countries], ['지역 목록: ', metadata.provinces]]) {
    const line = prompt.split('\n').find(l => l.startsWith(prefix)); assert.ok(line, prefix);
    const values = JSON.parse(line.slice(prefix.length)); assert.ok(values.length > 0 && values.every(v => ids.includes(v.id)));
    if (prefix.startsWith('지역')) assert.ok(values.length <= 300);
  }
  assert.ok(prompt.includes('지도 범위:')); assert.ok(prompt.includes('시대 기본안:'));
  return prompt;
}
async function webChecks(browser) {
  const { page, context, requests } = await setup(browser);
  try {
    // A fresh, single choice is used to prove lazy geometry loading before the
    // complete catalog walk naturally caches several regions.
    await field(page, 'mapRegion').selectOption('eastasia'); await settled(page);
    const chosen = await field(page, 'mapEra').inputValue();
    const allowed = await page.evaluate(era => MapTemplates.assetInfo(ScenarioEditorV2.mapSetupTemplateId('eastasia', era)).files.map(f => '/' + f), chosen);
    assert.ok(requests.filter(p => p.startsWith('/assets/maps/')).every(p => allowed.includes(p)));
    pass('Opening the AI form fetches no geometry, and selecting one region fetches only that chosen map and its required base');
    // Preserve the pre-catalog request expectation on a separate fresh page.
    const pristine = await setup(browser); try { await catalogChecks(pristine.page, pristine.requests, false); } finally { await pristine.context.close(); }
    const balanced = await choose(page, 'world', 'balanced_modern', 'world-balanced', '세계');
    assert.match(balanced, /5,939|5939/);
    const warlords = await choose(page, 'eastasia', 'atlas_195', 'historical_atlas_warlords_195', '군웅할거');
    assert.ok(warlords.includes('[90,17,135,47]'), 'The smaller China/Korea crop must be explicit, rather than only the East Asia category');
    assert.match(warlords, /전체 지도는 2,887개 지역/); assert.match(warlords, /300개만/);
    assert.match(warlords, /참고 목록의 개수에 맞춰 지도를 자르거나 templateId를 바꾸지 마라/);
    await field(page, 'mode').selectOption('reign'); const reign = await copied(page); assert.match(reign, /mode:"reign"/);
    await choose(page, 'europe_med', 'atlas_1618', 'historical_atlas_thirty_years_1618', '30년');
    await choose(page, 'south_america', '1754', 'regional_south_america_1754', '남아메리카');
    pass('Copied prompts use the exact balanced, Chinese historical, European historical and detailed regional maps, with valid bounded IDs and both play modes');
    await field(page, 'mapRegion').selectOption('eastasia'); await settled(page); await field(page, 'mapEra').selectOption('atlas_195'); await settled(page);
    const shot = path.join(output, 'ai-map-scope-v2.13.3.png'); await page.locator('.ai-maker').screenshot({ path: shot }); report.screenshots.push(shot);
    // Delay a real ensure resolution to exercise the stale-request fence.
    await page.evaluate(() => { const original = MapTemplates.ensure; MapTemplates.ensure = function (id) { return id === 'historical_atlas_three_powers_214' ? original.call(this, id).then(t => new Promise(resolve => setTimeout(() => resolve(t), 250))) : original.call(this, id); }; });
    await field(page, 'mapEra').selectOption('atlas_214'); await field(page, 'mapEra').selectOption('balanced_modern'); await settled(page);
    assert.match(await copied(page), /templateId: balanced_eastasia_modern/); await page.waitForTimeout(400); assert.match(await preview(page), /templateId: balanced_eastasia_modern/);
    pass('Switching maps during an outstanding load never restores or copies the previous map scope');
    await page.evaluate(async () => {
      const id = 'historical_atlas_warlords_195'; await MapTemplates.ensure(id);
      const s = ScenarioAI.buildExample({ mapTemplateId: id }); s.id = 'ai_custom_preservation'; s.title = '사용자 편집 원고 유지';
      const t = MapTemplates.get(id), p = t.provinces[0];
      s.map.countries.push({ id: 'custom_scope', name: '사용자 편집 국가', color: '#123456', labelPosition: [22, 33] });
      s.map.initial.owners[p.id] = 'custom_scope'; s.map.initial.markers[p.id] = '사용자 지도 메모';
      await HistoryCrossroads.importScenario(s); window.__beforeAICustom = JSON.stringify(HistoryCrossroads.getScenario());
    });
    await page.locator('#open-scenario-button').click();
    if (await page.locator('#scenario-open-dialog [data-launch-action="mode-ai"]').getAttribute('aria-selected') !== 'true') await page.locator('#scenario-open-dialog [data-launch-action="mode-ai"]').click();
    await field(page, 'base').check(); await settled(page);
    assert.equal(await field(page, 'mapRegion').inputValue(), 'eastasia'); assert.equal(await field(page, 'mapEra').inputValue(), 'atlas_195');
    const customPrompt = await copied(page), base = JSON.parse(customPrompt.split('[현재 시나리오]\n')[1]);
    assert.equal(JSON.stringify(base), await page.evaluate(() => __beforeAICustom)); assert.equal(await page.evaluate(() => JSON.stringify(HistoryCrossroads.getScenario())), JSON.stringify(base));
    assert.equal(base.map.countries.find(c => c.id === 'custom_scope').labelPosition[0], 22);
    assert.ok(customPrompt.includes('사용자 편집 국가') && customPrompt.includes('사용자 지도 메모'));
    pass('Using the current scenario restores its historical region/era and preserves every custom country, label position, ownership, marker and manuscript field');
  } finally { await context.close(); }
}
async function offlineChecks(browser) {
  if (process.argv.includes('--web-only')) return;
  const { page, context, requests } = await setup(browser, true);
  try {
    await catalogChecks(page, requests, true);
    await choose(page, 'eastasia', 'atlas_bce246', 'historical_atlas_qin_246bce', '전국');
    await choose(page, 'north_america', 'balanced_modern', 'balanced_north_america_modern', '북아메리카');
    assert.deepEqual(requests, ['/offline.html']);
    pass('The generated standalone uses the same full map catalog and prompt metadata without any asset or external request');
  } finally { await context.close(); }
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.MAP_TEST_BROWSER || 'chrome', headless: true });
  try { await webChecks(browser); await offlineChecks(browser); assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.externalRequests, []); report.passed = true; }
  catch (error) { report.passed = false; report.error = error.stack; throw error; }
  finally { fs.writeFileSync(path.join(output, 'ai-map-scope-v2.13.3-report.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
