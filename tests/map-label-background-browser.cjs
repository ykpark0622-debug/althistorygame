'use strict';
// Exercise real SVG hit testing and measured text in Chrome. Files and map
// geometry are served from this release only; no gallery or production state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '../../outputs');
const origin = 'https://label-background.test';
const report = { checks: [], browserErrors: [], screenshots: [], measurements: [], externalRequests: [], notes: [
  'Real Chrome SVG geometry and pointer hit testing; all program and map files are local.',
  'The label fixture changes names and label positions only; its province ownership and camera are checked independently.',
  'A separate screenshot uses the unmodified 1618 historical map at the problem zoom.'
] };
function pass(name, details) { report.checks.push({ name, passed: true, ...(details ? { details } : {}) }); console.log('PASS ' + name); }
const near = (actual, expected, tolerance = 0.65) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} must be within ${tolerance} of ${expected}`);
const camera = page => page.evaluate(() => MapView.getCamera(holder));
async function render(page, scale = 10, editing = true) {
  await page.evaluate(({ scale, editing }) => {
    MapView.dispose(holder);
    const cx = fixtureCenter[0], cy = fixtureCenter[1], w = fixtureTemplate.width, h = fixtureTemplate.height;
    scenario = structuredClone(originalScenario);
    const names = ['헤센 카셀 방백령 · 장문의 국명', 'Saxe-\"Weimar\" & Eisenach <Duchy>', '뮌스터 후국'];
    const offsets = [[-w * .17, -h * .15], [w * .15, 0], [-w * .11, h * .15]];
    for (const c of scenario.map.countries) c.labelPosition = null;
    ids.forEach((id, i) => { const c = scenario.map.countries.find(c => c.id === id); c.name = names[i]; c.labelPosition = [cx + offsets[i][0] / scale, cy + offsets[i][1] / scale]; });
    state = MapView.initialState(scenario); moves = []; selections = []; provinceClicks = [];
    initialOwners = JSON.stringify(state.map.owners); initialProvinceFills = '';
    selected = ids[0];
    options = { labelEditMode: editing, selectedLabelCountry: selected,
      initialCamera: { templateId: fixtureTemplate.id, scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale },
      onProvince: id => provinceClicks.push(id),
      onLabelSelect: id => { selected = id; selections.push(id); options.selectedLabelCountry = id; MapView.render(holder, scenario, state, options); },
      onLabelMove: (id, position) => { moves.push({ id, position }); scenario.map.countries.find(c => c.id === id).labelPosition = position; selected = id; options.selectedLabelCountry = id; MapView.render(holder, scenario, state, options); }
    };
    MapView.render(holder, scenario, state, options);
    initialProvinceFills = [...holder.querySelectorAll('[data-province]')].map(n => n.getAttribute('style')).join('|');
  }, { scale, editing });
  await page.waitForFunction(() => holder.querySelectorAll('[data-map-country-label]').length === 3);
}
async function measure(page) {
  return page.evaluate(() => [...holder.querySelectorAll('[data-map-country-label]')].map(text => {
    const id = text.dataset.mapCountryLabel, bg = [...holder.querySelectorAll('[data-map-label-background]')].find(n => n.dataset.mapLabelBackground === id);
    const frame = [...holder.querySelectorAll('[data-map-label-frame]')].find(n => n.dataset.mapLabelFrame === id);
    const box = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const style = getComputedStyle(text), bstyle = bg && getComputedStyle(bg), fstyle = frame && getComputedStyle(frame);
    let ancestryOpacity = 1; for (let n = text.parentElement; n && n !== holder; n = n.parentElement) ancestryOpacity *= Number(getComputedStyle(n).opacity);
    return { id, text: text.textContent, textBox: box(text), backgroundBox: bg && box(bg), opacity: Number(style.opacity), ancestryOpacity,
      backgroundOpacity: bstyle && Number(bstyle.opacity) * Number(bstyle.fillOpacity), backgroundFill: bstyle?.fill,
      frameBox: frame && box(frame), frameStroke: fstyle?.stroke, frameStrokeWidth: fstyle && Number.parseFloat(fstyle.strokeWidth),
      frameVectorEffect: fstyle?.vectorEffect, outline: style.outlineStyle, fontSize: Number.parseFloat(style.fontSize),
      textCTM: Math.hypot(text.getScreenCTM().a, text.getScreenCTM().b) };
  }));
}
function checkMeasurements(rows, hasSelection = true) {
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(row.backgroundBox, 'Every country label requires a background: ' + row.text);
    near(row.opacity * row.ancestryOpacity, 1, 0.001);
    near(row.backgroundOpacity, .78, .005);
    near(row.backgroundBox.x, row.textBox.x - 5);
    near(row.backgroundBox.y, row.textBox.y - 3);
    near(row.backgroundBox.width, row.textBox.width + 10);
    near(row.backgroundBox.height, row.textBox.height + 6);
    assert.equal(row.outline, 'none', 'A CSS outline must never scale with the SVG world');
    assert.ok(row.backgroundBox.height < 40, 'A label background must remain a small screen element');
    near(row.fontSize * row.textCTM, 11, .02);
    if (row.frameBox) { assert.equal(row.frameVectorEffect, 'non-scaling-stroke'); near(row.frameStrokeWidth, 1.2, .01); }
  }
  assert.equal(rows.filter(r => r.frameBox).length, hasSelection ? 1 : 0);
}
async function paddingPoint(page, id) {
  return page.evaluate(id => {
    const rect = [...holder.querySelectorAll('[data-map-label-background]')].find(n => n.dataset.mapLabelBackground === id).getBoundingClientRect();
    const x = rect.right - 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, hit: hit?.getAttribute('data-map-label-hit'), province: hit?.closest('[data-province]')?.dataset.province || null };
  }, id);
}
async function screenshot(page, name) {
  const file = path.join(out, 'label-background-v2.12.1-' + name + '.png');
  await page.locator('#map .map-viewport').screenshot({ path: file }); report.screenshots.push(file);
}
async function workshopIntegration(page) {
  await page.setViewportSize({ width: 1500, height: 1100 }); await page.goto(origin + '/index.html?home=1'); await page.evaluate(() => HistoryCrossroads.ready);
  const gameBefore = await page.evaluate(() => JSON.stringify({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== MapDocument.STORAGE_KEY)) }));
  const fixture = await page.evaluate(async () => {
    const doc = await (await fetch('/examples/gallery-atlas/05-thirty-years-war-1618.map.json')).json(), t = await MapTemplates.ensure(doc.map.templateId);
    const a = doc.map.countries.find(c => c.name === '바이에른 공국'), b = doc.map.countries.find(c => c.name === '프랑스 왕국');
    a.labelPosition = [t.width * .46, t.height * .52]; b.labelPosition = [t.width * .54, t.height * .52]; doc.map.playerCountry = a.id;
    window.__workshopFixture = { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } }; await MapMaker.open(doc); return __workshopFixture;
  });
  await page.waitForFunction(() => document.querySelector('#editor-dialog[open]') && document.querySelector('#editor-root [data-map-workspace-view] svg'));
  const scope = page.locator('#editor-root'), board = () => scope.locator('[data-map-workspace-view]');
  const chip = scope.locator('.map-ui-current strong'), save = async () => { await page.getByRole('button', { name: '지도 저장', exact: true }).click(); return page.evaluate(() => MapMaker.getStored()); };
  const cam = () => board().evaluate(node => MapView.getCamera(node));
  const chooseA = async () => { await page.getByLabel('국가 목록 검색', { exact: true }).fill(fixture.a.id); await scope.locator('[data-country-row="' + fixture.a.id + '"]').click(); assert.equal(await chip.textContent(), fixture.a.name); };
  const bPad = async () => board().locator('[data-map-label-background="' + fixture.b.id + '"]').evaluate(n => { const r = n.getBoundingClientRect(), x = r.right - 2, y = r.y + r.height / 2; return { x, y, hit: document.elementFromPoint(x, y)?.getAttribute('data-map-label-hit') }; });
  const position = doc => doc.map.countries.find(c => c.id === fixture.b.id).labelPosition;
  await page.getByRole('button', { name: '국명 위치', exact: true }).click(); await chooseA();
  for (let i = 0; i < 4; i++) await board().locator('[data-map-tool="in"]').click();
  const baseline = await save(), initialCamera = await cam();
  const bPoint = await bPad(); assert.equal(bPoint.hit, fixture.b.id); await page.mouse.click(bPoint.x, bPoint.y);
  assert.equal(await chip.textContent(), fixture.b.name); assert.equal(await board().locator('[data-map-label-frame]').getAttribute('data-map-label-frame'), fixture.b.id);
  assert.deepEqual(await cam(), initialCamera); assert.deepEqual((await save()).map.initial, baseline.map.initial);
  // Return to A and begin dragging B without selecting it first. The first
  // commit must take the editor's changedCountry branch; the second must use
  // its ordinary redraw branch and leave the recreated widget interactive.
  await chooseA();
  for (const [dx, dy] of [[38, 17], [-24, 15]]) {
    const before = await save(), beforeCam = await cam(), point = await bPad(); assert.equal(point.hit, fixture.b.id);
    const factor = await board().locator('svg').evaluate(n => Math.hypot(n.getScreenCTM().a, n.getScreenCTM().b));
    await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + dx, point.y + dy, { steps: 10 }); await page.mouse.up();
    const after = await save(); assert.equal(await chip.textContent(), fixture.b.name); assert.equal(await board().locator('[data-map-label-frame]').getAttribute('data-map-label-frame'), fixture.b.id);
    assert.notDeepEqual(position(after), position(before)); near(position(after)[0], position(before)[0] + dx / (factor * beforeCam.scale), .002); near(position(after)[1], position(before)[1] + dy / (factor * beforeCam.scale), .002);
    assert.deepEqual(after.map.initial, baseline.map.initial); assert.deepEqual(await cam(), beforeCam);
  }
  const beforeArrow = await save(), arrowCam = await cam(), factor = await board().locator('svg').evaluate(n => Math.hypot(n.getScreenCTM().a, n.getScreenCTM().b));
  await board().locator('[data-map-country-label="' + fixture.b.id + '"]').focus(); await page.keyboard.press('ArrowRight');
  const final = await save(); near(position(final)[0], position(beforeArrow)[0] + 1 / (factor * arrowCam.scale), .002); assert.deepEqual(final.map.initial, baseline.map.initial); assert.deepEqual(await cam(), initialCamera);
  await page.evaluate(() => {
    window.__labelDownloads = []; const blobs = new Map(), create = URL.createObjectURL.bind(URL), click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
    HTMLAnchorElement.prototype.click = function () { if (!this.hasAttribute('download')) return click.call(this); __labelDownloads.push({ name: this.download, blob: blobs.get(this.href) }); };
  });
  await page.getByRole('button', { name: '지도 JSON 내보내기', exact: true }).click();
  const exported = await page.evaluate(async () => ({ name: __labelDownloads[0].name, doc: JSON.parse(await __labelDownloads[0].blob.text()) }));
  assert.match(exported.name, /\.map\.json$/); assert.deepEqual(exported.doc, final);
  assert.equal(await page.evaluate(() => JSON.stringify({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== MapDocument.STORAGE_KEY)) })), gameBefore);
  const file = path.join(out, 'label-background-v2.12.1-workshop-integration.png'); await page.screenshot({ path: file, fullPage: true }); report.screenshots.push(file);
  report.workshop = { countries: fixture, initialCamera, savedLabelPosition: position(final), exportedName: exported.name, ownershipUnchanged: true, gameStateUnchanged: true };
  pass('Actual index and MapMaker synchronize a different clicked/dragged country, survive both editor redraw branches, save two moves plus an arrow nudge, and export matching JSON');
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); page.setDefaultTimeout(20000);
    page.on('pageerror', e => report.browserErrors.push(e.message));
    const harness = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/map-view.css"><style>body{margin:0;background:#f0efe7}#map{width:calc(100vw - 32px);max-width:1450px;margin:16px auto}.province-map{max-height:720px}#outside{margin:8px}</style><button id="outside">Outside map</button><div id="map"></div><script src="/map-templates.js"></script><script src="/map-view.js"></script><script src="/engine.js"></script><script src="/map-document.js"></script>';
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.externalRequests.push(url.href); return route.abort(); }
      if (url.pathname === '/fixture.html') return route.fulfill({ contentType: 'text/html', body: harness });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' }[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
    });
    await page.goto(origin + '/fixture.html');
    await page.evaluate(async () => {
      window.holder = document.getElementById('map');
      const doc = await (await fetch('/examples/gallery-atlas/05-thirty-years-war-1618.map.json')).json();
      window.fixtureTemplate = await MapTemplates.ensure(doc.map.templateId);
      window.originalScenario = MapDocument.toScenario(doc);
      window.fixtureCenter = [(10.3 + 180) * 6 - (fixtureTemplate.offsetX || 0), (90 - 50.9) * 6 - (fixtureTemplate.offsetY || 0)];
      window.ids = doc.map.countries.filter(c => Object.values(doc.map.initial.owners).includes(c.id)).slice(0, 3).map(c => c.id);
      window.scenario = null; window.state = null; window.options = null; window.moves = []; window.selections = []; window.provinceClicks = []; window.selected = null;
    });

    // The unmodified historical screenshot uses all its actual country names.
    await page.evaluate(() => {
      const t = fixtureTemplate, [x, y] = fixtureCenter;
      MapView.render(holder, originalScenario, null, { labelEditMode: true, initialCamera: { templateId: t.id, scale: 10, x: t.width / 2 - x * 10, y: t.height / 2 - y * 10 } });
    });
    const historical = await page.evaluate(() => ({ names: holder.querySelectorAll('[data-map-country-label]').length, backgrounds: holder.querySelectorAll('[data-map-label-background]').length, badOutlines: [...holder.querySelectorAll('[data-map-country-label]')].filter(n => getComputedStyle(n).outlineStyle !== 'none').length }));
    assert.ok(historical.names > 8, 'Zoomed Germany must contain many real historical labels'); assert.equal(historical.backgrounds, historical.names); assert.equal(historical.badOutlines, 0);
    await page.locator('#map [data-map-country-label]').first().focus(); assert.equal(await page.locator('#map [data-map-label-frame]').count(), 1);
    await screenshot(page, 'germany-1618'); pass('Actual Germany 1618 at 1000% has backgrounds without expanding CSS outlines', historical);

    for (const scale of [1, 10, 40]) {
      await render(page, scale, true); const rows = await measure(page); checkMeasurements(rows); report.measurements.push({ scale, rows });
      const named = await page.evaluate(() => ids); assert.equal(rows.find(r => r.id === named[0]).text, '헤센 카셀 방백령 · 장문의 국명'); assert.equal(rows.find(r => r.id === named[1]).text, 'Saxe-"Weimar" & Eisenach <Duchy>');
      assert.equal(await page.locator('#map [data-map-labels] script, #map [data-map-labels] duchy').count(), 0);
      await screenshot(page, 'zoom-' + scale);
    }
    pass('At 100%, 1000%, and 4000%, measured Korean and escaped Latin text fits fixed 5px/3px padding and one 1.2px frame');

    await render(page, 10, true); const fixtureIds = await page.evaluate(() => ids);
    await page.locator('[data-map-country-label="' + fixtureIds[1] + '"]').focus();
    assert.equal(await page.locator('[data-map-label-frame]').getAttribute('data-map-label-frame'), fixtureIds[1]);
    const pad = await paddingPoint(page, fixtureIds[2]); assert.equal(pad.hit, fixtureIds[2]);
    await page.mouse.click(pad.x, pad.y); assert.equal(await page.locator('[data-map-label-frame]').getAttribute('data-map-label-frame'), fixtureIds[2]);
    assert.equal(await page.evaluate(() => selections.at(-1)), fixtureIds[2]);
    pass('Focusing or clicking a label background selects only that label; padding is a real hit region');

    const beforePan = await camera(page); await page.locator('#map svg').focus(); await page.keyboard.down('KeyD');
    await page.waitForFunction(x => MapView.getCamera(holder).x < x, beforePan.x); await page.keyboard.up('KeyD');
    const beforeCamera = await camera(page), before = await page.evaluate(id => scenario.map.countries.find(c => c.id === id).labelPosition, fixtureIds[2]);
    const ctm = await page.locator('#map svg').evaluate(n => Math.hypot(n.getScreenCTM().a, n.getScreenCTM().b));
    const dragStart = await paddingPoint(page, fixtureIds[2]);
    await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down(); await page.mouse.move(dragStart.x + 64, dragStart.y + 24, { steps: 12 }); await page.mouse.up();
    const moved = await page.evaluate(() => moves.at(-1)); assert.equal(moved.id, fixtureIds[2]);
    near(moved.position[0], before[0] + 64 / (ctm * beforeCamera.scale), .015); near(moved.position[1], before[1] + 24 / (ctm * beforeCamera.scale), .015);
    assert.deepEqual(await camera(page), beforeCamera);
    assert.equal(await page.evaluate(() => JSON.stringify(state.map.owners)), await page.evaluate(() => initialOwners));
    assert.equal(await page.evaluate(() => [...holder.querySelectorAll('[data-province]')].map(n => n.getAttribute('style')).join('|')), await page.evaluate(() => initialProvinceFills));
    pass('Dragging a padded label at zoomed, offset camera saves crop-local coordinates without changing ownership or camera');

    await page.locator('[data-map-country-label="' + fixtureIds[2] + '"]').focus(); const oldX = moved.position[0];
    await page.keyboard.press('ArrowRight'); const nudged = await page.evaluate(() => moves.at(-1));
    near(nudged.position[0], oldX + 1 / (ctm * beforeCamera.scale), .005); assert.equal(await page.locator('[data-map-label-frame]').count(), 1);
    pass('Arrow-key adjustment preserves fixed screen step, selected frame, and zoomed label location');

    for (const width of [430, 840, 1500]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(80);
      const rows = await measure(page); checkMeasurements(rows); report.measurements.push({ width, rows });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    pass('Responsive resizing recalculates measured backgrounds and retains one fixed-size selection frame');

    await page.evaluate(() => { scenario.map.countries.find(c => c.id === ids[0]).labelPosition = null; MapView.render(holder, scenario, state, options); });
    assert.equal(await page.locator('[data-map-country-label="' + fixtureIds[0] + '"]').count(), 0); assert.equal(await page.locator('[data-map-label-background="' + fixtureIds[0] + '"]').count(), 0);
    await page.evaluate(() => { const c = scenario.map.countries.find(c => c.id === ids[1]); c.name += ' · 확대 후 이름 수정'; MapView.render(holder, scenario, state, options); });
    const live = await measure(page); assert.ok(live.find(r => r.id === fixtureIds[1]).text.endsWith('확대 후 이름 수정'));
    for (const row of live) near(row.backgroundBox.width, row.textBox.width + 10);
    assert.equal(await page.locator('[data-map-label-background]').count(), await page.locator('[data-map-country-label]').count());
    await page.evaluate(() => { delete scenario.map.countries.find(c => c.id === ids[0]).labelPosition; MapView.render(holder, scenario, state, options); });
    assert.equal(await page.locator('[data-map-label-background]').count(), await page.locator('[data-map-country-label]').count());
    pass('Hiding, renaming, and returning to automatic placement leave no stale background or selection nodes');

    await render(page, 10, false); checkMeasurements(await measure(page), false);
    const normalHit = await page.evaluate(() => {
      for (const bg of holder.querySelectorAll('[data-map-label-background]')) {
        const r = bg.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, n = document.elementFromPoint(x, y), id = n?.closest('[data-province]')?.dataset.province;
        if (id) return { x, y, id };
      }
      return null;
    });
    assert.ok(normalHit, 'A normal label must allow inspection of an underlying province'); await page.mouse.click(normalHit.x, normalHit.y);
    assert.equal(await page.evaluate(() => provinceClicks.at(-1)), normalHit.id); assert.equal(await page.evaluate(() => moves.length), 0); assert.equal(await page.locator('[data-map-label-frame]').count(), 0);
    pass('Normal view retains translucent backgrounds while allowing province clicks through them and displaying no frame');

    await page.evaluate(() => { MapView.dispose(holder); holder.replaceChildren(); }); await page.setViewportSize({ width: 720, height: 900 }); await page.waitForTimeout(80);
    assert.equal(await page.locator('#map [data-map-label-background]').count(), 0); assert.equal(await camera(page), null);
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] });
    assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.externalRequests, []);
    pass('Cleanup detaches label rendering; all checks preserve storage and produce no browser errors or external requests');
    await workshopIntegration(page); assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.externalRequests, []);
    report.passed = true; await page.close();
  } finally { await browser.close(); }
}
main().catch(error => { report.passed = false; report.failure = error.stack; console.error(error); process.exitCode = 1; }).finally(() => {
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'label-background-v2.12.1-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
});
