(function (root) {
  'use strict';

  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const reserved = new Set(['__proto__', 'prototype', 'constructor']);
  const validId = value => typeof value === 'string' && /^[a-z][a-z0-9_]*$/i.test(value) && !reserved.has(value.toLowerCase());
  const operators = new Set(['eq', 'ne', 'gte', 'lte', 'gt', 'lt']);
  const MAX_HISTORY = 5000;
  const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const LEGACY_SEED = 0x4c454741;
  let lastFreshSeed = null;

  function freshSeed() {
    let seed = root.crypto && typeof root.crypto.getRandomValues === 'function'
      ? root.crypto.getRandomValues(new Uint32Array(1))[0]
      : (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
    if (seed === lastFreshSeed) seed = (seed + 1) >>> 0;
    lastFreshSeed = seed;
    return seed;
  }

  // Mulberry32: the saved uint32 state is the sole source for gameplay rolls.
  // Changes to this algorithm would require a save-format migration.
  function rollPercent(state) {
    state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
    let value = state.rngState;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000 * 100;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizePlayerName(value) {
    if (value === undefined) return '집정관';
    if (typeof value !== 'string') throw new Error('이름은 문자열로 입력해 주세요.');
    if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) throw new Error('이름에 줄바꿈이나 제어문자를 사용할 수 없습니다.');
    const name = value.trim();
    if (!name) throw new Error('이름을 입력해 주세요.');
    if (Array.from(name).length > 24) throw new Error('이름은 24자 이내로 입력해 주세요.');
    return name;
  }

  function formatText(text, state) {
    const source = String(text === undefined || text === null ? '' : text);
    if (!state) return source;
    const name = normalizePlayerName(state.playerName);
    return source.replace(/\{\{name\}\}|\{name\}/g, () => name);
  }

  function createBlankScenario() {
    return {
      schemaVersion: 1, id: 'blank_scenario', title: '새 시나리오', subtitle: '', description: '',
      start: null, stats: [], flags: [], events: [], endings: [], randomEvents: [], defaultEnding: null, draft: true
    };
  }

  const v2 = scenario => scenario && scenario.schemaVersion === 2;
  const reignMode = scenario => v2(scenario) && scenario.mode === 'reign';
  const mapLayer = field => ({ owner: 'owners', occupation: 'occupation', influence: 'influence', marker: 'markers' })[field || 'owner'];
  function getMapConfig(scenario) {
    if (!v2(scenario) || !scenario.map) return null;
    const registry = root.MapTemplates;
    const template = registry && typeof registry.get === 'function' ? registry.get(scenario.map.templateId) : null;
    if (!template || !Array.isArray(template.provinces) || !Array.isArray(template.countries)) throw new Error('지도 템플릿을 찾을 수 없습니다: ' + (scenario.map.templateId || '(미지정)'));
    const countries = new Map(template.countries.map(country => [country.id, clone(country)]));
    for (const country of scenario.map.countries || []) if (country && typeof country.id === 'string') countries.set(country.id, Object.assign({}, countries.get(country.id), clone(country)));
    return Object.assign({}, template, { template, templateId: scenario.map.templateId, playerCountry: scenario.map.playerCountry, countries: Array.from(countries.values()), initial: scenario.map.initial || {} });
  }

  function createMapState(scenario) {
    const config = getMapConfig(scenario);
    if (!config) return null;
    const result = { owners: {}, occupation: {}, influence: {}, markers: {} };
    config.provinces.forEach(province => { result.owners[province.id] = province.owner; if (province.influence !== undefined && province.influence !== null) result.influence[province.id] = province.influence; });
    for (const layer of ['occupation', 'markers']) Object.assign(result[layer], config.template.historicalInitial?.[layer] || {});
    for (const layer of Object.keys(result)) for (const [province, value] of Object.entries(config.initial[layer] || {})) {
      if (layer !== 'owners' && value === null) delete result[layer][province];
      else result[layer][province] = value;
    }
    return result;
  }

  function applyTerritory(state, changes) {
    if (!changes || !state.map) return;
    for (const change of changes) {
      if (own(change, 'to')) state.map.owners[change.prov] = change.to;
      for (const [field, layer] of [['occupation', 'occupation'], ['influence', 'influence'], ['marker', 'markers']]) if (own(change, field)) {
        if (change[field] === null) delete state.map[layer][change.prov];
        else state.map[layer][change.prov] = change[field];
      }
    }
  }

  function validateScenario(scenario, options = {}) {
    const errors = [];
    const warnings = [];
    const error = message => { if (errors.length < 100) errors.push(message); };
    const show = value => typeof value === 'string' ? value : JSON.stringify(value);
    const itemName = (item, index) => typeof item.id === 'string' ? item.id : index + 1;
    if (!plain(scenario)) return { errors: ['시나리오는 JSON 객체여야 합니다.'], warnings };
    if (!plain(options)) return { errors: ['검사 옵션은 객체여야 합니다.'], warnings };
    const draft = options.allowDraft === true && scenario.draft === true;

    // Imports stay data only. Reject dangerous object keys and non-JSON structures
    // before using any user-provided identifier as an object property.
    let nodes = 0;
    const ancestors = new Set();
    function inspect(value, depth) {
      if (++nodes > 50000) { error('시나리오 데이터가 너무 큽니다.'); return; }
      if (depth > 25) { error('시나리오의 중첩이 너무 깊습니다.'); return; }
      if (typeof value === 'number' && !Number.isFinite(value)) error('숫자는 유한한 값이어야 합니다.');
      if (value === null || typeof value !== 'object') {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') error('시나리오에는 JSON으로 표현할 수 있는 값만 사용할 수 있습니다.');
        return;
      }
      if (!Array.isArray(value) && !plain(value)) { error('시나리오에는 일반 JSON 객체만 사용할 수 있습니다.'); return; }
      if (ancestors.has(value)) { error('시나리오 데이터에 순환 참조가 있습니다.'); return; }
      ancestors.add(value);
      for (const key of Object.keys(value)) {
        if (reserved.has(key.toLowerCase())) error(`사용할 수 없는 속성 이름입니다: ${key}`);
        inspect(value[key], depth + 1);
        if (nodes > 50000) break;
      }
      ancestors.delete(value);
    }
    inspect(scenario, 0);
    if (errors.length) return { errors, warnings };

    function textField(value, label, required = false, maxLength = 20000) {
      if (value === undefined && !required) return;
      if (typeof value !== 'string' || (required && !value.trim())) error(`${label}: ${required ? '비어 있지 않은 ' : ''}문자열이 필요합니다.`);
      else if (value.length > maxLength) error(`${label}: ${maxLength.toLocaleString()}자 이내로 작성해 주세요.`);
    }
    function collection(value, label, minimum, maximum) {
      if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
        error(`${label}: ${minimum}~${maximum}개의 항목으로 된 배열이 필요합니다.`);
        return [];
      }
      return value;
    }
    function ids(items, label) {
      const result = new Set();
      items.forEach((item, index) => {
        if (!plain(item)) { error(`${label} ${index + 1}: 객체가 필요합니다.`); return; }
        if (!validId(item.id)) error(`${label} ${index + 1}: ID는 영문자로 시작하는 영문·숫자·밑줄이어야 하며 예약어를 사용할 수 없습니다.`);
        else if (result.has(item.id)) error(`${label}: ID '${item.id}'가 중복되었습니다.`);
        else result.add(item.id);
      });
      return result;
    }

    if (scenario.schemaVersion !== 1 && scenario.schemaVersion !== 2) error('schemaVersion은 1 또는 2여야 합니다.');
    if (v2(scenario) && scenario.mode !== undefined && !['chronicle', 'reign'].includes(scenario.mode)) error('mode는 chronicle 또는 reign이어야 합니다.');
    if (!validId(scenario.id)) error('시나리오 ID가 올바르지 않습니다.');
    textField(scenario.title, '시나리오 제목', true, 200);
    textField(scenario.subtitle, '부제', false, 1000);
    textField(scenario.description, '시나리오 설명');
    if (own(scenario, 'draft') && typeof scenario.draft !== 'boolean') error('draft는 true 또는 false여야 합니다.');
    if (own(scenario, 'player')) {
      if (!plain(scenario.player)) error('player는 플레이어 설정 객체여야 합니다.');
      else {
        if (own(scenario.player, 'askName') && typeof scenario.player.askName !== 'boolean') error('player.askName은 true 또는 false여야 합니다.');
        textField(scenario.player.label, '이름 입력 제목', false, 100);
        textField(scenario.player.placeholder, '이름 입력 안내', false, 100);
        if (own(scenario.player, 'defaultName')) {
          try { normalizePlayerName(scenario.player.defaultName); } catch (nameError) { error(`기본 이름: ${nameError.message}`); }
        }
      }
    }

    const stats = collection(scenario.stats, '능력치', draft ? 0 : 1, 20);
    const flags = collection(scenario.flags, '기록', 0, 200);
    const events = collection(scenario.events, '사건', draft ? 0 : 1, 1000);
    const endings = collection(scenario.endings, '엔딩', draft ? 0 : 1, 100);
    const randomEvents = scenario.randomEvents === undefined ? [] : collection(scenario.randomEvents, '랜덤 사건 규칙', 0, 200);
    const statIds = ids(stats, '능력치');
    const flagIds = ids(flags, '기록');
    const eventIds = ids(events, '사건');
    const endingIds = ids(endings, '엔딩');
    ids(randomEvents, '랜덤 사건 규칙');
    for (const id of eventIds) if (id === 'END' || id === 'RETURN' || (v2(scenario) && id === 'REIGN')) error(`사건 ID '${id}'는 경로 예약어이므로 사용할 수 없습니다.`);

    if (!reignMode(scenario) && !(draft && events.length === 0 && scenario.start === null) && !eventIds.has(scenario.start)) error(`시작 사건 '${show(scenario.start)}'을 찾을 수 없습니다.`);
    if (!(draft && endings.length === 0 && scenario.defaultEnding === null) && !endingIds.has(scenario.defaultEnding)) error(`기본 엔딩 '${show(scenario.defaultEnding)}'을 찾을 수 없습니다.`);

    let mapConfig = null;
    const provinceIds = new Set(), countryIds = new Set();
    if (v2(scenario) && scenario.map !== undefined) {
      if (!plain(scenario.map)) error('map은 지도 설정 객체여야 합니다.');
      else {
        textField(scenario.map.templateId, '지도 템플릿', true, 100);
        if (scenario.map.countries !== undefined && !Array.isArray(scenario.map.countries)) error('지도 국가는 배열이어야 합니다.');
        else {
          if (scenario.map.countries) ids(scenario.map.countries, '지도 국가');
          try { mapConfig = getMapConfig(scenario); } catch (mapError) { error(mapError.message); }
        }
        if (mapConfig) {
          mapConfig.provinces.forEach(province => provinceIds.add(province.id));
          mapConfig.countries.forEach(country => {
            countryIds.add(country.id);
            if (!validId(country.id)) error('지도 국가 ID가 올바르지 않습니다: ' + country.id);
            textField(country.name, '지도 국가 이름', true, 100);
            if (typeof country.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(country.color)) error('지도 국가 색상은 #RRGGBB 형식이어야 합니다.');
          });
          if (!countryIds.has(scenario.map.playerCountry)) error('지도 플레이 국가를 찾을 수 없습니다.');
          if (scenario.map.initial !== undefined && !plain(scenario.map.initial)) error('지도 초기 상태는 객체여야 합니다.');
          else for (const [layer, values] of Object.entries(scenario.map.initial || {})) {
            if (!['owners', 'occupation', 'influence', 'markers'].includes(layer) || !plain(values)) { error('지도 초기 레이어가 올바르지 않습니다: ' + layer); continue; }
            for (const [province, value] of Object.entries(values)) {
              if (!provinceIds.has(province)) error('지도에 없는 지역입니다: ' + province);
              if (layer === 'markers') { if (value !== null) textField(value, '지도 표식', false, 300); }
              else if (!(layer !== 'owners' && value === null) && !countryIds.has(value)) error('지도에 없는 국가입니다: ' + show(value));
            }
          }
        }
      }
    }

    function territory(value, label) {
      if (value === undefined) return;
      if (!Array.isArray(value) || value.length > 1000) { error(label + ': 영토 효과는 1,000개 이하 배열이어야 합니다.'); return; }
      if (!value.length) return;
      if (!mapConfig) { error(label + ': 영토 효과에는 V2 지도 설정이 필요합니다.'); return; }
      value.forEach(change => {
        if (!plain(change)) { error(label + ': 영토 효과 객체가 필요합니다.'); return; }
        if (!provinceIds.has(change.prov)) error(label + ': 지도에 없는 지역입니다: ' + show(change.prov));
        for (const field of ['to', 'occupation', 'influence']) if (own(change, field) && !(field !== 'to' && change[field] === null) && !countryIds.has(change[field])) error(label + ': 지도에 없는 국가입니다: ' + show(change[field]));
        if (own(change, 'marker') && change.marker !== null) textField(change.marker, label + ' 표식', false, 300);
      });
    }

    stats.forEach((stat, index) => {
      if (!plain(stat)) return;
      const label = `능력치 ${itemName(stat, index)}`;
      textField(stat.name, `${label} 이름`, true, 100);
      textField(stat.description, `${label} 설명`, false, 1000);
      if (!finite(stat.min) || !finite(stat.max) || stat.min >= stat.max) error(`${label}: 최소·최대는 유한한 숫자이며 최소 < 최대여야 합니다.`);
      if (!finite(stat.initial) || stat.initial < stat.min || stat.initial > stat.max) error(`${label}: 초기값은 최소~최대 사이의 숫자여야 합니다.`);
      if (stat.color !== undefined && (typeof stat.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(stat.color))) error(`${label}: 색상은 #RRGGBB 형식이어야 합니다.`);
    });
    flags.forEach((flag, index) => {
      if (!plain(flag)) return;
      textField(flag.name, `기록 ${itemName(flag, index)} 이름`, true, 100);
      if (typeof flag.initial !== 'boolean') error(`기록 ${itemName(flag, index)}: 초기값은 true 또는 false여야 합니다.`);
    });

    function conditions(value, label) {
      if (value === undefined) return;
      if (!Array.isArray(value) || value.length > 100) { error(`${label}: 조건은 100개 이하의 배열이어야 합니다.`); return; }
      value.forEach((condition, index) => {
        const place = `${label} ${index + 1}`;
        if (!plain(condition)) { error(`${place}: 조건 객체가 필요합니다.`); return; }
        if (!operators.has(condition.op)) error(`${place}: 비교 연산자가 올바르지 않습니다.`);
        if (condition.kind === 'stat') {
          if (!statIds.has(condition.key)) error(`${place}: 능력치 '${show(condition.key)}'가 없습니다.`);
          if (!finite(condition.value)) error(`${place}: 능력치 비교값은 유한한 숫자여야 합니다.`);
        } else if (condition.kind === 'flag') {
          if (!flagIds.has(condition.key)) error(`${place}: 기록 '${show(condition.key)}'이 없습니다.`);
          if (typeof condition.value !== 'boolean') error(`${place}: 기록 비교값은 true 또는 false여야 합니다.`);
          if (condition.op !== 'eq' && condition.op !== 'ne') error(`${place}: 기록 비교에는 eq 또는 ne를 사용해 주세요.`);
        } else if (condition.kind === 'territory' && v2(scenario)) {
          if (!mapConfig || !provinceIds.has(condition.key)) error(`${place}: 지도 지역을 찾을 수 없습니다.`);
          if (!mapLayer(condition.field)) error(`${place}: 영토 조건의 field가 올바르지 않습니다.`);
          if (!['eq', 'ne'].includes(condition.op)) error(`${place}: 영토 비교에는 eq 또는 ne를 사용해 주세요.`);
          if (condition.field === 'marker') { if (condition.value !== null) textField(condition.value, place + ' 표식', false, 300); }
          else if (condition.value !== null && !countryIds.has(condition.value)) error(`${place}: 지도 국가를 찾을 수 없습니다.`);
        } else error(`${place}: 조건 종류는 stat 또는 flag${v2(scenario) ? ', territory' : ''}여야 합니다.`);
      });
    }
    function next(value, label) {
      if (value !== 'END' && value !== 'RETURN' && !eventIds.has(value)) error(`${label}: 다음 사건 '${show(value)}'을 찾을 수 없습니다.`);
    }

    events.forEach((event, eventIndex) => {
      if (!plain(event)) return;
      const label = `사건 ${itemName(event, eventIndex)}`;
      textField(event.title, `${label} 제목`, true, 300);
      textField(event.body, `${label} 본문`, true);
      ['chapter', 'date', 'speaker'].forEach(field => textField(event[field], `${label} ${field}`, false, 300));
      conditions(event.when, `${label} 등장 조건`);
      next(event.next, `${label} 기본 경로`);
      const choices = collection(event.choices, `${label} 선택지`, 1, 20);
      choices.forEach((choice, index) => {
        const place = `${label} 선택지 ${index + 1}`;
        if (!plain(choice)) { error(`${place}: 객체가 필요합니다.`); return; }
        textField(choice.text, `${place} 내용`, true, 1000);
        textField(choice.description, `${place} 설명`, false, 2000);
        conditions(choice.when, `${place} 조건`);
        if (choice.next !== undefined) next(choice.next, place);
        if (v2(scenario)) {
          territory(choice.territory, place);
          textField(choice.result, place + ' 결과');
          if (own(choice, 'historical') && typeof choice.historical !== 'boolean') error(place + ': historical은 true 또는 false여야 합니다.');
        }
        if (choice.effects !== undefined && !plain(choice.effects)) error(`${place}: effects는 능력치 변화 객체여야 합니다.`);
        else for (const [key, value] of Object.entries(choice.effects || {})) {
          if (!statIds.has(key)) error(`${place}: 능력치 '${key}'가 없습니다.`);
          if (!finite(value)) error(`${place}: 능력치 변화는 유한한 숫자여야 합니다.`);
        }
        if (choice.setFlags !== undefined && !plain(choice.setFlags)) error(`${place}: setFlags는 기록 변경 객체여야 합니다.`);
        else for (const [key, value] of Object.entries(choice.setFlags || {})) {
          if (!flagIds.has(key)) error(`${place}: 기록 '${key}'이 없습니다.`);
          if (typeof value !== 'boolean') error(`${place}: 기록 변경값은 true 또는 false여야 합니다.`);
        }
      });
      if (choices.length && !choices.some(choice => plain(choice) && (!choice.when || choice.when.length === 0))) warnings.push(`${label}: 조건 없는 선택지가 없습니다. 특정 상황에서 모든 선택지가 잠길 수 있습니다.`);
    });

    endings.forEach((ending, index) => {
      if (!plain(ending)) return;
      const label = `엔딩 ${itemName(ending, index)}`;
      textField(ending.title, `${label} 제목`, true, 300);
      textField(ending.summary, `${label} 요약`, false, 2000);
      textField(ending.body, `${label} 본문`, true);
      if (!['good', 'mixed', 'bad'].includes(ending.kind)) error(`${label}: 종류는 good, mixed, bad 중 하나여야 합니다.`);
      if (!finite(ending.priority)) error(`${label}: priority는 유한한 숫자여야 합니다.`);
      if (typeof ending.immediate !== 'boolean') error(`${label}: immediate는 true 또는 false여야 합니다.`);
      if (own(ending, 'chance')) {
        if (!finite(ending.chance) || ending.chance < 0 || ending.chance > 100) error(`${label}: chance는 0~100 사이의 유한한 숫자여야 합니다.`);
        if (ending.immediate !== true) error(`${label}: 확률은 즉시 엔딩(immediate: true)에만 설정할 수 있습니다.`);
      }
      conditions(ending.when, `${label} 조건`);
    });
    randomEvents.forEach((rule, index) => {
      if (!plain(rule)) return;
      const label = `랜덤 사건 규칙 ${itemName(rule, index)}`;
      textField(rule.title, `${label} 제목`, true, 300);
      if (!eventIds.has(rule.eventId)) error(`${label}: 대응 사건 '${show(rule.eventId)}'을 찾을 수 없습니다.`);
      conditions(rule.when, `${label} 조건`);
      if (!finite(rule.chance) || rule.chance < 0 || rule.chance > 100) error(`${label}: chance는 0~100 사이의 유한한 숫자여야 합니다.`);
      if (!finite(rule.priority)) error(`${label}: priority는 유한한 숫자여야 합니다.`);
      if (own(rule, 'once') && typeof rule.once !== 'boolean') error(`${label}: once는 true 또는 false여야 합니다.`);
      if (own(rule, 'cooldown') && (!Number.isSafeInteger(rule.cooldown) || rule.cooldown < 0)) error(`${label}: cooldown은 0 이상의 안전한 정수여야 합니다.`);
    });
    if (reignMode(scenario)) {
      if (!plain(scenario.reign)) { if (!draft) error('치세 모드에는 reign 설정이 필요합니다.'); }
      else {
        const parts = collection(scenario.reign.parts, '치세 부문', draft ? 0 : 1, 20);
        const turns = collection(scenario.reign.turns, '치세 턴', draft ? 0 : 1, 1000);
        const partIds = ids(parts, '치세 부문'); ids(turns, '치세 턴');
        parts.forEach(part => { if (!plain(part)) return; textField(part.name, '부문 이름', true, 100); if (part.color !== undefined && !/^#[0-9a-f]{6}$/i.test(part.color)) error('부문 색상은 #RRGGBB 형식이어야 합니다.'); });
        for (const turn of turns) {
          if (!plain(turn)) continue;
          textField(turn.title, '치세 턴 제목', true, 300); textField(turn.body, '치세 턴 본문'); textField(turn.date, '치세 턴 날짜', false, 300);
          if (!Array.isArray(turn.eventIds) || turn.eventIds.length > 1000) error('치세 턴 eventIds는 1,000개 이하 배열이어야 합니다.');
          else for (const id of turn.eventIds) { const event = events.find(item => item && item.id === id); if (!event || !partIds.has(event.part)) error('치세 턴의 사건 또는 부문을 찾을 수 없습니다: ' + show(id)); }
          for (const name of ['between', 'settlements']) {
            if (turn[name] === undefined) continue;
            const rules = collection(turn[name], '치세 규칙', 0, 1000); ids(rules, '치세 규칙');
            for (const rule of rules) {
              if (!plain(rule)) continue;
              textField(rule.text, '치세 규칙 결과', true); conditions(rule.when, '치세 규칙 조건'); territory(rule.territory, '치세 규칙');
              if (rule.effects !== undefined && !plain(rule.effects)) error('치세 규칙 effects는 객체여야 합니다.');
              else for (const [id, delta] of Object.entries(rule.effects || {})) if (!statIds.has(id) || !finite(delta)) error('치세 규칙의 수치 변화가 올바르지 않습니다: ' + id);
              if (rule.setFlags !== undefined && !plain(rule.setFlags)) error('치세 규칙 setFlags는 객체여야 합니다.');
              else for (const [id, value] of Object.entries(rule.setFlags || {})) if (!flagIds.has(id) || typeof value !== 'boolean') error('치세 규칙의 선택 기록이 올바르지 않습니다: ' + id);
            }
          }
        }
      }
    }
    const fallback = endings.find(ending => plain(ending) && ending.id === scenario.defaultEnding);
    if (fallback && (fallback.immediate !== false || (fallback.when && fallback.when.length !== 0))) error('기본 엔딩은 immediate: false이고 조건이 없는 엔딩이어야 합니다.');
    return { errors, warnings };
  }

  function testConditions(conditions, state) {
    if (conditions === undefined) return true;
    if (!Array.isArray(conditions) || !state) return false;
    return conditions.every(condition => {
      if (!plain(condition) || !operators.has(condition.op)) return false;
      if (condition.kind === 'territory') {
        const layer = mapLayer(condition.field);
        if (!state.map || !layer || !['eq', 'ne'].includes(condition.op)) return false;
        const actual = own(state.map[layer], condition.key) ? state.map[layer][condition.key] : null;
        return condition.op === 'eq' ? actual === condition.value : actual !== condition.value;
      }
      const group = condition.kind === 'stat' ? state.stats : condition.kind === 'flag' ? state.flags : null;
      if (!group || !own(group, condition.key)) return false;
      const actual = group[condition.key];
      if (typeof actual !== typeof condition.value) return false;
      switch (condition.op) {
        case 'eq': return actual === condition.value;
        case 'ne': return actual !== condition.value;
        case 'gte': return actual >= condition.value;
        case 'lte': return actual <= condition.value;
        case 'gt': return actual > condition.value;
        case 'lt': return actual < condition.value;
        default: return false;
      }
    });
  }

  function explainCondition(condition, scenario) {
    if (!condition) return '조건 정보가 없습니다.';
    if (condition.kind === 'territory') {
      let province = condition.key;
      try { province = getMapConfig(scenario)?.provinces.find(item => item.id === condition.key)?.name || province; } catch (_) {}
      return `${province} ${condition.field || 'owner'} ${condition.op === 'ne' ? '≠' : '='} ${condition.value === null ? '없음' : condition.value}`;
    }
    if (condition.kind === 'flag') {
      const flag = scenario.flags.find(item => item.id === condition.key);
      const expected = condition.op === 'ne' ? !condition.value : condition.value;
      return `${flag ? flag.name : condition.key}: ${expected ? '있음' : '없음'}`;
    }
    const stat = scenario.stats.find(item => item.id === condition.key);
    const labels = { eq: '일 때', ne: '아닐 때', gte: '이상', lte: '이하', gt: '초과', lt: '미만' };
    return `${stat ? stat.name : condition.key} ${condition.value} ${labels[condition.op] || ''}`.trim();
  }

  function getEvent(scenario, state) {
    if (!state || state.endingId || !state.eventId) return null;
    return scenario.events.find(event => event.id === state.eventId) || null;
  }

  function getChoices(scenario, state, eventId) {
    const event = eventId === undefined ? getEvent(scenario, state) : scenario.events.find(item => item.id === eventId);
    if (!event) return [];
    return event.choices.map((choice, index) => {
      const failed = (choice.when || []).filter(condition => !testConditions([condition], state));
      return { choice, index, enabled: failed.length === 0, reason: failed.map(condition => explainCondition(condition, scenario)).join(' · ') };
    });
  }

  function matchingEndings(scenario, state, immediate) {
    return scenario.endings
      .filter(ending => ending.id !== scenario.defaultEnding && ending.immediate === immediate && testConditions(ending.when, state))
      .sort((a, b) => b.priority - a.priority);
  }

  function getImmediateRisks(scenario, state) {
    if (!state || state.endingId) return [];
    return matchingEndings(scenario, state, true).filter(ending => finite(ending.chance) && ending.chance > 0 && ending.chance < 100);
  }

  function tryImmediateEndings(scenario, state, riskRolls) {
    for (const ending of matchingEndings(scenario, state, true)) {
      const chance = ending.chance === undefined ? 100 : ending.chance;
      const roll = chance > 0 && chance < 100 ? rollPercent(state) : null;
      const triggered = chance === 100 || (chance > 0 && roll < chance);
      riskRolls.push({ endingId: ending.id, chance, roll, triggered });
      if (triggered) return ending;
    }
    return null;
  }

  function getRandomEventRisks(scenario, state) {
    if (!state || state.endingId || state.activeRandomEventId) return [];
    return (scenario.randomEvents || []).filter(rule => {
      const target = scenario.events.find(event => event.id === rule.eventId);
      const count = (state.randomEventCounts || {})[rule.id] || 0;
      const last = (state.lastTriggerTurns || {})[rule.id];
      return target && testConditions(rule.when, state) && testConditions(target.when, state)
        && (rule.once === false || count === 0)
        && (last === undefined || last === null || state.turn - last > (rule.cooldown || 0));
    }).sort((a, b) => b.priority - a.priority);
  }

  function tryRandomEvents(scenario, state, eventRolls) {
    for (const rule of getRandomEventRisks(scenario, state)) {
      const chance = rule.chance;
      const roll = chance > 0 && chance < 100 ? rollPercent(state) : null;
      const triggered = chance === 100 || (chance > 0 && roll < chance);
      eventRolls.push({ randomEventId: rule.id, chance, roll, triggered });
      if (triggered) return rule;
    }
    return null;
  }

  function clearInterruption(state) {
    state.pendingNext = null;
    state.activeRandomEventId = null;
  }

  function finish(scenario, state, immediateEnding) {
    const ending = immediateEnding || matchingEndings(scenario, state, false)[0] || scenario.endings.find(item => item.id === scenario.defaultEnding);
    if (!ending) throw new Error('선택할 수 있는 엔딩이 없습니다. 기본 엔딩을 확인해 주세요.');
    state.endingId = ending.id;
    state.eventId = null;
    clearInterruption(state);
    return state;
  }

  function resolve(scenario, state, destination) {
    const skipped = new Set();
    while (true) {
      if (destination === 'RETURN') {
        // A response can also be tested directly as a start event. Without an
        // interrupted path to resume, RETURN closes that standalone playthrough.
        destination = state.pendingNext || 'END';
        clearInterruption(state);
      }
      if (destination === 'REIGN' && reignMode(scenario)) { state.eventId = null; return state; }
      if (destination === 'END') return finish(scenario, state);
      if (skipped.has(destination)) throw new Error(`사건 '${destination}'의 등장 조건을 건너뛰는 경로가 순환합니다. 다음 사건을 수정해 주세요.`);
      skipped.add(destination);
      const event = scenario.events.find(item => item.id === destination);
      if (!event) throw new Error(`다음 사건 '${destination}'을 찾을 수 없습니다.`);
      if (!testConditions(event.when, state)) { destination = event.next; continue; }
      state.eventId = event.id;
      if (!getChoices(scenario, state).some(item => item.enabled)) throw new Error(`'${event.title}'에서 선택 가능한 선택지가 없습니다. 조건 없는 선택지를 추가해 주세요.`);
      return state;
    }
  }

  function createState(scenario, options = {}) {
    const result = validateScenario(scenario);
    if (result.errors.length) throw new Error(`시나리오를 확인해 주세요.\n${result.errors.join('\n')}`);
    if (!plain(options) || (own(options, 'seed') && !uint32(options.seed))) throw new Error('seed는 0~4,294,967,295 사이의 정수여야 합니다.');
    const seed = own(options, 'seed') ? options.seed : freshSeed();
    const playerName = normalizePlayerName(options.playerName === undefined ? scenario.player && scenario.player.defaultName : options.playerName);
    const state = { eventId: null, stats: {}, flags: {}, history: [], endingId: null, turn: 0, seed, rngState: seed,
      pendingNext: null, activeRandomEventId: null, randomEventCounts: {}, lastTriggerTurns: {}, playerName };
    scenario.stats.forEach(stat => { state.stats[stat.id] = stat.initial; });
    scenario.flags.forEach(flag => { state.flags[flag.id] = flag.initial; });
    (scenario.randomEvents || []).forEach(rule => { state.randomEventCounts[rule.id] = 0; state.lastTriggerTurns[rule.id] = null; });
    if (v2(scenario) && scenario.map) state.map = createMapState(scenario);
    if (reignMode(scenario)) {
      state.reign = { turnIndex: 0, decisions: {}, results: [], between: [] };
      return enterReignTurn(scenario, state, 0);
    }
    return resolve(scenario, state, scenario.start);
  }

  function choose(scenario, state, index) { return chooseInternal(scenario, state, index, false); }
  function chooseInternal(scenario, state, index, ignoreRisks) {
    if (!state || state.endingId) throw new Error('이미 결말에 도달했습니다. 새 게임을 시작해 주세요.');
    if (reignMode(scenario) && !state.activeRandomEventId) throw new Error('치세 카드는 choosePart로 선택해 주세요.');
    const event = getEvent(scenario, state);
    if (!event) throw new Error('현재 사건을 찾을 수 없습니다.');
    if (!Number.isInteger(index) || index < 0 || index >= event.choices.length) throw new Error('선택지 번호가 올바르지 않습니다.');
    if (state.history.length >= MAX_HISTORY) throw new Error('선택 기록이 5,000개에 도달했습니다. 시나리오의 반복 경로를 확인해 주세요.');
    if (!uint32(state.seed) || !uint32(state.rngState)) throw new Error('확률 상태가 올바르지 않습니다. 저장을 다시 불러와 주세요.');
    if (!plain(state.randomEventCounts) || !plain(state.lastTriggerTurns)) throw new Error('랜덤 사건 상태가 올바르지 않습니다. 저장을 다시 불러와 주세요.');
    const choice = event.choices[index];
    if (!testConditions(choice.when, state)) throw new Error('이 선택지는 조건을 충족하지 못해 선택할 수 없습니다.');
    const next = clone(state);
    const effects = {};
    for (const [key, delta] of Object.entries(choice.effects || {})) {
      const stat = scenario.stats.find(item => item.id === key);
      if (!stat || !finite(delta)) throw new Error(`능력치 변화 '${key}'가 올바르지 않습니다.`);
      const value = Math.max(stat.min, Math.min(stat.max, next.stats[key] + delta));
      effects[key] = value - next.stats[key];
      next.stats[key] = value;
    }
    for (const [key, value] of Object.entries(choice.setFlags || {})) {
      if (!own(next.flags, key) || typeof value !== 'boolean') throw new Error(`기록 변경 '${key}'가 올바르지 않습니다.`);
      next.flags[key] = value;
    }
    if (v2(scenario)) applyTerritory(next, choice.territory);
    next.turn += 1;
    const riskRolls = [];
    const eventRolls = [];
    next.history.push({ eventId: event.id, eventTitle: event.title, choiceText: choice.text, choiceIndex: index, effects, setFlags: clone(choice.setFlags || {}), turn: next.turn, riskRolls, eventRolls });
    if (v2(scenario)) {
      Object.assign(next.history[next.history.length - 1], { result: choice.result || '', historical: choice.historical === true, territory: clone(choice.territory || []) });
      if (next.reign && state.activeRandomEventId) next.reign.results.push(choiceResult(next, event, index));
    }
    const ending = ignoreRisks ? null : tryImmediateEndings(scenario, next, riskRolls);
    if (ending) return finish(scenario, next, ending);
    const destination = choice.next === undefined ? event.next : choice.next;
    if (state.activeRandomEventId) {
      if (destination !== 'RETURN' && !reignMode(scenario)) clearInterruption(next);
      return resolve(scenario, next, destination);
    }
    if (destination === 'RETURN') return resolve(scenario, next, destination);
    const rule = ignoreRisks ? null : tryRandomEvents(scenario, next, eventRolls);
    if (rule) {
      next.pendingNext = destination === 'RETURN' ? 'END' : destination;
      next.activeRandomEventId = rule.id;
      next.randomEventCounts[rule.id] += 1;
      next.lastTriggerTurns[rule.id] = next.turn;
      return resolve(scenario, next, rule.eventId);
    }
    return resolve(scenario, next, destination);
  }

  function applyRuleEffects(scenario, state, source) {
    const effects = {};
    for (const [id, delta] of Object.entries(source.effects || {})) {
      const stat = scenario.stats.find(item => item.id === id);
      if (!stat || !finite(delta)) throw new Error('수치 변화가 올바르지 않습니다: ' + id);
      const value = Math.max(stat.min, Math.min(stat.max, state.stats[id] + delta));
      effects[id] = value - state.stats[id]; state.stats[id] = value;
    }
    for (const [id, value] of Object.entries(source.setFlags || {})) {
      if (!own(state.flags, id) || typeof value !== 'boolean') throw new Error('선택 기록 변경이 올바르지 않습니다: ' + id);
      state.flags[id] = value;
    }
    applyTerritory(state, source.territory);
    return effects;
  }

  function applyReignRules(scenario, state, rules, type) {
    const results = [];
    for (const rule of rules || []) if (testConditions(rule.when, state)) {
      const effects = applyRuleEffects(scenario, state, rule);
      results.push({ type, id: rule.id, text: rule.text, turnIndex: state.reign.turnIndex, effects, setFlags: clone(rule.setFlags || {}), territory: clone(rule.territory || []) });
    }
    return results;
  }

  function enterReignTurn(scenario, state, index) {
    // Entry rules are not history actions. As with V1 startup, risks wait for
    // the next choice/settlement and evaluate its final state; entry never rolls.
    state.eventId = null;
    state.reign.turnIndex = index; state.reign.decisions = {};
    state.reign.between = applyReignRules(scenario, state, scenario.reign.turns[index].between, 'between');
    return state;
  }

  function getReignStatus(scenario, state) {
    if (!reignMode(scenario) || !state || !state.reign) return null;
    const turnIndex = state.reign.turnIndex, turn = scenario.reign.turns[turnIndex];
    const cards = [];
    if (turn && !state.endingId) for (const part of scenario.reign.parts) {
      const decided = state.reign.decisions[part.id];
      const event = decided ? scenario.events.find(item => item.id === decided.eventId) : (turn.eventIds || []).map(id => scenario.events.find(item => item.id === id)).find(item => item && item.part === part.id && testConditions(item.when, state));
      if (event) cards.push({ part, event, choices: getChoices(scenario, state, event.id) });
    }
    return { turn, turnIndex, cards, decisions: clone(state.reign.decisions), ready: !state.endingId && !state.activeRandomEventId && cards.every(card => own(state.reign.decisions, card.part.id)), results: clone(state.reign.results), between: clone(state.reign.between) };
  }

  function freshReignResults(state) {
    if (!Object.keys(state.reign.decisions).length) state.reign.results = [];
  }
  function choiceResult(state, event, index) {
    const choice = event.choices[index];
    return { type: 'choice', text: choice.result || choice.text, eventId: event.id, partId: event.part || null, choiceIndex: index, turnIndex: state.reign.turnIndex, historical: choice.historical === true, territory: clone(choice.territory || []) };
  }
  function choosePart(scenario, state, eventId, choiceIndex) { return choosePartInternal(scenario, state, eventId, choiceIndex, false); }
  function choosePartInternal(scenario, state, eventId, choiceIndex, ignoreRisks) {
    if (!reignMode(scenario) || !state || !state.reign || state.endingId || state.activeRandomEventId) throw new Error('지금은 치세 카드를 선택할 수 없습니다.');
    if (state.history.length >= MAX_HISTORY) throw new Error('선택 기록이 5,000개에 도달했습니다.');
    const status = getReignStatus(scenario, state), card = status.cards.find(item => item.event.id === eventId);
    if (!card || own(state.reign.decisions, card.part.id)) throw new Error('선택할 수 없거나 이미 결정한 부문입니다.');
    if (!Number.isInteger(choiceIndex) || !card.choices.some(item => item.index === choiceIndex && item.enabled)) throw new Error('선택지 번호 또는 선택 조건이 올바르지 않습니다.');
    const next = clone(state), choice = card.event.choices[choiceIndex];
    freshReignResults(next);
    const effects = applyRuleEffects(scenario, next, choice);
    next.reign.decisions[card.part.id] = { eventId, choiceIndex };
    next.reign.results.push(choiceResult(next, card.event, choiceIndex));
    next.turn += 1;
    const riskRolls = [], eventRolls = [];
    next.history.push({ action: 'part', eventId, eventTitle: card.event.title, choiceIndex, choiceText: choice.text, effects, setFlags: clone(choice.setFlags || {}), territory: clone(choice.territory || []), result: choice.result || '', historical: choice.historical === true, turn: next.turn, riskRolls, eventRolls });
    const ending = ignoreRisks ? null : tryImmediateEndings(scenario, next, riskRolls);
    if (ending) return finish(scenario, next, ending);
    const rule = ignoreRisks ? null : tryRandomEvents(scenario, next, eventRolls);
    if (rule) {
      next.pendingNext = 'REIGN'; next.activeRandomEventId = rule.id;
      next.randomEventCounts[rule.id] += 1; next.lastTriggerTurns[rule.id] = next.turn;
      return resolve(scenario, next, rule.eventId);
    }
    return next;
  }

  function settleTurn(scenario, state) { return settleTurnInternal(scenario, state, false); }
  function settleTurnInternal(scenario, state, ignoreRisks) {
    const status = getReignStatus(scenario, state);
    if (!status || !status.ready) throw new Error('현재 선택 가능한 모든 부문을 결정한 뒤 결산해 주세요.');
    if (state.history.length >= MAX_HISTORY) throw new Error('선택 기록이 5,000개에 도달했습니다.');
    const next = clone(state); freshReignResults(next);
    const results = applyReignRules(scenario, next, status.turn.settlements, 'settlement');
    next.reign.results.push(...results); next.turn += 1;
    const riskRolls = [], eventRolls = [];
    next.history.push({ action: 'settle', eventId: null, eventTitle: status.turn.title, choiceText: '턴 결산', effects: {}, setFlags: {}, turnIndex: status.turnIndex, turn: next.turn, results: clone(results), result: results.map(item => item.text).join('\n'), riskRolls, eventRolls });
    const ending = ignoreRisks ? null : tryImmediateEndings(scenario, next, riskRolls);
    if (ending) return finish(scenario, next, ending);
    if (status.turnIndex + 1 >= scenario.reign.turns.length) return finish(scenario, next);
    return enterReignTurn(scenario, next, status.turnIndex + 1);
  }

  function getHistoricalReference(scenario) {
    try {
      let state = createState(scenario, { seed: 0, playerName: scenario.player?.defaultName || '집정관' });
      for (let actions = 0; actions < MAX_HISTORY; actions += 1) {
        if (state.endingId) return { state, complete: true, reason: '' };
        if (reignMode(scenario) && !state.activeRandomEventId) {
          const status = getReignStatus(scenario, state);
          if (status.ready) { state = settleTurnInternal(scenario, state, true); continue; }
          const card = status.cards.find(item => !own(status.decisions, item.part.id));
          const selected = card?.choices.find(item => item.enabled && item.choice.historical === true);
          if (!selected) return { state, complete: false, reason: '현재 치세 카드에 역사 선택 표시가 없습니다.' };
          state = choosePartInternal(scenario, state, card.event.id, selected.index, true);
        } else {
          const selected = getChoices(scenario, state).find(item => item.enabled && item.choice.historical === true);
          if (!selected) return { state, complete: false, reason: '현재 사건에 역사 선택 표시가 없습니다.' };
          state = chooseInternal(scenario, state, selected.index, true);
        }
      }
      return { state, complete: false, reason: '역사 경로가 반복되거나 너무 깁니다.' };
    } catch (error) { return { state: null, complete: false, reason: error.message }; }
  }

  function restoreState(scenario, raw) {
    const fail = () => { throw new Error('저장 데이터가 올바르지 않거나 현재 시나리오와 일치하지 않습니다.'); };
    if (!plain(raw) || !Array.isArray(raw.history) || raw.history.length > MAX_HISTORY || !Number.isInteger(raw.turn) || raw.turn !== raw.history.length || !plain(raw.stats) || !plain(raw.flags)) return fail();
    if (raw.eventId !== null && typeof raw.eventId !== 'string') return fail();
    if (raw.endingId !== null && typeof raw.endingId !== 'string') return fail();
    const legacy = !own(raw, 'seed') && !own(raw, 'rngState');
    if (v2(scenario) && legacy) return fail();
    if (!legacy && (!uint32(raw.seed) || !uint32(raw.rngState))) return fail();
    // Seedless saves only belong to the original, non-random scenario format.
    // The app keeps that scenario intact rather than moving old playthroughs to
    // a newly edited scenario with newly introduced random endings.
    if (legacy && scenario.endings.some(ending => own(ending, 'chance'))) return fail();
    const randomFields = ['pendingNext', 'activeRandomEventId', 'randomEventCounts', 'lastTriggerTurns'];
    const oldRandomFormat = randomFields.every(key => !own(raw, key));
    if (oldRandomFormat && (scenario.randomEvents || []).length) return fail();
    if (!oldRandomFormat && !randomFields.every(key => own(raw, key))) return fail();
    if (!oldRandomFormat && (!plain(raw.randomEventCounts) || !plain(raw.lastTriggerTurns))) return fail();
    let playerName;
    try {
      playerName = normalizePlayerName(own(raw, 'playerName') ? raw.playerName : scenario.player && scenario.player.defaultName);
      if (own(raw, 'playerName') && playerName !== raw.playerName) return fail();
    } catch (_) { return fail(); }
    let state = createState(scenario, { seed: legacy ? LEGACY_SEED : raw.seed, playerName });
    function matchingRolls(actual, expected, keys) {
      return Array.isArray(actual) && actual.length === expected.length && expected.every((expectedRoll, index) => {
        const actualRoll = actual[index];
        return plain(actualRoll) && keys.every(key => own(actualRoll, key) && actualRoll[key] === expectedRoll[key]);
      });
    }
    // Replay only verified indexes from the current scenario. Saved narrative,
    // deltas and flags never enter the rendered state directly.
    for (let index = 0; index < raw.history.length; index += 1) {
      const record = raw.history[index];
      if (!plain(record) || record.turn !== index + 1) return fail();
      try {
        if (v2(scenario) && record.action === 'part') {
          if (!reignMode(scenario) || !Number.isInteger(record.choiceIndex)) return fail();
          state = choosePart(scenario, state, record.eventId, record.choiceIndex);
        } else if (v2(scenario) && record.action === 'settle') {
          if (!reignMode(scenario) || record.turnIndex !== state.reign?.turnIndex) return fail();
          state = settleTurn(scenario, state);
        } else {
          if (v2(scenario) && record.action !== undefined && record.action !== 'choice') return fail();
          if (record.eventId !== state.eventId || !Number.isInteger(record.choiceIndex)) return fail();
          state = choose(scenario, state, record.choiceIndex);
        }
      } catch (_) { return fail(); }
      if (!legacy) {
        if (!matchingRolls(record.riskRolls, state.history[index].riskRolls, ['endingId', 'chance', 'roll', 'triggered'])) return fail();
      }
      if ((!oldRandomFormat || own(record, 'eventRolls')) && !matchingRolls(record.eventRolls, state.history[index].eventRolls, ['randomEventId', 'chance', 'roll', 'triggered'])) return fail();
    }
    if (state.eventId !== raw.eventId || state.endingId !== raw.endingId || state.turn !== raw.turn) return fail();
    if (!legacy && state.rngState !== raw.rngState) return fail();
    if (!oldRandomFormat) {
      if (state.pendingNext !== raw.pendingNext || state.activeRandomEventId !== raw.activeRandomEventId) return fail();
      for (const field of ['randomEventCounts', 'lastTriggerTurns']) {
        if (Object.keys(state[field]).length !== Object.keys(raw[field]).length) return fail();
        if (!Object.keys(state[field]).every(key => own(raw[field], key) && raw[field][key] === state[field][key])) return fail();
      }
    }
    if (Object.keys(raw.stats).length !== scenario.stats.length || Object.keys(raw.flags).length !== scenario.flags.length) return fail();
    if (!scenario.stats.every(stat => own(raw.stats, stat.id) && finite(raw.stats[stat.id]) && raw.stats[stat.id] === state.stats[stat.id])) return fail();
    if (!scenario.flags.every(flag => own(raw.flags, flag.id) && typeof raw.flags[flag.id] === 'boolean' && raw.flags[flag.id] === state.flags[flag.id])) return fail();
    if (v2(scenario)) {
      const equal = (left, right) => {
        if (left === right) return true;
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every(key => own(right, key) && equal(left[key], right[key]));
      };
      if (own(state, 'map') !== own(raw, 'map') || (state.map && !equal(state.map, raw.map))) return fail();
      if (own(state, 'reign') !== own(raw, 'reign') || (state.reign && !equal(state.reign, raw.reign))) return fail();
    }
    return state;
  }

  const api = { validateScenario, createBlankScenario, normalizePlayerName, formatText, createState, choose, choosePart, settleTurn, getReignStatus, getMapConfig, getHistoricalReference, getEvent, getChoices, getImmediateRisks, getRandomEventRisks, testConditions, explainCondition, restoreState, clone };
  root.GameEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
