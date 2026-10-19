'use strict';
/* This function is embedded in the generated browser registry. Keep it self-contained. */
module.exports = function createMapRegistry(root, manifest, nodeRequire, nodeDirectory) {
  'use strict';
  const entries = new Map(manifest.templates.map(item => [item.id, item]));
  const assets = new Map(manifest.assets.map(item => [item.path, item]));
  const loaded = new Map(), assetCache = new Map(), pending = new Map(), assetPending = new Map();
  const scriptUrl = root.document && root.document.currentScript && root.document.currentScript.src;
  const browserBase = scriptUrl || (root.location && root.location.href);
  const timeoutMs = 20000;
  function fail(message) { throw new Error('지도를 불러오지 못했습니다: ' + message); }
  function checkTemplate(template, id) {
    if (!template || typeof template !== 'object' || template.id !== id || !Array.isArray(template.provinces) || !Array.isArray(template.countries)) fail('지도 형식이 올바르지 않습니다.');
    if (!Number.isFinite(template.width) || template.width <= 0 || !Number.isFinite(template.height) || template.height <= 0) fail('지도 크기가 올바르지 않습니다.');
    const expected = entries.get(id);
    if (expected && template.provinces.length !== expected.provinceCount) fail('지도 지역 개수가 맞지 않습니다.');
    const countryIds = new Set();
    for (const country of template.countries) {
      if (!country || typeof country.id !== 'string' || !country.id || countryIds.has(country.id)) fail('국가 목록이 올바르지 않습니다.');
      countryIds.add(country.id);
    }
    const provinceIds = new Set();
    for (const province of template.provinces) {
      if (!province || typeof province.id !== 'string' || !province.id || provinceIds.has(province.id) || typeof province.path !== 'string' || !province.path || !Number.isFinite(province.cx) || !Number.isFinite(province.cy) || !countryIds.has(province.owner)) fail('지역 정보가 올바르지 않습니다.');
      provinceIds.add(province.id);
    }
    return template;
  }
  function checkAsset(path, value) {
    const expected = assets.get(path);
    if (!expected || !value || typeof value !== 'object') fail('등록되지 않은 지도 파일입니다.');
    if (expected.type === 'base') {
      if (value.format !== 'hc-map-base-v1') fail('기본 지도 파일 형식이 올바르지 않습니다.');
      checkTemplate(value.template, expected.id);
    } else {
      if (value.format !== 'hc-map-era-v1' || value.id !== expected.id || value.baseId !== expected.baseId || !value.metadata || value.metadata.id !== value.id || !Array.isArray(value.metadata.countries) || !Array.isArray(value.changes)) fail('시대 지도 파일 형식이 올바르지 않습니다.');
      if ('provinces' in value.metadata || 'landPath' in value.metadata || 'waterPath' in value.metadata || 'riversPath' in value.metadata) fail('시대 지도 파일에 잘못된 항목이 있습니다.');
    }
    return value;
  }
  function applyPatch(base, patch) {
    const provinces = base.provinces.slice(), seen = new Set();
    for (const change of patch.changes) {
      if (!Array.isArray(change) || change.length !== 3 || !Number.isInteger(change[0]) || change[0] < 0 || change[0] >= provinces.length || seen.has(change[0]) || !change[1] || typeof change[1] !== 'object' || Array.isArray(change[1]) || !Array.isArray(change[2])) fail('시대별 지역 변경 정보가 올바르지 않습니다.');
      seen.add(change[0]);
      const out = Object.assign({}, provinces[change[0]]);
      for (const key of Object.keys(change[1])) {
        if (!['owner', 'influence', 'cx', 'cy', 'bbox'].includes(key)) fail('지원하지 않는 지역 변경 항목입니다.');
        out[key] = change[1][key];
      }
      for (const key of change[2]) {
        if (key !== 'influence') fail('지원하지 않는 지역 삭제 항목입니다.');
        delete out[key];
      }
      provinces[change[0]] = out;
    }
    return checkTemplate(Object.assign({}, base, patch.metadata, {provinces}), patch.id);
  }
  function checkIndex(descriptor, index) {
    if (!index || index.format !== 'hc-map-chunks-v1' || index.id !== descriptor.id || index.type !== descriptor.type || index.contentBytes !== descriptor.contentBytes || index.contentSha256 !== descriptor.contentSha256 || JSON.stringify(index.parts) !== JSON.stringify(descriptor.parts)) fail('지도 조각 목록이 올바르지 않습니다.');
    return index;
  }
  function parseBody(body) {
    try { return JSON.parse(body); } catch (_) { fail('지도 파일이 손상되었습니다.'); }
  }
  function utf8(body) {
    if (typeof root.TextEncoder === 'function') return new root.TextEncoder().encode(body);
    const encoded = unescape(encodeURIComponent(body)), bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    return bytes;
  }
  async function checkBody(descriptor, body) {
    const bytes = utf8(body);
    if (bytes.length !== descriptor.bytes) fail('지도 파일 크기가 맞지 않습니다.');
    if (root.crypto && root.crypto.subtle) {
      const hash = Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== descriptor.sha256) fail('지도 파일이 손상되었습니다.');
    }
    return body;
  }
  function syncAsset(path) {
    if (assetCache.has(path)) return assetCache.get(path);
    if (!nodeRequire) return null;
    const fs = nodeRequire('node:fs'), nodePath = nodeRequire('node:path'), crypto = nodeRequire('node:crypto');
    const descriptor = assets.get(path); if (!descriptor) fail('알 수 없는 지도 파일입니다.');
    function read(file) {
      const bytes = fs.readFileSync(nodePath.join(nodeDirectory, file.path));
      if (bytes.length !== file.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) fail('지도 파일이 손상되었습니다.');
      return bytes.toString('utf8');
    }
    let body = read(descriptor);
    if (descriptor.parts) {
      checkIndex(descriptor, parseBody(body));
      body = descriptor.parts.map(read).join('');
      if (Buffer.byteLength(body, 'utf8') !== descriptor.contentBytes || crypto.createHash('sha256').update(body).digest('hex') !== descriptor.contentSha256) fail('지도 조각이 손상되었습니다.');
    }
    const value = checkAsset(path, parseBody(body));
    assetCache.set(path, value); return value;
  }
  function get(id) {
    if (loaded.has(id)) return loaded.get(id);
    const entry = entries.get(id); if (!entry) return null;
    const value = syncAsset(entry.asset); if (!value) return null;
    const template = entry.baseId ? (() => { const base = get(entry.baseId); return base && applyPatch(base, value); })() : value.template;
    if (template) loaded.set(id, template);
    return template || null;
  }
  async function loadAsset(path) {
    if (assetCache.has(path)) return assetCache.get(path);
    if (assetPending.has(path)) return assetPending.get(path);
    const descriptor = assets.get(path); if (!descriptor) fail('알 수 없는 지도 파일입니다.');
    const operation = (async () => {
      if (nodeRequire) return syncAsset(path);
      if (typeof root.fetch !== 'function') fail('이 브라우저에서 지도 파일을 내려받을 수 없습니다.');
      const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
      let timer;
      try {
        const request = (async () => {
          async function read(file) {
            const response = await root.fetch(new URL(file.path, browserBase).href, {signal: controller ? controller.signal : undefined, credentials: 'same-origin'});
            if (!response.ok) fail('지도 파일 응답 오류 (' + response.status + ').');
            const size = Number(response.headers && response.headers.get('content-length'));
            if (size && size > file.bytes + 1024) fail('지도 파일 크기가 예상보다 큽니다.');
            const body = await response.text();
            if (body.length > file.bytes + 1024) fail('지도 파일 크기가 예상보다 큽니다.');
            return checkBody(file, body);
          }
          let body = await read(descriptor);
          if (descriptor.parts) {
            checkIndex(descriptor, parseBody(body));
            const pieces = new Array(descriptor.parts.length);
            let cursor = 0;
            // Bound simultaneous downloads; preserve the original byte order.
            async function worker() {
              while (cursor < descriptor.parts.length) {
                const index = cursor++;
                pieces[index] = await read(descriptor.parts[index]);
              }
            }
            await Promise.all(Array.from({length:Math.min(3, pieces.length)}, worker));
            body = pieces.join('');
            await checkBody({bytes:descriptor.contentBytes,sha256:descriptor.contentSha256}, body);
          }
          return checkAsset(path, parseBody(body));
        })();
        const deadline = new Promise((_, reject) => { timer = root.setTimeout(() => { if (controller) controller.abort(); reject(new Error('지도 다운로드 시간이 초과되었습니다. 다시 시도해 주세요.')); }, timeoutMs); });
        const value = await Promise.race([request, deadline]);
        assetCache.set(path, value); return value;
      } catch (error) { if (controller) controller.abort(); throw error; }
      finally { if (timer !== undefined) root.clearTimeout(timer); }
    })();
    assetPending.set(path, operation);
    try { return await operation; } finally { assetPending.delete(path); }
  }
  function ensure(id) {
    if (loaded.has(id)) return Promise.resolve(loaded.get(id));
    const entry = entries.get(id); if (!entry) return Promise.reject(new Error('지원하지 않는 지도입니다: ' + String(id)));
    if (pending.has(id)) return pending.get(id);
    const operation = (async () => {
      try {
        const [value, base] = await Promise.all([loadAsset(entry.asset), entry.baseId ? ensure(entry.baseId) : Promise.resolve(null)]);
        const template = entry.baseId ? applyPatch(base, value) : value.template;
        loaded.set(id, template); return template;
      } catch (error) {
        // A valid base may remain cached, but a malformed era file must be retryable.
        assetCache.delete(entry.asset);
        throw error;
      }
    })();
    pending.set(id, operation);
    operation.then(() => pending.delete(id), () => pending.delete(id));
    return operation;
  }
  function ensureScenario(value) {
    const id = typeof value === 'string' ? value : value && value.map && value.map.templateId;
    return id ? ensure(id) : Promise.resolve(null);
  }
  function selection(id) {
    const entry = entries.get(id); return entry && entry.regionId ? {regionId: entry.regionId, eraId: entry.eraId} : null;
  }
  function list() { return manifest.templates.map(({asset, baseId, ...metadata}) => Object.assign({}, metadata)); }
  return {
    get, ensure, ensureScenario, list,
    has: id => entries.has(id) || loaded.has(id),
    isLoaded: id => loaded.has(id),
    register(template) { checkTemplate(template, template && template.id); loaded.set(template.id, template); return template; },
    installAssets(values) {
      const staged = Object.entries(values).map(([path, value]) => [path, checkAsset(path, value)]);
      for (const [path, value] of staged) assetCache.set(path, value);
    },
    assetInfo(id) {
      const entry = entries.get(id); if (!entry) return null;
      const paths = (entry.baseId ? [entries.get(entry.baseId).asset] : []).concat(entry.asset), files = [];
      for (const path of paths) { files.push(path); for (const part of assets.get(path).parts || []) files.push(part.path); }
      return {id, files:Array.from(new Set(files)), downloadBytes:entry.downloadBytes};
    },
    regions: () => manifest.regions.map(region => Object.assign({}, region)),
    eras: regionId => (manifest.eras[regionId] || []).map(era => Object.assign({}, era)),
    selection,
    regionalId(regionId, eraId) { const id = 'regional_' + regionId + '_' + eraId; return entries.has(id) ? id : null; }
  };
};
