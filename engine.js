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

    if (scenario.schemaVersion !== 1) error('schemaVersion은 1이어야 합니다.');
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
    for (const id of eventIds) if (id === 'END' || id === 'RETURN') error(`사건 ID '${id}'는 경로 예약어이므로 사용할 수 없습니다.`);

    if (!(draft && events.length === 0 && scenario.start === null) && !eventIds.has(scenario.start)) error(`시작 사건 '${show(scenario.start)}'을 찾을 수 없습니다.`);
    if (!(draft && endings.length === 0 && scenario.defaultEnding === null) && !endingIds.has(scenario.defaultEnding)) error(`기본 엔딩 '${show(scenario.defaultEnding)}'을 찾을 수 없습니다.`);

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
        } else error(`${place}: 조건 종류는 stat 또는 flag여야 합니다.`);
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
    const fallback = endings.find(ending => plain(ending) && ending.id === scenario.defaultEnding);
    if (fallback && (fallback.immediate !== false || (fallback.when && fallback.when.length !== 0))) error('기본 엔딩은 immediate: false이고 조건이 없는 엔딩이어야 합니다.');
    return { errors, warnings };
  }

  function testConditions(conditions, state) {
    if (conditions === undefined) return true;
    if (!Array.isArray(conditions) || !state) return false;
    return conditions.every(condition => {
      if (!plain(condition) || !operators.has(condition.op)) return false;
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

  function getChoices(scenario, state) {
    const event = getEvent(scenario, state);
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
    return resolve(scenario, state, scenario.start);
  }

  function choose(scenario, state, index) {
    if (!state || state.endingId) throw new Error('이미 결말에 도달했습니다. 새 게임을 시작해 주세요.');
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
    next.turn += 1;
    const riskRolls = [];
    const eventRolls = [];
    next.history.push({ eventId: event.id, eventTitle: event.title, choiceText: choice.text, choiceIndex: index, effects, setFlags: clone(choice.setFlags || {}), turn: next.turn, riskRolls, eventRolls });
    const ending = tryImmediateEndings(scenario, next, riskRolls);
    if (ending) return finish(scenario, next, ending);
    const destination = choice.next === undefined ? event.next : choice.next;
    if (state.activeRandomEventId) {
      if (destination !== 'RETURN') clearInterruption(next);
      return resolve(scenario, next, destination);
    }
    if (destination === 'RETURN') return resolve(scenario, next, destination);
    const rule = tryRandomEvents(scenario, next, eventRolls);
    if (rule) {
      next.pendingNext = destination === 'RETURN' ? 'END' : destination;
      next.activeRandomEventId = rule.id;
      next.randomEventCounts[rule.id] += 1;
      next.lastTriggerTurns[rule.id] = next.turn;
      return resolve(scenario, next, rule.eventId);
    }
    return resolve(scenario, next, destination);
  }

  function restoreState(scenario, raw) {
    const fail = () => { throw new Error('저장 데이터가 올바르지 않거나 현재 시나리오와 일치하지 않습니다.'); };
    if (!plain(raw) || !Array.isArray(raw.history) || raw.history.length > MAX_HISTORY || !Number.isInteger(raw.turn) || raw.turn !== raw.history.length || !plain(raw.stats) || !plain(raw.flags)) return fail();
    if (raw.eventId !== null && typeof raw.eventId !== 'string') return fail();
    if (raw.endingId !== null && typeof raw.endingId !== 'string') return fail();
    const legacy = !own(raw, 'seed') && !own(raw, 'rngState');
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
      if (!plain(record) || record.eventId !== state.eventId || !Number.isInteger(record.choiceIndex) || record.turn !== index + 1) return fail();
      try { state = choose(scenario, state, record.choiceIndex); } catch (_) { return fail(); }
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
    return state;
  }

  const api = { validateScenario, createBlankScenario, normalizePlayerName, formatText, createState, choose, getEvent, getChoices, getImmediateRisks, getRandomEventRisks, testConditions, explainCondition, restoreState, clone };
  root.GameEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
