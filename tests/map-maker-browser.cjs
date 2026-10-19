'use strict';
// Isolated real-browser checks; no production services or game progress writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright'));
const base = path.resolve(__dirname, '..');
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="ko"><body><dialog id="editor-dialog" class="editor-dialog"><div id="editor-root"></div></dialog></body></html>' }));
    await page.goto('http://map-maker.test/index.html');
    for (const file of ['styles.css', 'map-view.css', 'map-maker.css']) await page.addStyleTag({ content: fs.readFileSync(path.join(base, file), 'utf8') });
    await page.evaluate(() => {
      const countries = [{ id: 'joseon', name: '조선', color: '#4477aa', focusBounds: [0, 0, 100, 100] }, { id: 'japan', name: '일본', color: '#aa6655', focusBounds: [120, 0, 220, 100] }];
      const template = { id: 'regional_eastasia_1592', name: '동아시아 · 1592년', regionId: 'eastasia', eraId: '1592', width: 240, height: 140, offsetX: 0, offsetY: 0, countries,
        provinces: [{ id: 'left', name: '한양', owner: 'joseon', path: 'M0,0h100v100h-100Z', cx: 50, cy: 50, bbox: [0, 0, 100, 100] }, { id: 'right', name: '규슈', owner: 'japan', path: 'M120,0h100v100h-100Z', cx: 170, cy: 50, bbox: [120, 0, 220, 100] }] };
      window.MapTemplates = { get: id => id === template.id ? template : null, list: () => [{ id: template.id, name: template.name, provinceCount: 2 }],
        regions: () => [{ id: 'eastasia', name: '동아시아', defaultEra: '1592' }], eras: () => [{ id: '1592', name: '1592년' }], regionalId: () => template.id,
        selection: id => id === template.id ? { regionId: 'eastasia', eraId: '1592' } : null };
      localStorage.setItem('history-crossroads:web:v1:scenario', '{"original":"active game"}');
      localStorage.setItem('history-crossroads:web:v1:autosave', '{"original":"progress"}');
    });
    for (const file of ['engine.js', 'map-view.js', 'map-document.js', 'editor.js', 'map-maker.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(base, file), 'utf8') });
    await page.evaluate(() => MapMaker.open());
    const editor = page.locator('#editor-root');
    const mapBox = await editor.locator('.map-maker-board svg').boundingBox();
    assert.ok(mapBox.y < 250 && mapBox.width > 700, 'Desktop map must be visible immediately beside its settings: ' + JSON.stringify(mapBox));
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMapBox = await editor.locator('.map-maker-board svg').boundingBox();
    assert.ok(mobileMapBox.y < 460 && mobileMapBox.width <= 390, 'Mobile map must follow compact metadata and fit the viewport: ' + JSON.stringify(mobileMapBox));
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await editor.locator('.editor-nav').count(), 0);
    assert.equal(await editor.getByRole('button', { name: '초안 저장', exact: true }).count(), 0);
    assert.equal(await editor.getByRole('button', { name: '적용하고 새 게임', exact: true }).count(), 0);
    await page.getByLabel('지도 제목', { exact: true }).fill('공유할 동아시아');
    await page.getByLabel('지도 설명', { exact: true }).fill('국경과 수도 표식을 수정한 지도');
    await editor.locator('[data-province="left"]').dispatchEvent('click');
    await page.getByLabel('시작 소유국', { exact: true }).selectOption('japan');
    await page.getByLabel('시작 표식', { exact: true }).fill('옛 수도');
    await page.getByRole('button', { name: '지도 저장', exact: true }).click();
    const saved = await page.evaluate(() => MapMaker.getStored());
    assert.equal(saved.type, 'map'); assert.equal(saved.title, '공유할 동아시아');
    assert.equal(saved.map.initial.owners.left, 'japan'); assert.equal(saved.map.initial.markers.left, '옛 수도');
    assert.equal(Object.hasOwn(saved, 'events'), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('history-crossroads:web:v1:scenario')), '{"original":"active game"}');
    assert.equal(await page.evaluate(() => localStorage.getItem('history-crossroads:web:v1:autosave')), '{"original":"progress"}');
    console.log('PASS map-only editor saves territory and annotations separately from the active scenario and progress');

    await page.getByLabel('지도 제목', { exact: true }).fill('');
    await page.getByRole('button', { name: '지도 저장', exact: true }).click();
    assert.match(await page.locator('#editor-report').innerText(), /지도 제목/);
    assert.deepEqual(await page.evaluate(() => MapMaker.getStored()), saved);
    await page.getByLabel('지도 제목', { exact: true }).fill(saved.title);
    await editor.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await page.waitForFunction(() => document.querySelector('#editor-report').textContent.includes('문법'));
    assert.equal(await page.getByLabel('지도 제목', { exact: true }).inputValue(), saved.title);
    assert.deepEqual(await page.evaluate(() => MapMaker.getStored()), saved);
    await editor.locator('input[type=file]').setInputFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, events: [] })) });
    await page.waitForFunction(() => document.querySelector('#editor-report').textContent.includes('map'));
    assert.equal(await editor.locator('.editor-nav').count(), 0);
    assert.deepEqual(await page.evaluate(() => MapMaker.getStored()), saved);
    console.log('PASS invalid title, malformed JSON and scenario files preserve the map and cannot expose story tabs');

    await page.evaluate(() => {
      window.mapDownloads = []; const blobs = new Map(), create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
      document.addEventListener('click', event => { const anchor = event.target.closest('a[download]'); if (!anchor) return; event.preventDefault(); window.mapDownloads.push({ name: anchor.download, blob: blobs.get(anchor.href) }); });
    });
    await page.getByRole('button', { name: '지도 JSON 내보내기', exact: true }).click();
    const download = await page.evaluate(async () => ({ name: mapDownloads[0].name, text: await mapDownloads[0].blob.text() }));
    const exported = JSON.parse(download.text);
    assert.deepEqual(exported, saved); assert.match(download.name, /\.map\.json$/);
    const imported = { ...saved, id: 'imported_map', title: '가져온 지도' };
    await editor.locator('input[type=file]').setInputFiles({ name: 'map.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => document.querySelector('[aria-label="지도 제목"]').value === '가져온 지도');
    await page.getByRole('button', { name: '지도 저장', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => MapMaker.getStored()), imported);
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.evaluate(() => MapMaker.open());
    assert.equal(await page.getByLabel('지도 제목', { exact: true }).inputValue(), imported.title);
    console.log('PASS data-only JSON export Blob generation/import round-trips and reopening resumes the saved map');

    await page.evaluate(() => MapMaker.configure({ onCreateScenario: scenario => { window.createdScenario = scenario; } }));
    await page.getByRole('button', { name: '이 지도로 시나리오 만들기', exact: true }).click();
    const created = await page.evaluate(() => createdScenario);
    assert.equal(created.draft, true); assert.equal(created.schemaVersion, 2); assert.equal(created.events.length, 0); assert.equal(created.endings.length, 0);
    assert.deepEqual(created.map, imported.map); assert.equal(await page.locator('#editor-dialog').evaluate(node => node.open), false);
    await page.evaluate(() => { window.appliedScenario = null; ScenarioEditor.open(GameEngine.createBlankScenario(), draft => { window.appliedScenario = draft; }); });
    assert.ok(await editor.getByRole('button', { name: '사건·선택지', exact: true }).isVisible());
    await editor.getByRole('button', { name: '초안 저장', exact: true }).click();
    assert.equal(await page.evaluate(() => appliedScenario.draft), true);
    console.log('PASS explicit map-to-scenario creates an empty draft and the ordinary scenario editor keeps its original tabs and save behavior');

    await page.evaluate(() => MapMaker.open());
    await page.getByLabel('지도 제목', { exact: true }).fill('공유 직전 저장');
    await page.getByRole('button', { name: '갤러리에 공유', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/gallery.html' && url.searchParams.get('kind') === 'map' && url.hash === '#upload');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hc:workingMap:v1')).title), '공유 직전 저장');
    assert.deepEqual(errors, []);
    console.log('PASS sharing saves the current map before opening the gallery upload form; runtime errors 0');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
