/* Portable, data-only maps. Geometry stays in the bundled template registry. */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'hc:workingMap:v1';
  const MAX_BYTES = 5 * 1024 * 1024;
  const reserved = new Set(['__proto__', 'prototype', 'constructor']);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const validId = value => typeof value === 'string' && value.length <= 100 && /^[a-z][a-z0-9_]*$/i.test(value) && !reserved.has(value.toLowerCase());
  const layers = ['owners', 'occupation', 'influence', 'markers'];

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function isMap(value) {
    if (!plain(value)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, 'type');
    return Boolean(descriptor && !descriptor.get && !descriptor.set && descriptor.value === 'map');
  }
  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes++;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }
  function getTemplate(id) {
    const registry = root.MapTemplates;
    return registry && typeof registry.get === 'function' ? registry.get(id) : null;
  }

  function validate(document) {
    const errors = [], warnings = [];
    const error = message => { if (errors.length < 100) errors.push(message); };
    if (!plain(document)) return { errors: ['지도는 JSON 객체여야 합니다.'], warnings };

    // Inspect before reading metadata or serializing. In addition to JSON imports,
    // this API is used directly by the editor and must not execute accessors.
    let nodes = 0;
    const ancestors = new Set();
    function inspect(value, depth) {
      if (++nodes > 400000) { error('지도 데이터 항목이 너무 많습니다.'); return; }
      if (depth > 12) { error('지도 데이터의 중첩이 너무 깊습니다.'); return; }
      if (value === null || typeof value !== 'object') {
        if (typeof value === 'number' && !Number.isFinite(value)) error('지도 숫자는 유한한 값이어야 합니다.');
        if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) error('지도에는 JSON으로 표현할 수 있는 값만 사용할 수 있습니다.');
        return;
      }
      if (!Array.isArray(value) && !plain(value)) { error('지도에는 일반 JSON 객체만 사용할 수 있습니다.'); return; }
      if (ancestors.has(value)) { error('지도 데이터에 순환 참조가 있습니다.'); return; }
      ancestors.add(value);
      if (Array.isArray(value) && (value.length > 400000 || Object.keys(value).length !== value.length || Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) {
        error('지도 배열에는 빈칸이나 추가 속성을 사용할 수 없습니다.');
        ancestors.delete(value);
        return;
      }
      if (Object.getOwnPropertySymbols(value).length) error('지도에 기호 속성을 사용할 수 없습니다.');
      for (const key of Object.getOwnPropertyNames(value)) {
        if (Array.isArray(value) && key === 'length') continue;
        if (!Object.getOwnPropertyDescriptor(value, key).enumerable) error('지도에 숨겨진 속성을 사용할 수 없습니다.');
      }
      for (const key of Object.keys(value)) {
        if (reserved.has(key.toLowerCase())) error('사용할 수 없는 지도 속성 이름입니다: ' + key);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor.get || descriptor.set) { error('지도에 접근자 속성을 사용할 수 없습니다.'); continue; }
        inspect(descriptor.value, depth + 1);
        if (nodes > 400000) break;
      }
      ancestors.delete(value);
    }
    inspect(document, 0);
    if (errors.length) return { errors, warnings };
    if (byteLength(JSON.stringify(document)) > MAX_BYTES) error('지도 JSON은 5MB 이하여야 합니다.');
    function keys(value, allowed, label) {
      for (const key of Object.keys(value)) if (!allowed.includes(key)) error(label + ': 지원하지 않는 속성입니다: ' + key);
    }
    function text(value, label, max, required = true) {
      if (typeof value !== 'string' || (required && !value.trim())) error(label + ': ' + (required ? '비어 있지 않은 ' : '') + '문자열이 필요합니다.');
      else if (value.length > max) error(label + ': ' + max.toLocaleString() + '자 이하여야 합니다.');
    }
    keys(document, ['type', 'schemaVersion', 'id', 'title', 'description', 'map'], '지도 문서');
    if (document.type !== 'map') error('type이 map인 지도 파일만 불러올 수 있습니다.');
    if (document.schemaVersion !== 1) error('지도 schemaVersion은 1이어야 합니다.');
    if (!validId(document.id)) error('지도 ID는 영문자로 시작하는 100자 이하 영문·숫자·밑줄이어야 합니다.');
    text(document.title, '지도 제목', 200);
    text(document.description, '지도 설명', 20000, false);
    if (!plain(document.map)) { error('map은 지도 설정 객체여야 합니다.'); return { errors, warnings }; }
    const map = document.map;
    keys(map, ['templateId', 'playerCountry', 'countries', 'initial'], '지도 설정');
    text(map.templateId, '지도 템플릿', 100);
    let template;
    try { template = getTemplate(map.templateId); } catch (_) { /* Invalid registry requests remain validation errors. */ }
    if (!template || !Array.isArray(template.provinces) || !Array.isArray(template.countries)) {
      error('지도 템플릿을 찾을 수 없습니다: ' + (typeof map.templateId === 'string' ? map.templateId : '(미지정)'));
      return { errors, warnings };
    }
    const countries = new Map(template.countries.map(country => [country.id, country]));
    if (map.countries !== undefined) {
      if (!Array.isArray(map.countries) || map.countries.length > 1000) error('지도 국가 설정은 1,000개 이하의 배열이어야 합니다.');
      else {
        const ids = new Set();
        map.countries.forEach((country, index) => {
          if (!plain(country)) { error('지도 국가 ' + (index + 1) + ': 객체가 필요합니다.'); return; }
          keys(country, ['id', 'name', 'color', 'focusBounds', 'available'], '지도 국가');
          if (!validId(country.id)) error('지도 국가 ID가 올바르지 않습니다.');
          else if (ids.has(country.id)) error('지도 국가 ID가 중복되었습니다: ' + country.id);
          else { ids.add(country.id); countries.set(country.id, Object.assign({}, countries.get(country.id), country)); }
          const merged = countries.get(country.id) || country;
          text(merged.name, '지도 국가 이름', 100);
          if (typeof merged.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(merged.color)) error('지도 국가 색상은 #RRGGBB 형식이어야 합니다.');
          if (own(country, 'available')) {
            if (typeof country.available !== 'boolean') error('국가 available은 참/거짓 값이어야 합니다.');
            else if (!warnings.includes('국가 목록의 자동 표시 정보는 저장하지 않습니다.')) warnings.push('국가 목록의 자동 표시 정보는 저장하지 않습니다.');
          }
          if (own(country, 'focusBounds')) {
            const bounds = country.focusBounds;
            if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
                !(bounds[0] >= 0 && bounds[1] >= 0 && bounds[0] < bounds[2] && bounds[1] < bounds[3] && bounds[2] <= template.width && bounds[3] <= template.height)) {
              error('국가 확대 범위는 지도 안의 [왼쪽, 위, 오른쪽, 아래] 좌표여야 합니다.');
            }
          }
        });
      }
    }
    if (!countries.has(map.playerCountry)) error('지도에서 기준 국가를 찾을 수 없습니다.');
    const provinces = new Set(template.provinces.map(province => province.id));
    if (map.initial !== undefined) {
      if (!plain(map.initial)) error('지도 초기 상태는 객체여야 합니다.');
      else for (const [layer, values] of Object.entries(map.initial)) {
        if (!layers.includes(layer) || !plain(values)) { error('지도 초기 레이어가 올바르지 않습니다: ' + layer); continue; }
        for (const [province, value] of Object.entries(values)) {
          if (!provinces.has(province)) error('지도에 없는 지역입니다: ' + province);
          if (layer === 'markers') { if (value !== null) text(value, '지도 표식', 300, false); }
          else if (!(layer !== 'owners' && value === null) && !countries.has(value)) error('지도에 없는 국가입니다: ' + JSON.stringify(value));
        }
      }
    }
    if (!errors.length) {
      if (!root.GameEngine || typeof root.GameEngine.validateScenario !== 'function' || typeof root.GameEngine.createBlankScenario !== 'function') error('지도 검사에 필요한 게임 엔진이 준비되지 않았습니다.');
      else {
        // The editor opens a blank scenario internally. Check the compact form
        // against its actual limits, so an accepted map can always be edited.
        const scenarioCheck = root.GameEngine.validateScenario(makeDraft(canonicalize(document, template)), { allowDraft: true });
        for (const message of scenarioCheck.errors) error('이 지도는 시나리오 편집기에 적용할 수 없습니다: ' + message);
      }
    }
    return { errors, warnings };
  }

  function normalize(document) {
    const checked = validate(document);
    if (checked.errors.length) {
      const problem = new Error(checked.errors.join('\n'));
      problem.errors = checked.errors;
      throw problem;
    }
    const template = getTemplate(document.map.templateId);
    return canonicalize(document, template);
  }

  function canonicalize(document, template) {
    const countryDefaults = new Map(template.countries.map(country => [country.id, country]));
    const provinceDefaults = new Map(template.provinces.map(province => [province.id, province]));
    const map = { templateId: document.map.templateId, playerCountry: document.map.playerCountry, countries: [], initial: {} };
    for (const country of document.map.countries || []) {
      const base = countryDefaults.get(country.id);
      const merged = Object.assign({}, base, country);
      const item = { id: country.id, name: merged.name, color: merged.color };
      const customFocus = own(country, 'focusBounds') && JSON.stringify(country.focusBounds) !== JSON.stringify(base && base.focusBounds);
      if (customFocus) item.focusBounds = country.focusBounds.slice();
      if (!base || item.name !== base.name || item.color !== base.color || customFocus) map.countries.push(item);
    }
    for (const layer of layers) {
      const result = {};
      for (const [province, value] of Object.entries(document.map.initial && document.map.initial[layer] || {})) {
        const base = provinceDefaults.get(province);
        const initialValue = layer === 'owners' ? base.owner : own(template.historicalInitial?.[layer],province) ? template.historicalInitial[layer][province] : layer === 'influence' && base.influence != null ? base.influence : null;
        if (value !== initialValue) result[province] = value;
      }
      map.initial[layer] = result;
    }
    return { type: 'map', schemaVersion: 1, id: document.id, title: document.title.trim(), description: document.description, map };
  }

  function makeDraft(document) {
    const scenario = root.GameEngine.createBlankScenario();
    Object.assign(scenario, { schemaVersion: 2, mode: 'chronicle', id: document.id, title: document.title, description: document.description, map: document.map });
    return scenario;
  }

  function create(options = {}) {
    if (!plain(options)) throw new Error('지도 생성 옵션은 객체여야 합니다.');
    const templateId = options.templateId || options.map && options.map.templateId || 'regional_eastasia_1592';
    const template = getTemplate(templateId);
    if (!template) throw new Error('지도 템플릿을 찾을 수 없습니다: ' + templateId);
    const represented = new Set(template.provinces.map(province => province.owner));
    const preferred = template.countries.find(country => represented.has(country.id) && country.id===template.defaultPlayerCountry) || template.countries.find(country => represented.has(country.id) && ['joseon', 'france', 'kor', 'fra'].includes(country.id)) || template.countries.find(country => represented.has(country.id));
    const map = options.map === undefined ? { templateId, playerCountry: options.playerCountry || preferred && preferred.id, countries: [], initial: {} } : options.map;
    return normalize({ type: 'map', schemaVersion: 1, id: options.id || 'map_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
      title: options.title === undefined ? '새 지도' : options.title, description: options.description === undefined ? '' : options.description, map });
  }

  function fromScenario(scenario, options = {}) {
    if (!plain(scenario) || scenario.schemaVersion !== 2 || !plain(scenario.map)) throw new Error('지도가 있는 V2 시나리오가 필요합니다.');
    if (!plain(options)) throw new Error('지도 변환 옵션은 객체여야 합니다.');
    return normalize({ type: 'map', schemaVersion: 1, id: options.id === undefined ? scenario.id : options.id,
      title: options.title === undefined ? scenario.title : options.title,
      description: options.description === undefined ? scenario.description === undefined ? '' : scenario.description : options.description,
      map: scenario.map });
  }

  function toScenario(document) {
    const normalized = normalize(document);
    return makeDraft(normalized);
  }

  const api = { STORAGE_KEY, MAX_BYTES, create, isMap, validate, normalize, fromScenario, toScenario, clone };
  root.MapDocument = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
