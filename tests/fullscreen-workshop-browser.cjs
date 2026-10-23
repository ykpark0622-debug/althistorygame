'use strict';
// Real Chrome presentation checks. All pages and geometry are served from the
// local release; no production gallery, authentication or save is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../../outputs');
const origin = 'https://fullscreen-workshop.test';
const report = { checks: [], browserErrors: [], externalRequests: [], screenshots: [], notes: [
  'Real Chrome; every program and map request is served from this local release.',
  'Native fullscreen and a denied/unsupported Fullscreen API fallback are tested separately.',
  'Presentation operations must preserve the scenario, game state, browser saves and URL.'
] };
function pass(name, details) { report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS ' + name); }
const state = page => page.evaluate(() => HistoryCrossroadsFullscreen.getState());
const camera = page => page.locator('[data-map-workspace-view]').evaluate(node => MapView.getCamera(node));
const protectedData = page => page.evaluate(() => JSON.stringify({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage)), url: location.href, history: history.length }));
const scrollers = ['.editor-content', '.map-ui-board', '.map-ui-sidebar', '.map-ui-country-list'];
const scrollState = page => page.evaluate(selectors => Object.fromEntries(selectors.map(selector => { const n = document.querySelector('#editor-root ' + selector); return [selector, { top: n.scrollTop, left: n.scrollLeft, max: n.scrollHeight - n.clientHeight }]; })), scrollers);
function near(actual, expected, tolerance = 2) { assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' must remain within ' + tolerance + ' of ' + expected); }
async function settled(page) { await page.waitForFunction(() => !HistoryCrossroadsFullscreen.getState().busy); await page.waitForTimeout(80); }
async function route(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1540, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  const requests = [], errors = [];
  page.on('pageerror', error => { errors.push(error.message); report.browserErrors.push(error.message); });
  if (options.fallback) await page.addInitScript(mode => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: mode === 'unsupported' ? undefined : function () { return Promise.reject(new DOMException('Fullscreen denied for local test', 'NotAllowedError')); } });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
  }, options.fallback);
  await page.route('**/*', handler => {
    const url = new URL(handler.request().url()); requests.push(url.pathname);
    if (url.origin !== origin) { report.externalRequests.push(url.href); return handler.abort(); }
    if (options.offline) return url.pathname === '/offline.html' ? handler.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'standalone.html')) }) : handler.abort();
    if (url.pathname.startsWith('/_vercel/')) return handler.fulfill({ contentType: 'text/javascript', body: '' });
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return handler.fulfill({ status: 404, body: '' });
    return handler.fulfill({ contentType: { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' }[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto(origin + (options.offline ? '/offline.html' : '/index.html?home=1')); await page.evaluate(() => HistoryCrossroads.ready);
  return { page, context, requests, errors };
}
async function openWorkshop(page) {
  await page.evaluate(async () => { await MapTemplates.ensure('europe-balanced'); const document = MapDocument.create({ id: 'fullscreen_ui_qa', title: '전체화면과 지도 설정 검사', templateId: 'europe-balanced', playerCountry: 'fra' }); await MapMaker.open(document); });
  await page.waitForFunction(() => document.querySelector('#editor-dialog[open]') && document.querySelector('[data-map-workspace-view] svg'));
}
async function assertFill(page) {
  const size = await page.locator('#editor-dialog').evaluate(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, vw: innerWidth, vh: innerHeight, bodyWidth: document.documentElement.scrollWidth }; });
  near(size.x, 0, 2); near(size.y, 0, 2); near(size.width, size.vw, 2); near(size.height, size.vh, 2); assert.ok(size.bodyWidth <= size.vw + 1);
  for (const selector of ['.editor-top', '.editor-footer']) {
    const b = await page.locator('#editor-root ' + selector).boundingBox(); assert.ok(b && b.y >= -1 && b.y + b.height <= size.vh + 1, selector + ' must stay inside the fullscreen viewport');
  }
  for (const name of ['지도 JSON 내보내기', '지도 저장', '닫기']) assert.equal(await page.getByRole('button', { name, exact: true }).last().isVisible(), true);
}
async function screenshot(page, suffix) { const file = path.join(output, 'fullscreen-workshop-v2.13-' + suffix + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); }
async function nativeWorkflow(page) {
  const before = await protectedData(page), main = page.locator('#app-fullscreen-button');
  await main.click(); await settled(page); assert.equal((await state(page)).pageFullscreen, true); assert.equal((await state(page)).pageMode, 'native'); assert.equal(await main.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !HistoryCrossroadsFullscreen.getState().pageFullscreen); assert.equal(await main.getAttribute('aria-pressed'), 'false');
  await main.click(); await settled(page); await main.click(); await settled(page); assert.equal((await state(page)).pageFullscreen, false); assert.equal(await protectedData(page), before);
  pass('The main fullscreen control enters real native fullscreen, exits through Escape or its button, and changes no scenario, saves, URL or history');
  await openWorkshop(page);
  assert.equal(await page.locator('.map-ui-settings').evaluate(node => node.open), true);
  assert.equal(await page.locator('.map-ui-board').evaluate(node => node.firstElementChild.classList.contains('map-ui-settings')), true);
  assert.equal(await page.getByLabel('지도 제목', { exact: true }).isVisible(), true); assert.equal(await page.getByLabel('① 사용할 지역 지도', { exact: true }).isVisible(), true); assert.equal(await page.getByLabel('② 시대 기본안', { exact: true }).isVisible(), true);
  assert.equal((await scrollState(page))['.map-ui-board'].top, 0);
  pass('A newly opened map workshop presents the expanded map settings and regional/era controls first');
  const workshop = page.locator('.hc-workshop-fullscreen-button'); await workshop.click(); await settled(page); assert.equal((await state(page)).workshopFullscreen, true); await assertFill(page); await screenshot(page, 'settings');
  // Collapsing settings uses a real control. It may reduce the scroll extent,
  // but must not focus an unrelated field or move to the document start.
  await page.locator('.map-ui-board').evaluate(node => { node.scrollTop = 12; });
  const summary = page.getByRole('button', { name: '지도 설정', exact: true });
  const scrollBefore = (await scrollState(page))['.map-ui-board'];
  await summary.click(); const scrollAfter = (await scrollState(page))['.map-ui-board']; near(scrollAfter.top, Math.min(scrollBefore.top, scrollAfter.max));
  assert.equal(await page.locator('.map-ui-settings').evaluate(node => node.open), false);
  await page.locator('[data-map-tool="in"]').first().click(); await page.locator('[data-map-tool="in"]').first().click();
  const svg = page.locator('[data-map-workspace-view] svg'); await svg.focus(); const cam = await camera(page); await page.keyboard.down('d'); await page.waitForTimeout(130); await page.keyboard.up('d'); const moved = await camera(page); assert.ok(moved.x < cam.x);
  await page.getByLabel('국가 목록 검색', { exact: true }).fill('프랑스');
  await page.locator('.map-ui-board').evaluate(node => { node.scrollTop = Math.min(140, node.scrollHeight - node.clientHeight); });
  await page.locator('.map-ui-sidebar').evaluate(node => { node.scrollTop = 40; });
  // Selection rebuilds the editor DOM; capture after pointer positioning so
  // normal browser scrolling needed to reach the control is not misreported.
  const row = page.locator('[data-country-row="fra"]'); await row.scrollIntoViewIfNeeded(); const rowBox = await row.boundingBox(); await page.mouse.move(rowBox.x + 15, rowBox.y + 15);
  const scroll1 = await scrollState(page), cam1 = await camera(page); await page.mouse.click(rowBox.x + 15, rowBox.y + 15);
  const scroll2 = await scrollState(page); for (const selector of scrollers) near(scroll2[selector].top, Math.min(scroll1[selector].top, scroll2[selector].max)); assert.deepEqual(await camera(page), cam1); assert.equal(await page.locator('.map-ui-settings').evaluate(node => node.open), false);
  await page.getByLabel('국가 목록 검색', { exact: true }).fill('독일'); assert.deepEqual(await camera(page), cam1);
  await page.getByRole('button', { name: '지도 설정', exact: true }).click();
  const era = page.getByLabel('② 시대 기본안', { exact: true }); await era.scrollIntoViewIfNeeded(); const eraBefore = await scrollState(page), eraCamera = await camera(page); await era.selectOption('1754');
  const eraAfter = await scrollState(page); for (const selector of scrollers) near(eraAfter[selector].top, Math.min(eraBefore[selector].top, eraAfter[selector].max)); assert.deepEqual(await camera(page), eraCamera);
  const center = page.getByRole('combobox', { name: '중심 국가', exact: true }); await center.click(); await page.getByLabel('중심 국가 검색', { exact: true }).fill('독일'); assert.equal(await page.locator('[role="option"][data-country-id="deu"]').isVisible(), true); await page.keyboard.press('Escape'); assert.equal((await state(page)).workshopFullscreen, true); assert.equal(await page.locator('#editor-dialog').evaluate(node => node.open), true);
  await page.getByRole('button', { name: '지도 설정', exact: true }).click(); await page.locator('[data-map-workspace-view]').scrollIntoViewIfNeeded();
  await screenshot(page, 'map'); await assertFill(page); assert.equal(await protectedData(page), before);
  pass('Workshop fullscreen fills the viewport with reachable header/footer, preserves settings state, map camera and scroll across UI rebuilds, and retains country search and WASD');
  await page.keyboard.press('Escape'); await settled(page); assert.equal((await state(page)).workshopFullscreen, false); assert.equal(await page.locator('#editor-dialog').evaluate(node => node.open), true);
  await workshop.click(); await settled(page); if (!await page.getByLabel('지도 제목', { exact: true }).isVisible()) await page.getByRole('button', { name: '지도 설정', exact: true }).click(); await page.getByLabel('지도 제목', { exact: true }).fill('아직 저장하지 않은 검사');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '닫기', exact: true }).last().click(); assert.equal(await page.locator('#editor-dialog').evaluate(node => node.open), true); assert.equal((await state(page)).workshopFullscreen, true);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '닫기', exact: true }).last().click(); await settled(page); assert.equal((await state(page)).workshopFullscreen, false); assert.equal(await protectedData(page), before);
  pass('Escape leaves the workshop open; cancelling the unsaved-close warning keeps fullscreen and edits, while confirmed closing exits cleanly');
  await main.click(); await settled(page); await openWorkshop(page); assert.equal((await state(page)).pageFullscreen, true); await page.locator('.hc-workshop-fullscreen-button').click(); await settled(page); await assertFill(page);
  await page.getByRole('button', { name: '닫기', exact: true }).last().click(); await settled(page); assert.equal((await state(page)).pageFullscreen, true); assert.equal((await state(page)).workshopFullscreen, false); await main.click(); await settled(page); assert.equal(await protectedData(page), before);
  pass('Opening and closing a fullscreen workshop from an already-fullscreen game restores the preceding game fullscreen mode');
}
async function fallbackWorkflow(page, mode) {
  const before = await protectedData(page); await page.locator('#app-fullscreen-button').click(); await settled(page); assert.equal((await state(page)).pageMode, 'expanded'); assert.ok(await page.locator('#hc-fullscreen-status').textContent());
  await page.keyboard.press('Escape'); await settled(page); assert.equal((await state(page)).pageFullscreen, false); await openWorkshop(page); await page.locator('.hc-workshop-fullscreen-button').click(); await settled(page); assert.equal((await state(page)).workshopFullscreen, true); assert.equal((await state(page)).workshopMode, 'expanded'); await assertFill(page);
  await page.locator('.hc-workshop-fullscreen-button').click(); await settled(page); assert.equal((await state(page)).workshopFullscreen, false); await page.getByRole('button', { name: '닫기', exact: true }).last().click(); assert.equal(await protectedData(page), before);
  pass('Fullscreen API ' + mode + ' falls back to viewport expansion with a clear notice and exits without changing data');
}
async function mobileWorkflow(page) {
  const before = await protectedData(page); await openWorkshop(page); await page.locator('.hc-workshop-fullscreen-button').click(); await settled(page); await assertFill(page);
  const bounds = await page.locator('#editor-root').evaluate(node => ({ width: node.scrollWidth, viewport: innerWidth })); assert.ok(bounds.width <= bounds.viewport + 1);
  for (const name of ['지도 제목', '① 사용할 지역 지도', '② 시대 기본안', '국가 목록 검색']) { const field = page.getByLabel(name, { exact: true }); await field.scrollIntoViewIfNeeded(); assert.equal(await field.isVisible(), true); }
  await page.getByRole('button', { name: '드래그 칠하기', exact: true }).scrollIntoViewIfNeeded(); assert.equal(await page.getByRole('button', { name: '드래그 칠하기', exact: true }).isVisible(), true);
  await screenshot(page, 'mobile'); await page.locator('.hc-workshop-fullscreen-button').click(); await settled(page); await page.getByRole('button', { name: '닫기', exact: true }).last().click(); assert.equal(await protectedData(page), before);
  pass('The fullscreen map workshop fits 390px screens and keeps settings, map tools, country search and footer actions reachable');
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const native = await route(browser); await nativeWorkflow(native.page); await native.context.close();
    for (const fallback of ['denied', 'unsupported']) { const f = await route(browser, { fallback }); await fallbackWorkflow(f.page, fallback); await f.context.close(); }
    const mobile = await route(browser, { mobile: true, fallback: 'unsupported' }); await mobileWorkflow(mobile.page); await mobile.context.close();
    if (!process.argv.includes('--web-only')) { const f = await route(browser, { offline: true, fallback: 'unsupported' }); await fallbackWorkflow(f.page, 'unsupported in the generated standalone'); assert.deepEqual(f.requests, ['/offline.html']); await f.context.close(); pass('The generated standalone retains fullscreen, fallback and settings-first editing with zero network assets'); }
    assert.deepEqual(report.externalRequests, []); assert.deepEqual(report.browserErrors, []); report.passed = true;
  } finally { fs.writeFileSync(path.join(output, 'fullscreen-workshop-v2.13-report.json'), JSON.stringify(report, null, 2) + '\n'); fs.mkdirSync(path.join(root, 'build-reports'), { recursive: true }); fs.writeFileSync(path.join(root, 'build-reports/fullscreen-v2.13.txt'), report.checks.map(c => 'PASS ' + c.name).join('\n') + '\n'); await browser.close(); }
}
main().catch(error => { report.passed = false; report.failure = error.stack || String(error); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'fullscreen-workshop-v2.13-report.json'), JSON.stringify(report, null, 2) + '\n'); console.error(error); process.exitCode = 1; });
