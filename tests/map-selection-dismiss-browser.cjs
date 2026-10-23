'use strict';
// Real pointer hit testing: transient map highlights can be dismissed without
// changing editable territory, the working country or the map camera.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '../../outputs');
const origin = 'https://selection-dismiss.test';
const report = { checks: [], browserErrors: [], externalRequests: [], screenshots: [] };
function pass(name) { report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
const camera = page => page.evaluate(() => MapView.getCamera(holder));
const protectedFixture = page => page.evaluate(() => JSON.stringify({ scenario, state, fixture }));
async function localPoint(page, x, y, selector = '#map svg') {
  return page.locator(selector).evaluate((svg, point) => { const p = svg.createSVGPoint(); p.x = point.x; p.y = point.y; const s = p.matrixTransform(svg.getScreenCTM()); return { x: s.x, y: s.y }; }, { x, y });
}
async function seaClick(page) { const p = await localPoint(page, 850, 400); await page.mouse.click(p.x, p.y); }
async function fixture(page) {
  await page.goto(origin + '/fixture.html');
  await page.evaluate(() => {
    window.fixture = { id: 'dismiss_fixture', name: 'Dismiss selection fixture', width: 1000, height: 500,
      countries: [{ id: 'one', name: '첫 번째 나라', color: '#537bb5', focusBounds: [100, 100, 350, 350] }, { id: 'two', name: '두 번째 나라', color: '#bc6255', focusBounds: [450, 100, 650, 300] }],
      provinces: [{ id: 'p0', name: '선택 지역', owner: 'one', path: 'M100 100H350V350H100Z', cx: 225, cy: 225, bbox: [100, 100, 350, 350] }, { id: 'p1', name: '다른 지역', owner: 'two', path: 'M450 100H650V300H450Z', cx: 550, cy: 200, bbox: [450, 100, 650, 300] }] };
    window.MapTemplates = { get: () => fixture };
    window.scenario = { id: 'dismiss-test', map: { templateId: fixture.id, playerCountry: 'one', countries: [{ id: 'one', name: '첫 번째 나라', color: '#537bb5', labelPosition: [225, 180] }, { id: 'two', name: '두 번째 나라', color: '#bc6255', labelPosition: [550, 180] }], initial: {} } };
    window.holder = document.getElementById('map'); window.clicks = []; window.moves = []; window.strokes = [];
    window.options = { onProvince: id => clicks.push(id), onProvinceStroke: (ids, detail) => strokes.push({ ids, detail }),
      onLabelSelect: id => { options.selectedLabelCountry = id; MapView.render(holder, scenario, state, options); },
      onLabelMove: (id, position) => moves.push({ id, position }) };
    window.state = MapView.initialState(scenario); MapView.render(holder, scenario, state, options);
  });
}
async function rendererChecks(page) {
  await fixture(page);
  const before = await protectedFixture(page), initialCamera = await camera(page);
  await page.locator('[data-province="p0"]').click(); assert.equal(await page.locator('.map-province.selected').count(), 1); assert.equal(await page.locator('.map-label').count(), 1);
  await seaClick(page); assert.equal(await page.locator('.map-province.selected').count(), 0); assert.equal(await page.locator('.map-label').count(), 0); assert.equal(await page.locator('[data-map-region]').inputValue(), '');
  await page.evaluate(() => MapView.render(holder, scenario, state, options)); assert.equal(await page.locator('.map-province.selected').count(), 0); assert.equal(await page.locator('.map-label').count(), 0);
  assert.deepEqual(await camera(page), initialCamera); assert.equal(await protectedFixture(page), before);
  await page.locator('[data-province="p0"]').focus(); await page.keyboard.press('Enter'); await page.locator('#outside').click(); assert.equal(await page.locator('.map-province.selected').count(), 0); assert.equal(await page.locator('.map-province:focus').count(), 0);
  await page.locator('[data-province="p0"]').click(); assert.equal(await page.locator('.map-province.selected').count(), 1);
  pass('Player-style inspection clears province outline, focused outline, forced name and selection value on sea or outside blank, survives rerender, and permits another selection');
  // Map controls and drags are actions, not requests to dismiss a selection.
  await page.locator('[data-map-tool="in"]').click(); assert.equal(await page.locator('.map-province.selected').count(), 1);
  const sea = await localPoint(page, 850, 400), cam = await camera(page); await page.mouse.move(sea.x, sea.y); await page.mouse.down(); await page.mouse.move(sea.x - 40, sea.y - 20, { steps: 8 }); await page.mouse.up();
  assert.notDeepEqual(await camera(page), cam); assert.equal(await page.locator('.map-province.selected').count(), 1);
  await page.locator('[data-map-tool="reset"]').click(); await page.locator('[data-map-region]').focus(); assert.equal(await page.locator('.map-province.selected').count(), 1);
  pass('Zoom/reset and region-selection controls and sea panning retain the current inspection instead of treating gestures as blank clicks');
  await page.evaluate(() => { options = { ...options, labelEditMode: true, selectedLabelCountry: 'one' }; MapView.render(holder, scenario, state, options); });
  await page.locator('[data-map-country-label="one"]').click(); assert.equal(await page.locator('[data-map-label-frame]').count(), 1);
  await seaClick(page); assert.equal(await page.locator('[data-map-label-frame]').count(), 0); assert.equal(await page.locator('.map-province.selected').count(), 0); assert.equal(await page.locator('[data-map-country-label]').count(), 2); assert.equal(await page.locator('[data-map-label-background]').count(), 2);
  await page.evaluate(() => MapView.render(holder, scenario, state, options)); assert.equal(await page.locator('[data-map-label-frame]').count(), 0); assert.equal(await page.evaluate(() => options.selectedLabelCountry), 'one');
  await page.locator('[data-map-country-label="one"]').click(); assert.equal(await page.locator('[data-map-label-frame="one"]').count(), 1);
  await page.locator('#outside').click(); assert.equal(await page.locator('[data-map-label-frame]').count(), 0);
  await page.evaluate(() => { scenario.map.countries[0].color = '#123456'; state = MapView.initialState(scenario); MapView.render(holder, scenario, state, options); }); assert.equal(await page.locator('[data-map-label-frame]').count(), 0);
  await page.locator('[data-map-country-label="two"]').click(); assert.equal(await page.locator('[data-map-label-frame="two"]').count(), 1); assert.equal(await page.evaluate(() => options.selectedLabelCountry), 'two');
  pass('Country dismissal retains every translucent name background and working country, survives same-country/color redraws, and allows the same or a different name to be selected again');
  await page.evaluate(() => { options = { ...options, labelEditMode: true, labelPlacementCountry: 'one', selectedLabelCountry: 'one' }; MapView.render(holder, scenario, state, options); });
  await seaClick(page); assert.equal(await page.evaluate(() => moves.length), 1); const placed = await page.evaluate(() => moves[0]); assert.equal(placed.id, 'one'); assert.ok(Math.abs(placed.position[0] - 850) < .001 && Math.abs(placed.position[1] - 400) < .001);
  await page.evaluate(() => { options = { ...options, labelEditMode: false, labelPlacementCountry: null, interactionMode: 'select', selectedProvinces: ['p1'] }; MapView.render(holder, scenario, state, options); });
  await seaClick(page); assert.equal(await page.locator('[data-province="p1"].map-brush-selected').count(), 1); assert.equal(await page.evaluate(() => strokes.length), 0);
  await page.evaluate(() => { options.interactionMode = 'paint'; options.paintColor = '#112233'; MapView.render(holder, scenario, state, options); });
  await page.locator('[data-province="p0"]').click(); assert.equal(await page.evaluate(() => strokes.length), 1); assert.equal(await page.evaluate(() => strokes[0].detail.mode), 'paint'); assert.equal(await page.locator('[data-province="p1"].map-brush-selected').count(), 1);
  pass('Sea clicks still place a country name intentionally, and brush selections and paint callbacks keep their existing behavior');
  await page.evaluate(() => { MapView.dispose(holder); holder.replaceChildren(); }); await page.locator('#outside').click(); assert.equal(await camera(page), null);
  pass('Disposed maps remove document-level dismissal handlers without leaving errors or ghost selection state');
}
async function workshopChecks(page) {
  await page.goto(origin + '/index.html?home=1'); await page.evaluate(() => HistoryCrossroads.ready);
  const beforeGame = await page.evaluate(() => JSON.stringify({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== MapDocument.STORAGE_KEY)) }));
  await page.evaluate(async () => { const t = await MapTemplates.ensure('europe-balanced'); const doc = MapDocument.create({ id: 'dismiss_workshop', title: '강조 해제 실제 작업실 검사', templateId: t.id, playerCountry: 'fra' }); doc.map.countries=t.countries.map(c=>({id:c.id,name:c.name,color:c.color})); await MapMaker.open(doc); });
  await page.waitForFunction(() => document.querySelector('[data-map-workspace-view] svg'));
  const scope = page.locator('#editor-root'), preview = () => scope.locator('[data-map-workspace-view]'), cam = () => preview().evaluate(node => MapView.getCamera(node));
  if (await scope.locator('.map-ui-settings').evaluate(node => node.open)) await page.getByRole('button', { name: '지도 설정', exact: true }).click();
  await preview().scrollIntoViewIfNeeded();
  const save = async () => { await page.getByRole('button', { name: '지도 저장', exact: true }).click(); return page.evaluate(() => MapMaker.getStored()); };
  const baseline = await save();
  // Grid search yields a real coastline/ocean hit in the actual cropped SVG;
  // do not assume its template projection or country geometry.
  const ocean = async () => preview().locator('svg').evaluate(svg => { const b = svg.getBoundingClientRect(); for (const [fx, fy] of [[.92,.85],[.08,.85],[.82,.9],[.9,.6],[.08,.2],[.5,.9],[.65,.8]]) { const x=b.x+b.width*fx,y=b.y+b.height*fy,n=document.elementFromPoint(x,y); if(n && svg.contains(n) && !n.closest('[data-province],[data-map-country-label],[data-map-label-hit]')) return {x,y}; } throw new Error('No real ocean hit found in workshop fixture'); });
  await page.getByRole('button', { name: '이동', exact: true }).click(); await preview().scrollIntoViewIfNeeded();
  const land = await preview().locator('[data-province]').evaluateAll(nodes => { for (const n of nodes) { const b=n.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2; const hit=document.elementFromPoint(x,y); if(b.width>2 && b.height>2 && hit?.closest('[data-province]')===n) return {x,y}; } throw new Error('No visible land hit'); });
  await page.mouse.click(land.x, land.y); assert.equal(await preview().locator('.map-province.selected').count(), 1); const cameraBefore = await cam(), point = await ocean(); await page.mouse.click(point.x, point.y); assert.equal(await preview().locator('.map-province.selected').count(), 0); assert.equal(await preview().locator('.map-label').count(), 0); assert.deepEqual(await cam(), cameraBefore); assert.deepEqual(await save(), baseline);
  await page.getByRole('button', { name: '국명 위치', exact: true }).click(); await preview().scrollIntoViewIfNeeded();
  const label = preview().locator('[data-map-country-label]').first(); await label.click(); const activeCountry = await scope.locator('.map-ui-current strong').textContent(), cameraLabel = await cam(); assert.equal(await preview().locator('[data-map-label-frame]').count(), 1);
  const point2 = await ocean(); await page.mouse.click(point2.x, point2.y); assert.equal(await preview().locator('[data-map-label-frame]').count(), 0); assert.equal(await scope.locator('.map-ui-current strong').textContent(), activeCountry); assert.deepEqual(await cam(), cameraLabel); assert.deepEqual(await save(), baseline);
  const name = page.getByLabel('표시 이름', { exact: true }); const oldName = await name.inputValue(); await name.fill(oldName + ' 확인'); assert.equal(await preview().locator('[data-map-label-frame]').count(), 0); await name.fill(oldName); assert.equal(await preview().locator('[data-map-label-frame]').count(), 0);
  assert.deepEqual(await save(), baseline); await preview().scrollIntoViewIfNeeded();
  const file = path.join(output, 'selection-dismiss-v2.13.1-workshop.png'); await page.screenshot({ path: file }); report.screenshots.push(file);
  assert.equal(await page.evaluate(() => JSON.stringify({ scenario: HistoryCrossroads.getScenario(), state: HistoryCrossroads.getState(), storage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== MapDocument.STORAGE_KEY)) })), beforeGame);
  pass('The real map workshop dismisses province and country highlights while retaining working country, saved map, game saves and camera; name edits do not resurrect a dismissed frame');
}
async function main() {
  fs.mkdirSync(output, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }); page.setDefaultTimeout(25000); page.on('pageerror', error => report.browserErrors.push(error.message));
    await page.route('**/*', route => { const u=new URL(route.request().url()); if(u.origin!==origin){report.externalRequests.push(u.href);return route.abort();} if(u.pathname==='/fixture.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/map-view.css"><style>body{margin:0}#outside{height:45px;background:#eee;padding:10px}#map{width:1000px;margin:12px}.province-map{max-height:500px}</style><div id="outside">지도 바깥 빈 공간</div><div id="map"></div><script src="/map-view.js"></script>'}); if(u.pathname.startsWith('/_vercel/'))return route.fulfill({contentType:'text/javascript',body:''}); const file=path.resolve(root,'.'+u.pathname); if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''}); return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)}); });
    if (!process.argv.includes('--workshop-only')) await rendererChecks(page); await workshopChecks(page); assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.externalRequests, []); report.passed=true;
  } finally { fs.writeFileSync(path.join(output, 'selection-dismiss-v2.13.1-report.json'), JSON.stringify(report,null,2)+'\n'); await browser.close(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
