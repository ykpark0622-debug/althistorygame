/* Scenario editor: plain data in, plain data out. No network or executable scenario code. */
(function () {
  'use strict';

  let current = null;
  let resetUndo = null;
  let openSequence = 0;
  const needsTemplate = value => value?.map?.templateId && !globalThis.MapTemplates?.get(value.map.templateId);
  async function ensureTemplate(value) {
    if (needsTemplate(value)) {
      if (!globalThis.MapTemplates?.ensure) throw new Error('지도 로더를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      await MapTemplates.ensure(value.map.templateId);
    }
  }
  const $ = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const copy = value => globalThis.GameEngine && typeof GameEngine.clone === 'function'
    ? GameEngine.clone(value) : JSON.parse(JSON.stringify(value));
  const tabs = [
    ['overview', '기본 설정'], ['stats', '수치'], ['flags', '선택 기록'],
    ['events', '사건·선택지'], ['flowchart', '분기 흐름도'], ['map', '지도·초기 영토'], ['reign', '치세·연도'], ['randomEvents', '돌발 사건'], ['endings', '엔딩'], ['json', 'JSON']
  ];
  const mark = () => { if (current) current.dirty = true; };
  const cancelMapPreparation = () => { if (current) { current.mapRequest = (current.mapRequest || 0) + 1; current.mapLoading = ''; } };

  function button(text, action, style = 'secondary') {
    const node = $('button', 'btn ' + style, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function input(label, value, action, options = {}) {
    const wrap = $('label', 'field');
    wrap.append($('span', '', label));
    const node = $(options.multiline ? 'textarea' : 'input', options.compact ? 'compact-input' : '');
    node.setAttribute('aria-label', label);
    if (!options.multiline) node.type = options.type || 'text';
    else node.rows = options.rows || 4;
    if (options.step) node.step = options.step;
    if (options.min !== undefined) node.min = String(options.min);
    if (options.max !== undefined) node.max = String(options.max);
    if (options.maxLength !== undefined) node.maxLength = options.maxLength;
    if (options.maxCodePoints !== undefined) node.maxLength = options.maxCodePoints * 2;
    node.value = value === undefined || value === null ? '' : String(value);
    if (options.placeholder) node.placeholder = options.placeholder;
    if (options.disabled) node.disabled = true;
    node.addEventListener('input', event => {
      if (options.maxCodePoints !== undefined && !event?.isComposing) {
        node.value = Array.from(node.value).slice(0, options.maxCodePoints).join('');
      }
      const result = options.type === 'number' ? Number(node.value) : node.value;
      action(result);
      mark();
    });
    wrap.append(node);
    if (options.help) wrap.append($('span', 'small muted', options.help));
    return wrap;
  }

  function select(label, value, items, action, options = {}) {
    const wrap = $('label', 'field');
    if (label) wrap.append($('span', '', label));
    const node = $('select', options.compact ? 'compact-input' : '');
    if (label) node.setAttribute('aria-label', label);
    const choices = items.map(item => Array.isArray(item) ? item : [item, item]);
    if (value !== undefined && !choices.some(item => String(item[0]) === String(value))) {
      choices.unshift([value, '⚠ 찾을 수 없음: ' + value]);
    }
    choices.forEach(([key, title]) => {
      const option = $('option', '', title);
      option.value = key;
      node.append(option);
    });
    node.value = value === undefined ? '' : String(value);
    node.addEventListener('change', () => { action(node.value); if (options.mark !== false) mark(); });
    wrap.append(node);
    if (options.help) wrap.append($('span', 'small muted', options.help));
    return wrap;
  }

  // A dense world template must not create tens of thousands of DOM options
  // for every condition and territory effect. Keep the normal selector on
  // small maps, and search the complete registry with a bounded result list.
  const provinceIndexes = new WeakMap();
  function provinceIndex(template) {
    if (!template) return { byId: new Map(), rows: [] };
    if (!provinceIndexes.has(template)) provinceIndexes.set(template, {
      byId: new Map(template.provinces.map(province => [province.id, province])),
      rows: template.provinces.map(province => ({ province, text: (province.name + ' ' + province.id + ' ' + province.owner).toLocaleLowerCase() }))
    });
    return provinceIndexes.get(template);
  }
  function provinceSelect(label, value, config, action) {
    const provinces = config?.template.provinces || [];
    if (provinces.length <= 500) return select(label, value, provinces.map(province => [province.id, province.name + ' · ' + province.id]), action);
    const wrap = $('div', 'v2-province-search'), index = provinceIndex(config.template);
    const searchLabel = $('label', 'field'), search = $('input'); search.type = 'search';
    search.setAttribute('aria-label', label + ' 검색');
    search.placeholder = '지역 이름 또는 ID 검색';
    searchLabel.append($('span', '', label + ' 검색'), search);
    const resultLabel = $('label', 'field'), result = $('select'), help = $('span', 'small muted');
    result.setAttribute('aria-label', label);
    resultLabel.append($('span', '', label), result);
    let selected = value;
    function fill() {
      const query = search.value.trim().toLocaleLowerCase(), matches = [];
      let count = 0;
      for (const item of index.rows) if (!query || item.text.includes(query)) {
        count++; if (matches.length < 100) matches.push(item.province);
      }
      const existing = index.byId.get(selected);
      if (existing && !matches.some(province => province.id === selected)) matches.unshift(existing);
      result.replaceChildren();
      if (selected !== undefined && !existing) {
        const missing = $('option', '', '⚠ 찾을 수 없음: ' + selected); missing.value = selected; result.append(missing);
      }
      for (const province of matches) { const option = $('option', '', province.name + ' · ' + province.id); option.value = province.id; result.append(option); }
      result.value = selected || '';
      help.textContent = count.toLocaleString() + '개 검색됨 · 최대 100개 표시. 현재 선택은 검색어와 관계없이 유지됩니다.';
    }
    search.addEventListener('input', fill);
    result.addEventListener('change', () => { selected = result.value; action(selected); mark(); });
    fill(); wrap.append(searchLabel, resultLabel, help); return wrap;
  }

  function checkbox(label, value, action, help) {
    const wrap = $('label', 'field-row');
    const node = $('input');
    node.type = 'checkbox';
    node.setAttribute('aria-label', label);
    node.checked = Boolean(value);
    node.addEventListener('change', () => { action(node.checked); mark(); });
    wrap.append(node, $('span', '', label));
    if (help) wrap.append($('span', 'small muted', help));
    return wrap;
  }

  function section(title, help) {
    const node = $('section', 'editor-section');
    node.append($('h3', '', title));
    if (help) node.append($('p', 'small muted', help));
    return node;
  }

  function grid(...children) {
    const node = $('div', 'form-grid');
    node.append(...children);
    return node;
  }

  function notice(text) { return $('p', 'notice small', text); }

  function upgrade(scenario) { scenario.schemaVersion = 2; if (!scenario.mode) scenario.mode = 'chronicle'; }
  function territoryReferences(scenario) {
    const provinces = [], countries = new Set();
    function conditionList(list, label) {
      (list || []).forEach(condition => {
        if (condition.kind !== 'territory') return;
        provinces.push({ id: condition.key, label: label + ' 조건' });
        if ((condition.field || 'owner') !== 'marker' && condition.value) countries.add(condition.value);
      });
    }
    function record(item, label) {
      conditionList(item.when, label);
      (item.territory || []).forEach(effect => {
        provinces.push({ id: effect.prov, label: label + ' 영토 변화' });
        for (const field of ['to', 'occupation', 'influence']) if (effect[field]) countries.add(effect[field]);
      });
    }
    (scenario.events || []).forEach(event => {
      record(event, event.title || event.id);
      (event.choices || []).forEach((choice, index) => record(choice, (event.title || event.id) + ' 선택 ' + (index + 1)));
    });
    (scenario.randomEvents || []).forEach(rule => record(rule, rule.title || rule.id));
    (scenario.endings || []).forEach(ending => record(ending, ending.title || ending.id));
    (scenario.reign?.turns || []).forEach(turn => {
      record(turn, turn.title || turn.id);
      for (const field of ['between', 'settlements']) (turn[field] || []).forEach(rule => record(rule, rule.text || rule.id));
    });
    return { provinces, countries };
  }
  function allMapCountries(scenario) {
    const template = scenario.map && globalThis.MapTemplates?.get(scenario.map.templateId);
    if (!template) return [];
    const countries = new Map((template.countries || []).map(country => [country.id, { ...country }]));
    (scenario.map.countries || []).forEach(country => countries.set(country.id, { ...(countries.get(country.id) || {}), ...country }));
    return [...countries.values()];
  }
  function mapConfig(scenario) {
    const template = scenario.map && globalThis.MapTemplates?.get(scenario.map.templateId);
    if (!template) return null;
    const initial = scenario.map.initial || {}, owners = initial.owners || {}, used = new Set();
    template.provinces.forEach(province => used.add(owners[province.id] || province.owner));
    for (const layer of ['occupation', 'influence']) Object.values(initial[layer] || {}).forEach(id => { if (id) used.add(id); });
    (scenario.map.countries || []).forEach(country => used.add(country.id));
    territoryReferences(scenario).countries.forEach(id => used.add(id));
    if (scenario.map.playerCountry) used.add(scenario.map.playerCountry);
    return { template, countries: allMapCountries(scenario).filter(country => used.has(country.id)) };
  }
  // Plan a map change before touching the draft. Stable province IDs keep edits
  // inside a new crop; references outside it must be fixed explicitly first.
  function planMapChange(scenario, templateId) {
    const template = templateId && globalThis.MapTemplates?.get(templateId);
    if (templateId && !template) return { error: '선택한 지도 템플릿을 찾을 수 없습니다.' };
    const valid = new Set(template?.provinces.map(province => province.id) || []);
    const references = territoryReferences(scenario);
    const blocked = references.provinces.filter(reference => !valid.has(reference.id));
    if (blocked.length) return { blocked, removed: 0 };
    let removed = 0;
    const initial = {};
    for (const layer of ['owners', 'occupation', 'influence', 'markers']) {
      initial[layer] = {};
      for (const [id, value] of Object.entries(scenario.map?.initial?.[layer] || {})) {
        if (valid.has(id)) initial[layer][id] = value;
        else removed++;
      }
    }
    if (!template) return { nextMap: null, removed };
    const previousTemplate = scenario.map && globalThis.MapTemplates?.get(scenario.map.templateId);
    const previousCountries = new Map((previousTemplate?.countries || []).map(country => [country.id, country]));
    function moveCountryOverride(country) {
      const override = copy(country), bounds = override.focusBounds;
      delete override.available;
      if (!Array.isArray(bounds)) return override;
      const defaultBounds = previousCountries.get(country.id)?.focusBounds;
      if (Array.isArray(defaultBounds) && bounds.length === defaultBounds.length && bounds.every((value, index) => Math.abs(value - defaultBounds[index]) < 1e-7)) {
        delete override.focusBounds;
      } else if (previousTemplate?.id !== template.id) {
        // Custom bounds in regional templates use the same world geometry with
        // different origins. Legacy templates can use unrelated projections.
        if (previousTemplate?.regionId && template.regionId && bounds.length === 4 && bounds.every(Number.isFinite)) {
          const dx = previousTemplate.offsetX - template.offsetX, dy = previousTemplate.offsetY - template.offsetY;
          const translated = [Math.max(0, bounds[0] + dx), Math.max(0, bounds[1] + dy), Math.min(template.width, bounds[2] + dx), Math.min(template.height, bounds[3] + dy)];
          if (translated[0] < translated[2] && translated[1] < translated[3]) override.focusBounds = translated;
          else delete override.focusBounds;
        } else delete override.focusBounds;
      }
      return override;
    }
    const countries = (scenario.map?.countries || []).map(moveCountryOverride), known = new Set([...template.countries.map(country => country.id), ...countries.map(country => country.id)]);
    const needed = new Set(references.countries);
    for (const layer of ['owners', 'occupation', 'influence']) Object.values(initial[layer]).forEach(id => { if (id) needed.add(id); });
    if (scenario.map?.playerCountry) needed.add(scenario.map.playerCountry);
    allMapCountries(scenario).forEach(country => {
      if (needed.has(country.id) && !known.has(country.id)) { countries.push(moveCountryOverride(country)); known.add(country.id); }
    });
    const represented = new Set(template.provinces.map(province => initial.owners[province.id] || province.owner));
    const preferred = template.countries.find(country => represented.has(country.id) && ['joseon', 'france', 'kor', 'fra'].includes(country.id)) || template.countries.find(country => represented.has(country.id)) || countries[0];
    const present = new Set(represented);
    for (const layer of ['occupation', 'influence']) Object.values(initial[layer]).forEach(id => { if (id) present.add(id); });
    const previousPlayer = scenario.map?.playerCountry;
    const playerCountry = known.has(previousPlayer) && present.has(previousPlayer) ? previousPlayer : preferred?.id;
    return { removed, playerChanged: Boolean(previousPlayer && previousPlayer !== playerCountry), nextMap: { ...(scenario.map || {}), templateId, playerCountry, countries, initial } };
  }
  function initialMapState(scenario) {
    const config = mapConfig(scenario); if (!config) return null;
    if (globalThis.MapView?.initialState) return { ...MapView.initialState(scenario), stats: {}, flags: {} };
    const initial = scenario.map.initial || {};
    return { stats: {}, flags: {}, map: { owners: { ...Object.fromEntries(config.template.provinces.map(province => [province.id, province.owner])), ...(initial.owners || {}) },
      occupation: { ...(initial.occupation || {}) }, influence: { ...(initial.influence || {}) }, markers: { ...(initial.markers || {}) } } };
  }
  function paintMap(container, scenario, onProvince) {
    if (!globalThis.MapView?.render || !mapConfig(scenario)) { container.append(notice('지도 템플릿을 먼저 선택하세요.')); return; }
    try { MapView.render(container, scenario, initialMapState(scenario), { onProvince }); }
    catch (error) { container.append(notice('지도 표시: ' + error.message)); }
  }
  function changedV2(scenario, onChange) { upgrade(scenario); mark(); if (onChange) onChange(); }
  function conditionsEditor(scenario, list, title, onChange) {
    const wrap = section(title, '아래 조건을 모두 만족해야 합니다. 영토 조건은 지도를 선택한 뒤 사용할 수 있습니다.');
    wrap.classList.add('v2-condition-editor');
    const rows = $('div'); wrap.append(rows);
    const changed = () => { mark(); if (onChange) onChange(); };
    function renderRows() {
      rows.replaceChildren();
      const config = mapConfig(scenario), kinds = [['stat', '수치'], ['flag', '선택 기록']];
      if (config || list.some(condition => condition.kind === 'territory')) kinds.push(['territory', '영토·점령·영향권']);
      if (!list.length) rows.append($('p', 'small muted', '조건 없음 · 항상 허용'));
      add.disabled = (!scenario.stats.length && !scenario.flags.length && !config) || list.length >= 100;
      list.forEach((condition, index) => {
        const row = $('div', 'v2-condition-row');
        row.append(select('종류', condition.kind, kinds, value => {
          condition.kind = value;
          if (value === 'territory') { upgrade(scenario); condition.key = config?.template.provinces[0]?.id || ''; condition.field = 'owner'; condition.op = 'eq'; condition.value = config?.countries[0]?.id || ''; }
          else { delete condition.field; condition.key = (value === 'flag' ? scenario.flags : scenario.stats)[0]?.id || ''; condition.op = value === 'flag' ? 'eq' : 'gte'; condition.value = value === 'flag' ? true : 50; }
          changed(); renderRows();
        }));
        if (condition.kind === 'territory') {
          row.append(provinceSelect('지역', condition.key, config, value => { condition.key = value; changedV2(scenario, onChange); }),
            select('비교할 상태', condition.field || 'owner', [['owner', '소유국'], ['occupation', '군사 점령'], ['influence', '영향권'], ['marker', '표식']], value => { condition.field = value; condition.value = value === 'marker' ? '' : config?.countries[0]?.id || null; changedV2(scenario, onChange); renderRows(); }),
            select('비교', condition.op, [['eq', '같음'], ['ne', '다름']], value => { condition.op = value; changedV2(scenario, onChange); }));
          if (condition.field === 'marker') {
            row.append(checkbox('표식 없음(null)과 비교', condition.value === null, value => { condition.value = value ? null : ''; changedV2(scenario, onChange); renderRows(); }));
            if (condition.value !== null) row.append(input('표식 문구', condition.value, value => { condition.value = value; changedV2(scenario, onChange); }));
          } else row.append(select('대상 국가', condition.value === null ? '__none__' : condition.value, [['__none__', '없음'], ...(config?.countries || []).map(country => [country.id, country.name])], value => { condition.value = value === '__none__' ? null : value; changedV2(scenario, onChange); }));
        } else {
          const flag = condition.kind === 'flag';
          row.append(select('대상', condition.key, (flag ? scenario.flags : scenario.stats).map(item => [item.id, item.name + ' · ' + item.id]), value => { condition.key = value; changed(); }),
            select('비교', condition.op, flag ? [['eq', '같음'], ['ne', '다름']] : [['gte', '이상 ≥'], ['lte', '이하 ≤'], ['eq', '같음'], ['ne', '다름'], ['gt', '초과 >'], ['lt', '미만 <']], value => { condition.op = value; changed(); }));
          row.append(flag ? select('값', String(condition.value), [['true', '참 · 있음'], ['false', '거짓 · 없음']], value => { condition.value = value === 'true'; changed(); }) : input('기준값', condition.value, value => { condition.value = value; changed(); }, { type: 'number', step: 'any' }));
        }
        row.append(button('조건 삭제', () => { list.splice(index, 1); changed(); renderRows(); }, 'danger')); rows.append(row);
      });
    }
    const add = button('＋ 조건 추가', () => {
      if (list.length >= 100) return;
      const config = mapConfig(scenario), stat = scenario.stats[0], flag = scenario.flags[0];
      if (stat) list.push({ kind: 'stat', key: stat.id, op: 'gte', value: 50 });
      else if (flag) list.push({ kind: 'flag', key: flag.id, op: 'eq', value: true });
      else if (config) { upgrade(scenario); list.push({ kind: 'territory', key: config.template.provinces[0].id, field: 'owner', op: 'eq', value: config.countries[0].id }); }
      changed(); renderRows();
    });
    add.disabled = (!scenario.stats.length && !scenario.flags.length && !mapConfig(scenario)) || list.length >= 100;
    renderRows(); wrap.append(add); return wrap;
  }
  function territoryEditor(scenario, owner, onChange, title = '영토·점령·영향권 변화') {
    const wrap = section(title, '소유권·군사 점령·영향권·표식은 별개로 기록됩니다. 변경하지 않을 항목은 그대로 두세요.');
    wrap.classList.add('v2-territory-editor');
    const rows = $('div'); wrap.append(rows);
    const changed = () => changedV2(scenario, onChange);
    function renderRows() {
      rows.replaceChildren(); const config = mapConfig(scenario);
      (owner.territory || []).forEach((effect, index) => {
        const card = $('div', 'editor-card v2-effect-card');
        const province = provinceSelect('변경할 지역', effect.prov, config, value => { effect.prov = value; changed(); });
        card.append(province);
        const picker = $('div', 'v2-map-picker'); picker.hidden = true;
        card.append(button('지도에서 지역 선택', () => { picker.hidden = !picker.hidden; if (!picker.hidden) { picker.replaceChildren(); paintMap(picker, scenario, value => { effect.prov = typeof value === 'string' ? value : value.id || value.prov; changed(); renderRows(); }); } }), picker);
        for (const [field, label] of [['to', '소유국'], ['occupation', '군사 점령국'], ['influence', '영향국']]) {
          const value = Object.prototype.hasOwnProperty.call(effect, field) ? effect[field] === null ? '__clear__' : effect[field] : '__keep__';
          card.append(select(label, value, [['__keep__', '변경하지 않음'], ...(field === 'to' ? [] : [['__clear__', '없음으로 지우기']]), ...(config?.countries || []).map(country => [country.id, country.name])], next => { if (next === '__keep__') delete effect[field]; else effect[field] = next === '__clear__' ? null : next; changed(); }));
        }
        card.append(select('표식', Object.prototype.hasOwnProperty.call(effect, 'marker') ? effect.marker === null ? '__clear__' : '__text__' : '__keep__', [['__keep__', '변경하지 않음'], ['__clear__', '표식 지우기'], ['__text__', '문구 설정']], next => { if (next === '__keep__') delete effect.marker; else effect.marker = next === '__clear__' ? null : ''; changed(); renderRows(); }));
        if (typeof effect.marker === 'string') card.append(input('표식 문구', effect.marker, value => { effect.marker = value; changed(); }));
        card.append(button('이 영토 변화 삭제', () => { owner.territory.splice(index, 1); if (!owner.territory.length) delete owner.territory; changed(); renderRows(); }, 'danger')); rows.append(card);
      });
      if (!(owner.territory || []).length) rows.append(notice(config ? '영토 변화 없음' : '지도·초기 영토 탭에서 템플릿을 선택하면 영토 변화를 추가할 수 있습니다.'));
    }
    const add = button('＋ 영토 변화 추가', () => { const config = mapConfig(scenario); if (!config) return; if (!owner.territory) owner.territory = []; owner.territory.push({ prov: config.template.provinces[0].id }); changed(); renderRows(); });
    add.disabled = !mapConfig(scenario); renderRows(); wrap.append(add); return wrap;
  }
  function rewriteReferences(scenario, kind, oldID, newID) {
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if ((kind === 'stat' || kind === 'flag') && value.kind === kind && value.key === oldID) value.key = newID;
      const field = kind === 'stat' ? 'effects' : kind === 'flag' ? 'setFlags' : null;
      if (field && value[field] && Object.prototype.hasOwnProperty.call(value[field], oldID)) { value[field][newID] = value[field][oldID]; delete value[field][oldID]; }
      Object.values(value).forEach(visit);
    };
    visit(scenario);
    if (kind === 'event') {
      if (scenario.start === oldID) scenario.start = newID;
      scenario.events.forEach(event => { if (event.next === oldID) event.next = newID; event.choices.forEach(choice => { if (choice.next === oldID) choice.next = newID; }); });
      (scenario.randomEvents || []).forEach(rule => { if (rule.eventId === oldID) rule.eventId = newID; });
      (scenario.reign?.turns || []).forEach(turn => { turn.eventIds = (turn.eventIds || []).map(id => id === oldID ? newID : id); });
      if (scenario.editorLayout?.positions?.[oldID]) { scenario.editorLayout.positions[newID] = scenario.editorLayout.positions[oldID]; delete scenario.editorLayout.positions[oldID]; }
    }
    if (kind === 'ending' && scenario.defaultEnding === oldID) scenario.defaultEnding = newID;
    if (kind === 'part') scenario.events.forEach(event => { if (event.part === oldID) event.part = newID; });
  }
  function idInput(label, item, kind, help) {
    const wrap = $('label', 'field'); wrap.append($('span', '', label)); const node = $('input'); node.value = item.id || '';
    node.setAttribute('aria-label', label);
    node.addEventListener('change', () => {
      const next = node.value.trim(), collections = { stat: current.draft.stats, flag: current.draft.flags, event: current.draft.events, ending: current.draft.endings, part: current.draft.reign?.parts || [] };
      if (!/^[a-z][a-z0-9_]*$/i.test(next) || ['__proto__', 'prototype', 'constructor'].includes(next.toLowerCase()) || (kind === 'event' && ['END', 'RETURN'].includes(next)) || (collections[kind] || []).some(other => other !== item && other.id === next)) {
        node.value = item.id; showReport({ errors: ['ID는 영문자로 시작하는 영문·숫자·밑줄이며 같은 종류에서 고유해야 합니다.'], warnings: [] }); return;
      }
      const previous = item.id; item.id = next; rewriteReferences(current.draft, kind, previous, next); mark(); render();
    });
    wrap.append(node, $('span', 'small muted', help || '값을 확정하면 관련 효과·조건·연결의 ID도 함께 바꿉니다.')); return wrap;
  }

  function eventOptions(inherit) {
    const list = inherit ? [['', '사건의 다음 장면을 따름']] : [];
    list.push(['END', '이야기 종료 → 엔딩 판정']);
    list.push(['RETURN', '중간 사건 종료 → 원래 흐름으로 복귀']);
    current.draft.events.forEach(event => list.push([event.id, event.id + ' · ' + (event.title || '제목 없음')]));
    return list;
  }

  function allocate(prefix) {
    const draft = current.draft;
    const taken = new Set([draft.id, ...draft.stats.map(item => item.id), ...draft.flags.map(item => item.id),
      ...draft.events.map(item => item.id), ...draft.endings.map(item => item.id), ...(draft.randomEvents || []).map(item => item.id),
      ...(draft.reign?.parts || []).map(item => item.id), ...(draft.reign?.turns || []).map(item => item.id),
      ...(draft.reign?.turns || []).flatMap(turn => [...(turn.between || []), ...(turn.settlements || [])]).map(item => item.id), ...(draft.map?.countries || []).map(item => item.id)]);
    let index = 1;
    while (taken.has(prefix + '_' + index)) index += 1;
    return prefix + '_' + index;
  }

  function validation(data, options = { allowDraft: true }) {
    try {
      const result = GameEngine.validateScenario(data, options);
      if (Array.isArray(result)) return { errors: result, warnings: [] };
      if (!result) return { errors: [], warnings: [] };
      return { errors: result.errors || [], warnings: result.warnings || [] };
    } catch (error) {
      return { errors: ['검사 오류: ' + error.message], warnings: [] };
    }
  }

  function playReport(data) {
    const playable = copy(data);
    delete playable.draft;
    const result = validation(playable, {});
    if (data.draft && result.errors.length) {
      result.errors.unshift('아직 플레이할 수 없는 초안입니다. 수치·시작 사건·기본 엔딩을 만들고 아래 항목을 채워 주세요. 현재 내용은 “초안 저장”으로 보관할 수 있습니다.');
    }
    return result;
  }

  function messageText(item) {
    if (typeof item === 'string') return item;
    if (item && item.message) return (item.path ? item.path + ': ' : '') + item.message;
    return JSON.stringify(item);
  }

  function showReport(result, success) {
    const box = document.getElementById('editor-report');
    if (!box) return;
    box.replaceChildren();
    if (result.errors.length) {
      box.append($('strong', '', '고칠 항목 ' + result.errors.length + '개'));
      const list = $('ul', 'error-list');
      result.errors.forEach(error => list.append($('li', '', messageText(error))));
      box.append(list);
    } else {
      box.append($('p', 'notice small', success || '검사를 통과했습니다.'));
    }
    if (result.warnings.length) {
      box.append($('strong', '', '확인할 사항'));
      const list = $('ul', 'error-list');
      result.warnings.forEach(warning => list.append($('li', '', messageText(warning))));
      box.append(list);
    }
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function builder(list, title, help) {
    return conditionsEditor(current.draft, list, title, mark);
  }

  function renderOverview(content) {
    const draft = current.draft;
    content.append($('h2', '', '이야기의 기본 설정'));
    content.append(notice('제목과 설명부터 바꿔 보세요. 사건·수치·기록의 ID는 다른 항목에서 연결할 때 사용하는 고유 이름입니다. ID 수정은 입력을 마칠 때 관련 연결에도 반영됩니다.'));
    content.append(select('플레이 방식', draft.mode || 'chronicle', [['chronicle', '연대기 · 사건마다 하나의 결정'], ['reign', '치세 · 여러 분야를 고른 뒤 연도 정산']], value => {
      if (value === 'reign') { upgrade(draft); draft.mode = value; ensureReign(draft); }
      else if (draft.schemaVersion === 2) draft.mode = value;
      mark(); render();
    }, { help: '지도나 치세 기능을 켜면 버전 2 원고로 저장합니다. 기존 버전 1 원고는 사용하던 방식으로 계속 열립니다.' }));
    content.append(grid(
      input('게임 제목', draft.title, value => { draft.title = value; }),
      input('부제', draft.subtitle, value => { draft.subtitle = value; })
    ));
    content.append(input('시작 화면 설명', draft.description, value => { draft.description = value; }, { multiline: true }));
    content.append(grid(
      input('시나리오 ID', draft.id, value => { draft.id = value; }, { help: '영문·숫자·밑줄로 쓰면 관리하기 편합니다.' }),
      select('시작 사건', draft.start || '', draft.events.length ? draft.events.map(item => [item.id, item.id + ' · ' + item.title]) : [['', '사건을 먼저 추가하세요']], value => { draft.start = value || null; })
    ));
    renderPlayerSettings(content);
    content.append(notice('본문에는 일반 텍스트와 줄바꿈을 사용할 수 있습니다. HTML·스크립트는 실행되지 않습니다. 게임을 적용하면 기존 플레이를 초기화하고 새 시나리오를 시작합니다.'));
    if (draft.draft) content.append(notice('작성 중인 초안입니다. 빈 상태도 저장할 수 있습니다. 수치, 시작 사건, 기본 엔딩을 만든 뒤 “적용하고 새 게임”으로 플레이하세요.'));
  }

  function renderMap(content) {
    const draft = current.draft, templates = globalThis.MapTemplates?.list() || [];
    content.append($('h2', '', '지역과 시대를 고른 뒤 지도 편집'), notice('① 지역 지도 → ② 시대 기본안 → ③ 지도 준비 순서로 시작하세요. 시대별 배치는 수정할 수 있는 출발점입니다. 지도의 지역을 눌러 소유국·점령·영향권·표식을 바로 고칠 수 있습니다.'));
    if (current.mapStatus) content.append(notice(current.mapStatus));
    if (current.mapLoading) content.append(notice('선택한 지역의 지도 파일을 불러오는 중입니다. 현재 지도와 작성한 내용은 유지됩니다.'));
    async function applyMap(templateId) {
      const owner = current, request = owner.mapRequest = (owner.mapRequest || 0) + 1;
      if ((draft.map?.templateId || '') === (templateId || '')) return;
      if (templateId && !globalThis.MapTemplates?.get(templateId)) {
        owner.mapLoading = templateId; render();
        try { await ensureTemplate({ map: { templateId } }); }
        catch (error) {
          if (current !== owner || owner.mapRequest !== request) return;
          owner.mapLoading = ''; render();
          showReport({ errors: ['지도를 불러오지 못했습니다. 기존 지도와 편집 내용은 유지했습니다. “지도 준비”를 눌러 다시 시도해 주세요.\n' + error.message], warnings: [] }); return;
        }
        if (current !== owner || owner.mapRequest !== request) return;
        owner.mapLoading = ''; render();
      }
      const plan = planMapChange(draft, templateId);
      if (plan.error) { showReport({ errors: [plan.error], warnings: [] }); return; }
      if (plan.blocked?.length) {
        const unique = [...new Set(plan.blocked.map(reference => reference.id))];
        const examples = plan.blocked.slice(0, 4).map(reference => reference.label + ': ' + reference.id).join('\n');
        showReport({ errors: ['지도 변경을 보류했습니다. 새 지도 바깥의 ' + unique.length + '개 지역을 참조하는 영토 변화·조건이 ' + plan.blocked.length + '곳에 있습니다. 해당 연결을 수정·삭제하거나 더 넓은 지도를 선택하세요.\n' + examples], warnings: [] });
        return;
      }
      if (plan.removed && !confirm('새 지도 범위 밖에 있는 시작 영토·점령·영향권·표식 ' + plan.removed + '개 항목이 제외됩니다. 범위 안의 수정과 사건·선택지·엔딩은 유지합니다. 이 설정을 적용할까요?')) return;
      if (plan.nextMap) { upgrade(draft); draft.map = plan.nextMap; }
      else delete draft.map;
      const newPlayerName = plan.nextMap && allMapCountries(draft).find(country => country.id === draft.map.playerCountry)?.name;
      current.mapStatus = plan.playerChanged ? '이전 플레이 국가의 영토·점령·영향권이 새 지도 범위에 없어, 플레이 국가를 ' + (newPlayerName || draft.map.playerCountry) + '(으)로 설정했습니다. 아래에서 다른 국가로 바꿀 수 있습니다.' : '';
      current.mapProvince = null; current.mapCountry = null; current.mapPaintUndo = [];
      current.mapSetup = globalThis.MapTemplates?.selection?.(templateId) || null;
      mark(); render();
    }
    const recommendedTemplates = templates.filter(template => template.recommended);
    if (recommendedTemplates.length) {
      const stage = section('추천 지도'), actions = $('div', 'toolbar');
      for (const template of recommendedTemplates) {
        const active = draft.map?.templateId === template.id;
        const choose = button(current.mapLoading === template.id ? '선택한 지도를 불러오는 중…' : template.name + ' · ' + template.provinceCount.toLocaleString('ko-KR') + '개 지역' + (active ? ' · 사용 중' : ''), () => applyMap(template.id), 'primary');
        choose.disabled = active || current.mapLoading === template.id;
        choose.dataset.recommendedTemplate = template.id;
        actions.append(choose);
      }
      stage.append(notice('현대 행정구역을 바탕으로 지역 수를 조정한 편집용 지도입니다. 시대별 실제 국경을 재현한 지도는 아닙니다. 지도를 고른 뒤 국가명·색·소유권을 바꿔 시나리오에 맞추세요.'), actions);
      content.append(stage);
    }
    const regions = globalThis.MapTemplates?.regions?.() || [];
    if (regions.length) {
      const applied = draft.map && MapTemplates.selection(draft.map.templateId);
      if (!current.mapSetup) current.mapSetup = applied ? { ...applied } : { regionId: regions[0].id, eraId: regions[0].defaultEra };
      const setup = current.mapSetup, region = regions.find(item => item.id === setup.regionId) || regions[0];
      const eras = MapTemplates.eras(region.id);
      if (!eras.some(era => era.id === setup.eraId)) setup.eraId = region.defaultEra || eras[0]?.id;
      const stage = section(current.mapOnly ? '만들 지도의 범위' : '시나리오의 지도 범위'), controls = $('div', 'form-grid regional-map-controls');
      controls.append(select('① 사용할 지역 지도', region.id, regions.map(item => [item.id, item.name]), value => {
        const nextRegion = regions.find(item => item.id === value);
        current.mapRequest = (current.mapRequest || 0) + 1; current.mapLoading = '';
        current.mapSetup = { regionId: value, eraId: nextRegion.defaultEra }; render();
      }, { mark: false }), select('② 시대 기본안', setup.eraId, eras.map(era => [era.id, era.name]), value => { current.mapRequest = (current.mapRequest || 0) + 1; current.mapLoading = ''; setup.eraId = value; render(); }, { mark: false }));
      const era = eras.find(item => item.id === setup.eraId), requested = MapTemplates.regionalId(region.id, setup.eraId);
      if (era?.notice) stage.append(notice(era.notice));
      const prepare = button(current.mapLoading === requested ? '선택한 지도를 불러오는 중…' : '③ 이 설정으로 지도 준비', () => applyMap(requested), 'primary');
      prepare.disabled = draft.map?.templateId === requested || current.mapLoading === requested;
      const actions = $('div', 'toolbar'); actions.append(prepare);
      if (draft.map && !current.mapOnly) actions.append(button('지도 사용 안 함', () => applyMap('')));
      stage.prepend(controls); stage.append(actions, $('p', 'small muted', current.mapLoading === requested ? '선택한 지역 파일을 준비하고 있습니다. 다른 지역을 고르면 마지막으로 요청한 지도가 적용됩니다.' : prepare.disabled ? '현재 적용된 지역과 시대입니다. 아래 지도에서 세부 배치를 편집하세요.' : '준비 버튼을 누르면 선택한 범위의 지도만 사용합니다. 범위 안의 기존 수정은 유지합니다.'));
      content.append(stage);
    }
    const legacy = $('details', 'regional-legacy-maps');
    legacy.append($('summary', '', regions.length ? '기존 시나리오 지도·호환 템플릿' : '지도 템플릿 선택'));
    const legacyTemplates = templates.filter(template => !template.recommended && !globalThis.MapTemplates?.selection?.(template.id));
    if (!regions.length || (draft.map && !MapTemplates.selection(draft.map.templateId) && !recommendedTemplates.some(template => template.id === draft.map.templateId))) legacy.open = true;
    const regionalApplied = draft.map && globalThis.MapTemplates?.selection?.(draft.map.templateId);
    legacy.append(select('지도 템플릿', regionalApplied || recommendedTemplates.some(template => template.id === draft.map?.templateId) ? '' : draft.map?.templateId || '', [['', regions.length ? '기존 템플릿을 선택하세요' : '지도 사용 안 함'], ...legacyTemplates.map(template => [template.id, template.name + ' · ' + template.provinceCount + '개 지역'])], value => { if (value || !regions.length) applyMap(value); }));
    content.append(legacy);
    const config = mapConfig(draft); if (!config) { content.append(notice(templates.length ? '템플릿을 선택하면 지도와 지역 편집기가 열립니다.' : '지도 템플릿 파일을 불러오지 못했습니다.')); return; }
    const countryItems = () => mapConfig(draft).countries.map(country => [country.id, country.name]);
    content.append(select(current.mapOnly ? '중심 국가' : '플레이어 국가', draft.map.playerCountry, countryItems(), value => { draft.map.playerCountry = value; current.mapStatus = ''; mark(); render(); }, { help: current.mapOnly ? '지도 이동 버튼에서 사용할 국가입니다. 시나리오에 넣은 뒤 플레이어 국가를 다시 고를 수 있습니다.' : '지도는 선택한 지역 전체로 시작합니다. 오른쪽 국가 이동 버튼을 누르면 이 국가의 영토로 이동합니다.' }));
    content.append(button('지역 ID 목록 내려받기', () => {
      const text = JSON.stringify({ templateId: config.template.id, countries: config.countries,
        provinces: config.template.provinces.map(({ id, name, owner }) => ({ id, name, owner })) }, null, 2);
      const blob = new Blob([text + '\n'], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = $('a'); link.href = url;
      link.download = config.template.id + '-region-ids.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    if (config.template.notice) content.append(notice(config.template.notice));
    const initial = draft.map.initial || (draft.map.initial = {});
    for (const layer of ['owners', 'occupation', 'influence', 'markers']) if (!initial[layer]) initial[layer] = {};
    const paintTools = section('지도를 누르며 세부 배치 수정', '빠른 칠하기를 켜면 클릭할 때마다 선택한 국가의 시작 영토로 바뀝니다. 끄면 지역별 점령·영향권·표식을 자세히 편집합니다.');
    current.mapPaintCountry = config.countries.some(country => country.id === current.mapPaintCountry) ? current.mapPaintCountry : draft.map.playerCountry;
    paintTools.append(grid(checkbox('빠른 칠하기', current.mapPaintEnabled, value => { current.mapPaintEnabled = value; render(); }), select('칠할 시작 소유국', current.mapPaintCountry, countryItems(), value => { current.mapPaintCountry = value; }, { mark: false })));
    const undoPaint = button('마지막 칠하기 되돌리기', () => {
      const previous = current.mapPaintUndo?.pop(); if (!previous) return;
      if (previous.exists) initial.owners[previous.id] = previous.value; else delete initial.owners[previous.id];
      mark(); render();
    });
    undoPaint.disabled = !current.mapPaintUndo?.length; paintTools.append(undoPaint);
    const preview = $('div', 'v2-editor-map'), panel = $('div', 'editor-card v2-province-panel');
    content.append(paintTools, preview, panel);
    function redraw() {
      paintMap(preview, draft, id => {
        current.mapProvince = typeof id === 'string' ? id : id.id;
        if (current.mapPaintEnabled && current.mapPaintCountry) {
          const province = provinceIndex(config.template).byId.get(current.mapProvince);
          if (province && (initial.owners[province.id] || province.owner) !== current.mapPaintCountry) {
            if (!current.mapPaintUndo) current.mapPaintUndo = [];
            current.mapPaintUndo.push({ id: province.id, exists: Object.prototype.hasOwnProperty.call(initial.owners, province.id), value: initial.owners[province.id] });
            if (current.mapPaintUndo.length > 100) current.mapPaintUndo.shift();
            if (province.owner === current.mapPaintCountry) delete initial.owners[province.id]; else initial.owners[province.id] = current.mapPaintCountry;
            undoPaint.disabled = false; mark(); redraw();
          }
        }
        drawProvince();
      });
    }
    function drawProvince() {
      panel.replaceChildren();
      const province = config.template.provinces.find(item => item.id === current.mapProvince);
      if (!province) { panel.append($('h3', '', '지역을 선택하세요'), notice('지도의 지역을 누르면 이곳에서 처음 상태를 바꿀 수 있습니다.')); return; }
      panel.append($('h3', '', province.name + ' · ' + province.id));
      panel.append(select('시작 소유국', initial.owners[province.id] || province.owner, countryItems(), value => { initial.owners[province.id] = value; mark(); redraw(); }));
      for (const [field, title] of [['occupation', '군사 점령국'], ['influence', '영향국']]) panel.append(select(title, initial[field][province.id] || '__none__', [['__none__', '없음'], ...countryItems()], value => { if (value === '__none__') delete initial[field][province.id]; else initial[field][province.id] = value; mark(); redraw(); }));
      panel.append(input('시작 표식', initial.markers[province.id] || '', value => { if (value) initial.markers[province.id] = value; else delete initial.markers[province.id]; mark(); redraw(); }));
      panel.append(button('이 지역을 템플릿 기본값으로', () => { for (const layer of Object.values(initial)) if (layer && typeof layer === 'object') delete layer[province.id]; mark(); redraw(); drawProvince(); }));
    }
    redraw(); drawProvince();
    const countries = section('국가의 표시 이름과 색상');
    const selectedCountry = current.mapCountry || draft.map.playerCountry || config.countries[0].id;
    countries.append(select('편집할 국가', selectedCountry, countryItems(), value => { current.mapCountry = value; render(); }));
    const country = config.countries.find(item => item.id === selectedCountry) || config.countries[0];
    function updateCountry(key, value) {
      if (!draft.map.countries) draft.map.countries = [];
      let override = draft.map.countries.find(item => item.id === country.id);
      if (!override) { override = { id: country.id, name: country.name, color: country.color }; draft.map.countries.push(override); }
      override[key] = value; mark(); redraw();
    }
    countries.append(grid(input('표시 이름', country.name, value => updateCountry('name', value)), input('색상 #RRGGBB', country.color, value => updateCountry('color', value))));
    countries.append(button('＋ 새 국가 추가', () => { const taken = new Set(mapConfig(draft).countries.map(item => item.id)); let index = 1; while (taken.has('country_' + index)) index++; const id = 'country_' + index; if (!draft.map.countries) draft.map.countries = []; draft.map.countries.push({ id, name: '새 국가', color: '#778899' }); current.mapCountry = id; mark(); render(); }));
    content.append(countries);
  }

  function ensureReign(draft) {
    if (!draft.reign) draft.reign = { parts: [{ id: 'war', name: '전쟁', color: '#a96657' }, { id: 'politics', name: '정치', color: '#648c66' }, { id: 'diplomacy', name: '외교', color: '#6b81ad' }], turns: [] };
    return draft.reign;
  }
  function rulesEditor(draft, turn, field, title) {
    const wrap = section(title, '위에서 아래로 조건을 검사하고 적용합니다. 앞선 규칙의 수치·기록·영토 변화는 다음 규칙의 조건에도 반영됩니다.');
    if (!Array.isArray(turn[field])) turn[field] = [];
    turn[field].forEach((rule, index) => {
      const card = $('details', 'editor-card v2-reign-rule');
      card.append($('summary', '', (index + 1) + '. ' + (rule.text || rule.id)));
      const body = $('div', 'v2-rule-body');
      body.append(input('결과에 표시할 문구', rule.text, value => { rule.text = value; }, { multiline: true, rows: 2 }), notice('규칙 ID: ' + rule.id));
      const effects = $('div', 'effects-grid');
      draft.stats.forEach(stat => effects.append(input(stat.name + ' 변화', rule.effects?.[stat.id] || 0, value => { if (!rule.effects) rule.effects = {}; if (value) rule.effects[stat.id] = value; else delete rule.effects[stat.id]; }, { type: 'number', step: 'any' })));
      body.append(effects);
      draft.flags.forEach(flag => body.append(select(flag.name, Object.prototype.hasOwnProperty.call(rule.setFlags || {}, flag.id) ? String(rule.setFlags[flag.id]) : '', [['', '유지'], ['true', '참으로'], ['false', '거짓으로']], value => { if (!rule.setFlags) rule.setFlags = {}; if (value === '') delete rule.setFlags[flag.id]; else rule.setFlags[flag.id] = value === 'true'; })));
      if (!Array.isArray(rule.when)) rule.when = [];
      body.append(conditionsEditor(draft, rule.when, '이 결과가 발생할 조건', mark), territoryEditor(draft, rule, mark));
      const up = button('↑', () => { move(turn[field], index, -1); render(); }); up.disabled = index === 0;
      const down = button('↓', () => { move(turn[field], index, 1); render(); }); down.disabled = index === turn[field].length - 1;
      const controls = $('div', 'toolbar'); controls.append(up, down, button('규칙 삭제', () => { turn[field].splice(index, 1); mark(); render(); }, 'danger')); body.append(controls); card.append(body); wrap.append(card);
    });
    wrap.append(button('＋ 결과 규칙 추가', () => { turn[field].push({ id: allocate('rule'), text: '결과를 입력하세요.', when: [], effects: {}, setFlags: {} }); mark(); render(); })); return wrap;
  }
  function renderReign(content) {
    const draft = current.draft;
    content.append($('h2', '', '치세의 분야와 연도'), notice('연도마다 분야별 사건을 고른 뒤 정산합니다. 같은 분야에 조건부 사건을 여러 개 넣으면 목록에서 처음으로 조건을 만족하는 사건이 표시됩니다. 일반 next 연결 대신 아래 연도 목록을 사용합니다.'));
    if (draft.mode !== 'reign') {
      content.append(button('치세 모드 사용하기', () => { upgrade(draft); draft.mode = 'reign'; ensureReign(draft); mark(); render(); }, 'primary'), notice('연대기 방식으로 돌아가도 작성한 치세 설정은 삭제하지 않습니다.')); return;
    }
    const reign = ensureReign(draft), parts = section('결정할 분야');
    reign.parts.forEach((part, index) => {
      const card = $('div', 'editor-card'); card.append(grid(idInput('분야 ID', part, 'part'), input('분야 이름', part.name, value => { part.name = value; }), input('표시 색상', part.color || '#778899', value => { part.color = value; })));
      card.append(button('분야 삭제', () => { if (!confirm('분야를 삭제할까요? 이 분야에 속한 사건은 다른 분야로 다시 지정해야 합니다.')) return; reign.parts.splice(index, 1); draft.events.forEach(event => { if (event.part === part.id) delete event.part; }); mark(); render(); }, 'danger')); parts.append(card);
    });
    parts.append(button('＋ 분야 추가', () => { reign.parts.push({ id: allocate('part'), name: '새 분야', color: '#778899' }); mark(); render(); })); content.append(parts);
    const list = $('div', 'editor-list');
    reign.turns.forEach((turn, index) => list.append(button((index + 1) + '. ' + (turn.date || turn.title || turn.id), () => { current.reignIndex = index; render(); }, current.reignIndex === index ? 'selected' : 'secondary')));
    content.append(list, button('＋ 연도·차례 추가', () => { reign.turns.push({ id: allocate('turn'), date: (reign.turns.length + 1) + '년', title: '새해의 회의', body: '이번 차례에 결정할 사안을 살펴보세요.', eventIds: [], between: [], settlements: [] }); current.reignIndex = reign.turns.length - 1; mark(); render(); }));
    if (!reign.turns.length) { content.append(notice('첫 연도를 추가한 뒤 분야별 사건을 연결하세요.')); return; }
    current.reignIndex = Math.max(0, Math.min(current.reignIndex || 0, reign.turns.length - 1));
    const index = current.reignIndex, turn = reign.turns[index], controls = $('div', 'toolbar');
    const up = button('↑ 이전으로', () => { current.reignIndex = move(reign.turns, index, -1); render(); }); up.disabled = index === 0;
    const down = button('↓ 다음으로', () => { current.reignIndex = move(reign.turns, index, 1); render(); }); down.disabled = index === reign.turns.length - 1;
    controls.append(up, down, button('이 연도 삭제', () => { if (!confirm('이 연도의 연결과 결과 규칙을 삭제할까요? 사건 본문은 남습니다.')) return; reign.turns.splice(index, 1); mark(); render(); }, 'danger'));
    content.append(controls, grid(input('표시 날짜·연도', turn.date, value => { turn.date = value; }), input('제목', turn.title, value => { turn.title = value; })), input('차례의 설명', turn.body, value => { turn.body = value; }, { multiline: true, rows: 3 }));
    const cards = section('이번 연도에 나올 사건', '목록 순서가 같은 분야의 조건부 후보 우선순위입니다. 분야를 바꾸면 이 사건을 쓰는 다른 연도에도 반영됩니다.');
    if (!Array.isArray(turn.eventIds)) turn.eventIds = [];
    turn.eventIds.forEach((id, eventIndex) => {
      const event = draft.events.find(item => item.id === id), row = $('div', 'editor-card');
      row.append($('strong', '', event ? event.title + ' · ' + id : '⚠ 없는 사건: ' + id));
      if (event) row.append(select('분야', event.part || '', [['', '미지정'], ...reign.parts.map(part => [part.id, part.name])], value => { event.part = value; }));
      const buttons = $('div', 'toolbar'); const earlier = button('↑', () => { move(turn.eventIds, eventIndex, -1); render(); }); earlier.disabled = eventIndex === 0;
      const later = button('↓', () => { move(turn.eventIds, eventIndex, 1); render(); }); later.disabled = eventIndex === turn.eventIds.length - 1;
      buttons.append(earlier, later, button('본문·선택지 편집', () => { const eventPosition = draft.events.findIndex(item => item.id === id); if (eventPosition >= 0) { current.eventIndex = eventPosition; navigate('events'); } }), button('이 연도에서 제외', () => { turn.eventIds.splice(eventIndex, 1); mark(); render(); }, 'danger')); row.append(buttons); cards.append(row);
    });
    const ordinaryEvents = draft.events.filter(event => event.next !== 'RETURN' && !(draft.randomEvents || []).some(rule => rule.eventId === event.id) && !turn.eventIds.includes(event.id));
    let selected = ordinaryEvents[0]?.id || '';
    cards.append(select('기존 사건 가져오기', selected, ordinaryEvents.map(event => [event.id, event.title + ' · ' + event.id]), value => { selected = value; }));
    const connect = button('선택한 사건을 이 연도에 추가', () => { if (!selected) return; const event = draft.events.find(item => item.id === selected); if (!event.part && reign.parts.length) event.part = reign.parts[0].id; turn.eventIds.push(selected); mark(); render(); }); connect.disabled = !ordinaryEvents.length; cards.append(connect);
    const add = button('＋ 새 사건을 만들어 이 연도에 추가', () => { const event = { id: allocate('event'), title: '새 분야 사건', body: '이번 분야에서 결정할 사안을 입력하세요.', part: reign.parts[0]?.id || '', next: 'END', when: [], choices: [{ text: '계속한다.', effects: {}, setFlags: {}, when: [] }] }; draft.events.push(event); if (!draft.start) draft.start = event.id; turn.eventIds.push(event.id); mark(); render(); }); add.disabled = !reign.parts.length; cards.append(add);
    content.append(cards, rulesEditor(draft, turn, 'between', '연도 시작에 발생하는 일'), rulesEditor(draft, turn, 'settlements', '결정들을 모아 정산할 때 발생하는 일'));
  }

  function renderPlayerSettings(content) {
    const draft = current.draft;
    const defaults = { askName: true, label: '당신의 이름', defaultName: '집정관', placeholder: '이름을 입력하세요' };
    const player = { ...defaults, ...(draft.player || {}) };
    const update = (key, value) => { draft.player = { ...defaults, ...(draft.player || {}), [key]: value }; };
    const details = section('플레이어 이름', '{name}을 제목·본문·화자·선택지·엔딩에 넣으면 시작할 때 입력한 이름으로 표시됩니다.');
    details.append(checkbox('게임 시작 전에 플레이어 이름 입력 받기', player.askName, value => { update('askName', value); }),
      grid(
        input('이름 입력 안내 문구', player.label, value => { update('label', value); }, { maxLength: 100, help: '시작 화면에서 이름 입력칸 위에 표시합니다. 최대 100자입니다.' }),
        input('기본 이름', player.defaultName, value => { update('defaultName', value); }, { maxCodePoints: 24, help: '이름 입력을 끄면 이 이름을 사용합니다. 비어 있지 않은 24자 이내의 이름을 입력하세요.' })
      ), input('입력칸 안내 (선택)', player.placeholder, value => { update('placeholder', value); }, { maxLength: 100, help: '이름 입력칸이 비어 있을 때 표시할 문구입니다. 비워 두어도 됩니다.' }),
      $('p', 'small muted', '기존 시나리오에 이름 설정이 없어도 이름 입력은 기본으로 켜집니다. 시작 화면을 건너뛰려면 위 항목을 끄세요. 이 설정은 값을 바꿀 때만 시나리오에 추가됩니다.'));
    content.append(details);
  }

  function renderStats(content) {
    const draft = current.draft;
    content.append($('h2', '', '수치'));
    content.append($('p', 'muted', '선택지의 효과는 이 값에 더해집니다. 게임에서는 최솟값과 최댓값 사이로 제한됩니다.'));
    draft.stats.forEach((stat, index) => {
      const card = $('section', 'editor-card');
      card.append($('h3', '', stat.name || '새 수치'));
      card.append(grid(
        input('표시 이름', stat.name, value => { stat.name = value; }),
        idInput('연결용 ID', stat, 'stat')
      ));
      card.append(grid(
        input('시작값', stat.initial, value => { stat.initial = value; }, { type: 'number', step: 'any' }),
        input('최솟값', stat.min, value => { stat.min = value; }, { type: 'number', step: 'any' }),
        input('최댓값', stat.max, value => { stat.max = value; }, { type: 'number', step: 'any' }),
        input('색상', stat.color || '#b58e59', value => { stat.color = value; }, { placeholder: '#b58e59', help: '예: #b58e59' })
      ));
      card.append(input('설명', stat.description, value => { stat.description = value; }));
      card.append(button('수치 삭제', () => {
        if (!confirm('이 수치를 삭제할까요? 이 ID를 사용하는 효과와 조건도 수정해야 합니다.')) return;
        draft.stats.splice(index, 1); mark(); render();
      }, 'danger'));
      content.append(card);
    });
    content.append(button('＋ 수치 추가', () => {
      draft.stats.push({ id: allocate('stat'), name: '새 수치', initial: 50, min: 0, max: 100, color: '#b58e59', description: '' });
      mark(); render();
    }));
  }

  function renderFlags(content) {
    const draft = current.draft;
    content.append($('h2', '', '선택 기록'));
    content.append($('p', 'muted', '의회를 세웠다, 차관을 받았다처럼 과거의 결정을 참/거짓으로 기억합니다. 선택지에서 바꾸고 사건·선택지·엔딩 조건에서 읽습니다.'));
    draft.flags.forEach((flag, index) => {
      const card = $('section', 'editor-card');
      card.append(grid(
        input('표시 이름', flag.name, value => { flag.name = value; }),
        idInput('연결용 ID', flag, 'flag')
      ));
      card.append(checkbox('처음부터 이 기록을 보유함', flag.initial, value => { flag.initial = value; }));
      card.append(button('기록 삭제', () => {
        if (!confirm('이 기록을 삭제할까요? 이 ID를 사용하는 선택지와 조건도 수정해야 합니다.')) return;
        draft.flags.splice(index, 1); mark(); render();
      }, 'danger'));
      content.append(card);
    });
    content.append(button('＋ 선택 기록 추가', () => {
      draft.flags.push({ id: allocate('flag'), name: '새 선택 기록', initial: false }); mark(); render();
    }));
  }

  function move(list, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= list.length) return index;
    [list[index], list[target]] = [list[target], list[index]];
    mark();
    return target;
  }

  function renderEventList(content) {
    const draft = current.draft;
    content.append($('h2', '', '사건과 선택지'));
    content.append($('p', 'muted', '사건 목록의 순서는 편집용입니다. 실제 진행은 각 사건·선택지의 “다음 장면” 연결로 결정됩니다.'));
    const list = $('div', 'editor-list');
    draft.events.forEach((event, index) => {
      list.append(button((index + 1) + '. ' + (event.title || '제목 없음') + ' · ' + event.id,
        () => { current.eventIndex = index; render(); }, index === current.eventIndex ? 'secondary selected' : 'secondary'));
    });
    const toolbar = $('div', 'toolbar');
    toolbar.append(button('＋ 사건 추가', () => {
      draft.events.push({ id: allocate('event'), title: '새 사건', chapter: '', date: '', speaker: '', body: '', when: [], next: 'END',
        choices: [{ text: '다음으로', description: '', effects: {}, setFlags: {}, when: [] }] });
      if (!draft.start) draft.start = draft.events[draft.events.length - 1].id;
      current.eventIndex = draft.events.length - 1;
      mark(); render();
    }));
    content.append(list, toolbar);
    if (!draft.events.length) { content.append(notice('사건을 추가한 뒤 기본 설정에서 시작 사건을 지정해 주세요.')); return; }
    current.eventIndex = Math.max(0, Math.min(current.eventIndex, draft.events.length - 1));
    const index = current.eventIndex;
    const event = draft.events[index];
    const controls = $('div', 'toolbar');
    const up = button('↑ 위로', () => { current.eventIndex = move(draft.events, index, -1); render(); });
    const down = button('↓ 아래로', () => { current.eventIndex = move(draft.events, index, 1); render(); });
    up.disabled = index === 0;
    down.disabled = index === draft.events.length - 1;
    controls.append(up, down, button('사건 복제', () => {
      const duplicate = copy(event);
      duplicate.id = allocate('event');
      duplicate.title = (duplicate.title || '사건') + ' (복사)';
      draft.events.splice(index + 1, 0, duplicate);
      current.eventIndex = index + 1; mark(); render();
    }), button('사건 삭제', () => {
      if (!confirm('이 사건을 삭제할까요? 시작 사건과 다른 사건의 연결도 확인해 주세요.')) return;
      draft.events.splice(index, 1);
      if (!draft.events.length) { draft.start = null; draft.draft = true; }
      mark(); render();
    }, 'danger'));
    const details = section('사건 본문');
    details.append(controls, grid(
      input('제목', event.title, value => { event.title = value; }),
      idInput('연결용 ID', event, 'event')
    ), grid(
      input('장 / 부', event.chapter, value => { event.chapter = value; }),
      input('날짜 / 시점', event.date, value => { event.date = value; }),
      input('화자 / 보고자', event.speaker, value => { event.speaker = value; })
    ), input('본문', event.body, value => { event.body = value; }, { multiline: true, rows: 7 }),
    select('기본 다음 장면', event.next, eventOptions(false), value => { event.next = value; },
      { help: '선택지에 별도 연결이 있으면 선택지 설정을 우선합니다. 등장 조건을 만족하지 않은 사건은 이 기본 연결을 따라 건너뜁니다.' }));
    if (!Array.isArray(event.when)) event.when = [];
    details.append(builder(event.when, '사건 등장 조건'));
    if (draft.mode === 'reign') details.append(select('치세 카드 분야', event.part || '', [['', '분야 미지정'], ...(draft.reign?.parts || []).map(part => [part.id, part.name])], value => { if (value) event.part = value; else delete event.part; }, { help: '치세·연도 탭의 해당 연도 사건 목록에도 이 사건을 넣으세요. 치세에서는 일반 next 연결 대신 분야별 카드를 고릅니다.' }));
    content.append(details);
    renderChoices(content, event);
  }

  function renderChoices(content, event) {
    const choices = section('선택지', '수치 효과는 증가·감소량입니다. 예: 15는 +15, -10은 -10입니다. 선택 기록은 “유지”를 고르면 기존 값을 그대로 둡니다.');
    event.choices.forEach((choice, index) => {
      const card = $('section', 'editor-card');
      card.append($('h4', '', '선택지 ' + (index + 1)));
      card.append(input('버튼에 표시할 문장', choice.text, value => { choice.text = value; }));
      card.append(input('보충 설명', choice.description, value => { choice.description = value; }, { multiline: true, rows: 2 }));
      card.append(input('선택 후 결과 본문', choice.result, value => { choice.result = value; upgrade(current.draft); }, { multiline: true, rows: 3 }),
        checkbox('실제 역사에서 선택한 경로로 표시', choice.historical === true, value => { choice.historical = value; upgrade(current.draft); }, '표시된 선택지만 역사 비교의 기준으로 사용합니다. 가상의 선택을 실제 역사로 표시하지 마세요.'));
      if (!choice.effects || typeof choice.effects !== 'object') choice.effects = {};
      if (!choice.setFlags || typeof choice.setFlags !== 'object') choice.setFlags = {};
      const effects = $('div', 'effects-grid');
      current.draft.stats.forEach(stat => effects.append(input(stat.name + ' 변화', choice.effects[stat.id] || 0, value => {
        if (value === 0) delete choice.effects[stat.id];
        else choice.effects[stat.id] = value;
      }, { type: 'number', compact: true, step: 'any' })));
      card.append(effects);
      const flags = $('div', 'effects-grid');
      current.draft.flags.forEach(flag => flags.append(select(flag.name,
        Object.prototype.hasOwnProperty.call(choice.setFlags, flag.id) ? String(choice.setFlags[flag.id]) : '',
        [['', '유지'], ['true', '참으로 기록'], ['false', '거짓으로 기록']], value => {
          if (value === '') delete choice.setFlags[flag.id];
          else choice.setFlags[flag.id] = value === 'true';
        }, { compact: true })));
      card.append(flags);
      const knownStats = new Set(current.draft.stats.map(stat => stat.id));
      const knownFlags = new Set(current.draft.flags.map(flag => flag.id));
      const orphans = [
        ...Object.keys(choice.effects).filter(key => !knownStats.has(key)).map(key => ['effects', key]),
        ...Object.keys(choice.setFlags).filter(key => !knownFlags.has(key)).map(key => ['setFlags', key])
      ];
      if (orphans.length) {
        const stale = $('div', 'notice');
        stale.append($('p', 'small', '삭제되었거나 이름이 바뀐 ID가 남아 있습니다. 제거하거나 JSON에서 수정하세요.'));
        orphans.forEach(([kind, key]) => stale.append(button(key + ' 연결 제거', () => {
          delete choice[kind][key]; mark(); render();
        }, 'danger')));
        card.append(stale);
      }
      card.append(select('선택 후 다음 장면', choice.next || '', eventOptions(true), value => {
        if (value) choice.next = value;
        else delete choice.next;
      }));
      if (!Array.isArray(choice.when)) choice.when = [];
      card.append(builder(choice.when, '선택 가능한 조건', '조건을 모두 만족할 때 이 선택지를 고를 수 있습니다. 충족하지 못한 선택지는 플레이 화면에서 잠깁니다.'));
      card.append(territoryEditor(current.draft, choice, mark));
      const toolbar = $('div', 'toolbar');
      const up = button('↑', () => { move(event.choices, index, -1); render(); });
      const down = button('↓', () => { move(event.choices, index, 1); render(); });
      up.disabled = index === 0;
      down.disabled = index === event.choices.length - 1;
      toolbar.append(up, down, button('복제', () => {
        event.choices.splice(index + 1, 0, copy(choice)); mark(); render();
      }), button('선택지 삭제', () => {
        event.choices.splice(index, 1); mark(); render();
      }, 'danger'));
      card.append(toolbar);
      choices.append(card);
    });
    choices.append(button('＋ 선택지 추가', () => {
      event.choices.push({ text: '새 선택지', description: '', effects: {}, setFlags: {}, when: [] });
      mark(); render();
    }));
    content.append(choices);
  }

  function renderRandomEvents(content) {
    const draft = current.draft;
    const rules = draft.randomEvents || [];
    content.append($('h2', '', '돌발 사건'));
    content.append(notice('일반 사건에서 선택하면 즉시 종료 엔딩을 먼저 판정하고, 게임이 계속될 때 돌발 사건을 추첨합니다. 조건을 만족하는 규칙을 우선순위가 높은 순서로 판정하며 한 번에 하나만 발생합니다. 확률은 매 선택마다 독립적으로 판정합니다. 중간 사건에 대응하는 동안에는 새 돌발 사건을 추첨하지 않습니다.'));
    content.append($('p', 'muted', '돌발 사건은 일반 사건과 같은 본문·선택지를 사용합니다. 대응 사건의 다음 장면을 RETURN으로 지정하면, 대응을 마친 뒤 중단했던 원래 흐름으로 돌아갑니다.'));
    const list = $('div', 'editor-list');
    rules.forEach((rule, index) => list.append(button((index + 1) + '. ' + (rule.title || '이름 없는 규칙') + ' · ' + rule.id,
      () => { current.randomIndex = index; render(); }, index === current.randomIndex ? 'secondary selected' : 'secondary')));
    const toolbar = $('div', 'toolbar');
    const addRule = button('＋ 돌발 사건 규칙 추가', () => {
      if (!draft.randomEvents) draft.randomEvents = [];
      draft.randomEvents.push({ id: allocate('random'), title: '새 돌발 사건 규칙', eventId: (draft.events.find(event => event.next === 'RETURN') || draft.events[0]).id,
        when: [], chance: 25, priority: 10, once: true, cooldown: 0 });
      current.randomIndex = draft.randomEvents.length - 1;
      mark(); render();
    });
    addRule.disabled = !draft.events.length;
    const protest = button('민심 시위 예시 추가', () => {
      const existing = (draft.randomEvents || []).findIndex(rule => rule.id === 'people_protest');
      if (existing >= 0) { current.randomIndex = existing; render(); return; }
      const eventId = allocate('protest');
      const statIds = new Set(draft.stats.map(stat => stat.id));
      const effects = values => Object.fromEntries(Object.entries(values).filter(([key]) => statIds.has(key)));
      draft.events.push({
        id: eventId, title: '광장에 모인 사람들', chapter: '돌발 사건', date: '', speaker: '시민 대표',
        body: '물가와 생활고를 견디지 못한 사람들이 관청 앞 광장을 메웠다. 대표들은 당장 대책을 내놓으라고 요구하고, 군 지휘부는 해산 명령을 기다리고 있다.\n\n“오늘도 기다리라는 말씀만 하실 겁니까?”',
        when: [], next: 'RETURN', choices: [
          { text: '구호 예산을 풀고 주민들과 협상한다.', description: '당장의 구호와 대화에 힘을 쏟는다.', when: [], effects: effects({ people: 10, treasury: -8, army: -2 }), setFlags: {} },
          { text: '병력을 투입해 광장을 해산한다.', description: '시위를 진압하고 지휘부의 요구를 받아들인다.', when: [], effects: effects({ people: -10, treasury: -2, army: 6 }), setFlags: {} },
          { text: '대표자들과 공개 면담을 연다.', description: '대화를 시작하고 해결책을 함께 찾는다.', when: [], effects: effects({ people: 4, army: -1 }), setFlags: {} }
        ]
      });
      if (!draft.randomEvents) draft.randomEvents = [];
      const taken = new Set([draft.id, ...draft.stats.map(item => item.id), ...draft.flags.map(item => item.id),
        ...draft.events.map(item => item.id), ...draft.endings.map(item => item.id), ...draft.randomEvents.map(item => item.id)]);
      draft.randomEvents.push({ id: taken.has('people_protest') ? allocate('people_protest') : 'people_protest',
        title: '민심 악화에 따른 시위', eventId, when: [{ kind: 'stat', key: 'people', op: 'lte', value: 30 }],
        chance: 30, priority: 100, once: false, cooldown: 2 });
      current.randomIndex = draft.randomEvents.length - 1;
      mark(); render();
    });
    const hasPeople = draft.stats.some(stat => stat.id === 'people');
    protest.disabled = !hasPeople || !draft.events.length;
    toolbar.append(addRule, protest);
    content.append(list, toolbar);
    if (addRule.disabled) content.append($('p', 'small muted', '규칙이 연결할 사건이 필요합니다. 사건·선택지 탭이나 분기 흐름도에서 일반 사건을 먼저 추가하세요.'));
    content.append($('p', 'small muted', !hasPeople
      ? '시위 예시를 넣으려면 수치 탭에서 연결용 ID가 people인 수치를 먼저 추가하세요.'
      : !draft.events.length ? '시위 대응 후 돌아갈 원래 이야기가 필요합니다. 일반 사건을 먼저 추가하세요.'
      : '예시: 민심(people) 30 이하에서 30% 확률로 발생합니다. 발생 뒤 대응 선택을 포함해 선택 2회 동안 다시 발생하지 않습니다. 재정·군부 효과는 해당 수치가 있을 때만 추가합니다.'));
    if (!rules.length) return;
    current.randomIndex = Math.max(0, Math.min(current.randomIndex, rules.length - 1));
    const index = current.randomIndex;
    const rule = rules[index];
    const details = section('돌발 사건 규칙 편집');
    const controls = $('div', 'toolbar');
    const up = button('↑ 위로', () => { current.randomIndex = move(rules, index, -1); render(); });
    const down = button('↓ 아래로', () => { current.randomIndex = move(rules, index, 1); render(); });
    up.disabled = index === 0;
    down.disabled = index === rules.length - 1;
    controls.append(up, down, button('규칙 복제', () => {
      const duplicate = copy(rule);
      duplicate.id = allocate('random'); duplicate.title = (duplicate.title || '돌발 사건') + ' (복사)';
      rules.splice(index + 1, 0, duplicate); current.randomIndex = index + 1;
      mark(); render();
    }), button('규칙 삭제', () => {
      rules.splice(index, 1);
      mark(); render();
    }, 'danger'));
    details.append(controls, grid(
      input('규칙 이름', rule.title, value => { rule.title = value; }),
      input('연결용 ID', rule.id, value => { rule.id = value; })
    ), select('발생할 사건', rule.eventId, draft.events.map(event => [event.id, event.id + ' · ' + event.title]), value => { rule.eventId = value; },
      { help: '이 사건이 원래 흐름 사이에 등장합니다. 대응 후 돌아오려면 해당 사건의 기본 다음 장면을 RETURN으로 설정하세요.' }),
    grid(
      input('발생 확률 (%)', rule.chance, value => { rule.chance = value; }, { type: 'number', min: 0, max: 100, step: 'any', help: '100%는 조건 충족 시 확정 발생, 0%는 발생하지 않음입니다.' }),
      input('우선순위', rule.priority, value => { rule.priority = value; }, { type: 'number', step: 'any', help: '숫자가 같으면 목록에서 앞선 규칙부터 판정합니다.' }),
      input('재발동 대기 (선택 횟수)', rule.cooldown === undefined ? 0 : rule.cooldown, value => { rule.cooldown = value; }, { type: 'number', min: 0, step: '1', help: '발생 이후의 선택 횟수이며 대응 사건에서 고르는 선택도 포함합니다. 0이면 복귀 후 다음 본편 선택에서 재추첨할 수 있습니다.' })
    ), checkbox('한 플레이에서 한 번만 발생', rule.once !== false, value => { rule.once = value; }));
    const editEvent = button('연결된 사건의 본문·선택지 편집', () => {
      const eventIndex = draft.events.findIndex(event => event.id === rule.eventId);
      if (eventIndex >= 0) { current.eventIndex = eventIndex; navigate('events'); }
    });
    editEvent.disabled = !draft.events.some(event => event.id === rule.eventId);
    details.append(editEvent);
    if (!Array.isArray(rule.when)) rule.when = [];
    details.append(builder(rule.when, '돌발 사건 발생 조건', '아래 조건과 연결된 사건의 등장 조건을 모두 만족할 때만 추첨합니다. 조건이 없으면 대기 횟수와 1회 제한에 따라 항상 추첨 대상이 됩니다.'));
    content.append(details);
  }

  function renderEndings(content) {
    const draft = current.draft;
    content.append($('h2', '', '엔딩'));
    content.append(notice('조건을 만족한 엔딩 중 우선순위 숫자가 가장 높은 결말을 선택합니다. 숫자가 같으면 목록에서 앞선 엔딩이 우선합니다. 일치하는 결말이 없으면 기본 엔딩으로 마칩니다.'));
    content.append(select('기본 엔딩', draft.defaultEnding || '', draft.endings.length ? draft.endings.map(ending => [ending.id, ending.title + ' (' + ending.id + ')']) : [['', '엔딩을 먼저 추가하세요']], value => { draft.defaultEnding = value || null; },
      { help: '기본 엔딩은 조건을 비우고 “조건 충족 시 즉시 종료”를 꺼야 합니다. 다른 결말에 해당하지 않을 때 도달하는 결말입니다.' }));
    const list = $('div', 'editor-list');
    draft.endings.forEach((ending, index) => list.append(button((index + 1) + '. ' + (ending.title || '제목 없음') + ' · ' + ending.id,
      () => { current.endingIndex = index; render(); }, index === current.endingIndex ? 'secondary selected' : 'secondary')));
    content.append(list, button('＋ 엔딩 추가', () => {
      draft.endings.push({ id: allocate('ending'), title: '새 엔딩', kind: 'mixed', summary: '', body: '', priority: 10, immediate: false, when: [] });
      if (!draft.defaultEnding) draft.defaultEnding = draft.endings[draft.endings.length - 1].id;
      current.endingIndex = draft.endings.length - 1; mark(); render();
    }));
    const armyCoup = button('군부 쿠데타 예시 추가', () => {
      const existingIndex = draft.endings.findIndex(item => item.id === 'army_coup');
      if (existingIndex >= 0) { current.endingIndex = existingIndex; render(); return; }
      const taken = new Set([draft.id, ...draft.stats.map(item => item.id), ...draft.flags.map(item => item.id),
        ...draft.events.map(item => item.id), ...draft.endings.map(item => item.id), ...(draft.randomEvents || []).map(item => item.id)]);
      draft.endings.push({
        id: taken.has('army_coup') ? allocate('army_coup') : 'army_coup',
        title: '새벽의 군홧발', kind: 'bad', summary: '군부의 불만이 쿠데타로 이어져 정부가 전복되었다.',
        body: '새벽 종이 울리기 전에 관청의 문이 열렸다. 복도를 채운 군홧발 소리에 경비병들은 총을 내려놓았다. 장교들이 책상 위에 계엄 포고문을 놓았다.\n\n정부는 군의 신뢰를 잃었다. 당신의 인장은 회수되었고, 첫 명령은 이미 군사회의의 이름으로 내려가고 있었다. 나라의 내일을 정하는 자리에 당신은 더 이상 앉아 있지 않았다.',
        when: [{ kind: 'stat', key: 'army', op: 'lte', value: 20 }], priority: 900, immediate: true, chance: 25
      });
      current.endingIndex = draft.endings.length - 1;
      mark(); render();
    });
    armyCoup.disabled = !draft.stats.some(stat => stat.id === 'army');
    content.append(armyCoup, $('p', 'small muted', armyCoup.disabled
      ? '군부 쿠데타 예시를 넣으려면 수치 탭에서 연결용 ID가 army인 수치를 먼저 추가하세요.'
      : '군부 수치(army)가 20 이하이면 매 선택 후 25% 확률로 종료하는 예시입니다. 기존 army_coup 엔딩이 있으면 그 엔딩을 엽니다.'));
    if (!draft.endings.length) return;
    current.endingIndex = Math.max(0, Math.min(current.endingIndex, draft.endings.length - 1));
    const index = current.endingIndex;
    const ending = draft.endings[index];
    if (!ending.immediate && Object.prototype.hasOwnProperty.call(ending, 'chance')) {
      delete ending.chance;
      mark();
    }
    const details = section('결말 편집');
    const toolbar = $('div', 'toolbar');
    const up = button('↑ 위로', () => { current.endingIndex = move(draft.endings, index, -1); render(); });
    const down = button('↓ 아래로', () => { current.endingIndex = move(draft.endings, index, 1); render(); });
    up.disabled = index === 0;
    down.disabled = index === draft.endings.length - 1;
    toolbar.append(up, down, button('엔딩 복제', () => {
      const duplicate = copy(ending); duplicate.id = allocate('ending'); duplicate.title += ' (복사)';
      draft.endings.splice(index + 1, 0, duplicate); current.endingIndex = index + 1; mark(); render();
    }), button('엔딩 삭제', () => {
      if (!confirm('이 엔딩을 삭제할까요? 기본 엔딩으로 지정되어 있다면 새 기본 엔딩을 선택해야 합니다.')) return;
      draft.endings.splice(index, 1);
      if (!draft.endings.length) { draft.defaultEnding = null; draft.draft = true; }
      mark(); render();
    }, 'danger'));
    details.append(toolbar, grid(
      input('엔딩 제목', ending.title, value => { ending.title = value; }),
      idInput('연결용 ID', ending, 'ending')
    ), grid(
      select('결말 분위기', ending.kind, [['good', '밝은 결말'], ['mixed', '복합적인 결말'], ['bad', '어두운 결말']], value => { ending.kind = value; }),
      input('우선순위', ending.priority, value => { ending.priority = value; }, { type: 'number', step: '1' })
    ), input('짧은 요약', ending.summary, value => { ending.summary = value; }),
    input('결말 본문', ending.body, value => { ending.body = value; }, { multiline: true, rows: 7 }),
    checkbox('조건 충족 시 즉시 종료', ending.immediate, value => {
      ending.immediate = value;
      if (value && ending.chance === undefined) ending.chance = 100;
      if (!value) delete ending.chance;
      mark();
      render();
    }),
    $('p', 'small muted', '즉시 종료를 켜면 매 선택의 수치 변화와 선택 기록을 적용한 직후 조건을 검사합니다. 끄면 이야기가 END에 도달했을 때 검사합니다.'));
    if (ending.immediate) {
      details.append(input('조건 충족 시 매 선택 후 발생 확률 (%)', ending.chance === undefined ? 100 : ending.chance,
        value => { ending.chance = value; }, { type: 'number', min: 0, max: 100, step: 'any',
          help: '100%는 조건을 만족하면 확정 종료, 0%는 발생하지 않음입니다. 25%라면 조건이 유지되는 동안 선택할 때마다 독립적으로 25%를 판정합니다. 확률은 매번 더해지지 않습니다.' }));
    }
    if (!Array.isArray(ending.when)) ending.when = [];
    details.append(builder(ending.when, '엔딩 조건'));
    content.append(details);
  }

  async function parseJSON(text) {
    let value;
    try { value = JSON.parse(text); }
    catch (error) { return { errors: ['JSON 문법 오류: ' + error.message], warnings: [], value: null }; }
    try {
      if (needsTemplate(value)) showReport({ errors: [], warnings: [] }, '선택한 지도의 파일을 불러오는 중입니다. 현재 초안은 준비가 끝난 뒤 반영합니다.');
      await ensureTemplate(value);
    }
    catch (error) { return { errors: ['지도 파일을 불러오지 못했습니다. 편집 내용은 유지했습니다. 다시 시도해 주세요.\n' + error.message], warnings: [], value: null }; }
    const report = validation(value);
    return { ...report, value };
  }

  async function acceptJSON(redraw) {
    const owner = current, text = owner.jsonBuffer;
    const result = await parseJSON(text);
    if (current !== owner || owner.jsonBuffer !== text) return false;
    if (result.errors.length) { showReport(result); return false; }
    cancelMapPreparation();
    current.draft = copy(result.value);
    current.jsonDirty = false;
    current.dirty = true;
    if (redraw) render();
    showReport(result, 'JSON 내용을 편집 초안에 반영했습니다. 게임에 넣으려면 “적용하고 새 게임”을 누르세요.');
    return true;
  }

  function renderJSON(content) {
    content.append($('h2', '', 'JSON 직접 편집'));
    content.append(notice('전체 시나리오를 한 번에 수정하거나 다른 편집기로 옮길 수 있습니다. “JSON을 편집 초안에 반영”을 누르면 문법과 연결을 검사합니다. JSON 내보내기는 현재 초안을 파일로 저장합니다.'));
    if (!current.jsonDirty) current.jsonBuffer = JSON.stringify(current.draft, null, 2);
    const wrap = $('label', 'field');
    wrap.append($('span', '', '전체 시나리오 JSON'));
    const area = $('textarea', 'json-editor');
    area.rows = 26;
    area.spellcheck = false;
    area.value = current.jsonBuffer;
    area.addEventListener('input', () => { current.jsonBuffer = area.value; current.jsonDirty = true; mark(); });
    wrap.append(area);
    content.append(wrap);
    const toolbar = $('div', 'toolbar');
    toolbar.append(button('JSON을 편집 초안에 반영', () => acceptJSON(true), 'primary'), button('JSON 편집 취소', () => {
      if (current.jsonDirty && !confirm('이 화면에서 수정한 JSON을 버리고 편집 초안으로 되돌릴까요?')) return;
      current.jsonDirty = false; render();
    }));
    content.append(toolbar);
  }

  async function exportJSON() {
    const owner = current, buffer = owner.jsonBuffer;
    let text;
    if (current.jsonDirty) {
      const result = await parseJSON(buffer);
      if (current !== owner || owner.jsonBuffer !== buffer) return;
      if (result.errors.length) { showReport(result); return; }
      text = JSON.stringify(result.value, null, 2);
    } else {
      const result = validation(current.draft);
      if (result.errors.length) { showReport(result); return; }
      text = JSON.stringify(current.draft, null, 2);
    }
    const blob = new Blob([text + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = $('a');
    anchor.href = url;
    const safeID = String(current.draft.id || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
    anchor.download = safeID + '.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showReport({ errors: [], warnings: [] }, '현재 편집 초안을 JSON으로 내보냈습니다. 게임에도 적용하려면 “적용하고 새 게임”을 누르세요.');
  }

  function importJSON(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showReport({ errors: ['JSON 파일은 5MB 이하로 준비해 주세요.'], warnings: [] }); return; }
    const owner = current;
    const reader = new FileReader();
    const request = owner.importRequest = (owner.importRequest || 0) + 1;
    reader.addEventListener('load', async () => {
      if (current !== owner) return;
      const result = await parseJSON(String(reader.result).replace(/^\uFEFF/, ''));
      if (current !== owner || owner.importRequest !== request) return;
      if (result.errors.length) { showReport(result); return; }
      if (current.dirty && !confirm('가져온 파일로 현재 편집 초안을 교체할까요? 아직 내보내지 않은 수정은 사라집니다.')) return;
      cancelMapPreparation();
      current.draft = copy(result.value);
      current.jsonDirty = false;
      current.eventIndex = 0;
      current.endingIndex = 0;
      current.randomIndex = 0;
      mark(); render();
      showReport(result, '파일을 편집 초안으로 가져왔습니다. 게임에 넣으려면 “적용하고 새 게임”을 누르세요.');
    });
    reader.addEventListener('error', () => {
      if (current === owner) showReport({ errors: ['파일을 읽지 못했습니다. 다시 선택해 주세요.'], warnings: [] });
    });
    reader.readAsText(file, 'UTF-8');
  }

  async function check() {
    if (current.jsonDirty) {
      const owner = current, text = owner.jsonBuffer;
      const parsed = await parseJSON(text);
      if (current !== owner || owner.jsonBuffer !== text) return;
      if (parsed.errors.length) { showReport(parsed); return; }
      showReport(playReport(parsed.value), '플레이 검사를 통과했습니다. JSON 내용은 아직 편집 초안에 반영하지 않았습니다.');
      return;
    }
    showReport(playReport(current.draft), '플레이 검사를 통과했습니다. “적용하고 새 게임”으로 실행할 수 있습니다.');
  }

  async function apply() {
    if (current.jsonDirty && !await acceptJSON(false)) return;
    const result = playReport(current.draft);
    if (result.errors.length) { showReport(result); return; }
    const owner = current;
    try {
      const playable = copy(owner.draft);
      delete playable.draft;
      owner.onApply(playable);
      owner.dirty = false;
      close(true);
    } catch (error) {
      showReport({ errors: ['시나리오 적용 중 오류가 발생했습니다: ' + error.message], warnings: [] });
    }
  }

  async function saveDraft() {
    if (current.jsonDirty && !await acceptJSON(false)) return;
    const saved = copy(current.draft);
    saved.draft = true;
    const result = validation(saved);
    if (result.errors.length) { showReport(result); return; }
    const owner = current;
    try {
      owner.onApply(saved);
      owner.dirty = false;
      close(true);
    } catch (error) {
      showReport({ errors: ['초안 저장 중 오류가 발생했습니다: ' + error.message], warnings: [] });
    }
  }

  function clearAll() {
    if (!confirm('사건·선택지·연결·돌발 사건 규칙·수치·선택 기록·엔딩을 전부 삭제하고 빈 초안으로 시작할까요? 삭제 직전 내용은 이 페이지를 새로고침하기 전까지 한 번 되돌릴 수 있습니다.')) return;
    resetUndo = { draft: copy(current.draft), eventIndex: current.eventIndex, endingIndex: current.endingIndex,
      randomIndex: current.randomIndex, jsonBuffer: current.jsonBuffer, jsonDirty: current.jsonDirty, page: current.page };
    cancelMapPreparation();
    current.draft = GameEngine.createBlankScenario();
    current.eventIndex = 0;
    current.endingIndex = 0;
    current.randomIndex = 0;
    current.jsonBuffer = '';
    current.jsonDirty = false;
    current.page = 'flowchart';
    mark(); render();
    showReport({ errors: [], warnings: [] }, '모든 내용을 비운 초안입니다. 흐름도에서 첫 사건을 추가하거나 수치·엔딩을 작성하세요. “초안 저장”을 누르면 빈 상태도 보관됩니다.');
  }

  function undoClear() {
    if (!resetUndo) return;
    const hasNewContent = current.jsonDirty || JSON.stringify(current.draft) !== JSON.stringify(GameEngine.createBlankScenario());
    if (hasNewContent && !confirm('전체 삭제 직전의 내용으로 되돌릴까요? 삭제 후 새로 작성한 내용은 교체됩니다.')) return;
    cancelMapPreparation();
    current.draft = copy(resetUndo.draft);
    current.eventIndex = resetUndo.eventIndex;
    current.endingIndex = resetUndo.endingIndex;
    current.randomIndex = resetUndo.randomIndex;
    current.jsonBuffer = resetUndo.jsonBuffer;
    current.jsonDirty = resetUndo.jsonDirty;
    current.page = resetUndo.page;
    resetUndo = null;
    mark(); render();
    showReport({ errors: [], warnings: [] }, '전체 삭제 직전의 편집 내용을 복원했습니다.');
  }

  async function navigate(page) {
    if (current.page === 'json' && current.jsonDirty && page !== 'json') {
      if (!await acceptJSON(false)) return;
    }
    current.page = page;
    render();
  }

  async function runMapAction(action, { saved = false, closeAfter = false } = {}) {
    const owner = current;
    if (!owner?.mapOnly || typeof owner.mapActions?.[action] !== 'function') return;
    try {
      let result = owner.mapActions[action](copy(owner.draft));
      if (result && typeof result.then === 'function') result = await result;
      if (result === false) return;
      if (current !== owner) return;
      if (saved) owner.dirty = false;
      if (closeAfter) close(true);
      else if (typeof result === 'string') showReport({ errors: [], warnings: [] }, result);
    } catch (error) {
      if (current === owner) showReport({ errors: [error.message || '지도 작업을 완료하지 못했습니다.'], warnings: [] });
    }
  }

  async function importMapJSON(file) {
    const owner = current;
    if (!file || !owner?.mapOnly) return;
    const request = owner.importRequest = (owner.importRequest || 0) + 1;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('지도 JSON 파일은 5MB 이하로 준비해 주세요.');
      const text = await file.text();
      if (current !== owner || owner.importRequest !== request) return;
      await owner.mapActions.importText(text);
    } catch (error) {
      if (current === owner) showReport({ errors: [error.message || '지도 JSON을 읽지 못했습니다.'], warnings: [] });
    }
  }

  function renderMapOnly(content) {
    const draft = current.draft;
    content.classList.add('map-maker-content');
    const workspace = $('div', 'map-maker-workspace'), settings = $('aside', 'map-maker-settings'), board = $('section', 'map-maker-board');
    settings.setAttribute('aria-label', '지도 설정과 지역 편집');
    board.setAttribute('aria-label', '편집 중인 지도');
    settings.append(input('지도 제목', draft.title, value => { draft.title = value; }, { maxLength: 120 }));
    settings.append(input('지도 설명', draft.description, value => { draft.description = value; }, { multiline: true, rows: 2, maxLength: 1000, help: '시대와 가정, 수정한 국경 등을 적어 두세요.' }));
    const controls = $('div', 'map-maker-map-settings');
    renderMap(controls);
    // Keep the same live nodes and closures, but give the map its own column.
    // Editing metadata or scrolling settings must never hide the map board.
    const heading = controls.querySelector('h2'), preview = controls.querySelector('.v2-editor-map');
    if (heading) { const introduction = heading.nextElementSibling; heading.remove(); if (introduction?.matches('p.notice')) introduction.remove(); }
    if (preview) board.append(preview);
    else board.append(notice('왼쪽에서 지역과 시대를 선택하고 “지도 준비”를 누르세요.'));
    settings.append(controls);
    workspace.append(settings, board);
    content.append(workspace);
  }

  function render() {
    if (!current) return;
    if (current.flowchartCleanup) { current.flowchartCleanup(); current.flowchartCleanup = null; }
    current.dialog.classList.toggle('flowchart-mode', current.page === 'flowchart' && !current.mapOnly);
    current.dialog.classList.toggle('map-maker-mode', Boolean(current.mapOnly));
    const root = document.getElementById('editor-root');
    root.replaceChildren();
    const shell = $('div', 'editor-shell');
    const top = $('header', 'editor-top');
    const title = $('div');
    title.append($('h2', '', current.mapOnly ? '지도 작업실' : '시나리오 작업실'), $('p', 'small muted', current.mapOnly ? '지도만 만들고 저장하거나 갤러리에 공유하세요. 현재 플레이 중인 이야기는 그대로 보관됩니다.' : '작성 중에는 초안 저장, 완성하면 적용하고 새 게임을 사용하세요. 수정한 파일은 JSON으로 따로 보관해 두세요.'));
    const tools = $('div', 'toolbar');
    const fileInput = $('input');
    fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
    fileInput.addEventListener('change', () => { if (current.mapOnly) importMapJSON(fileInput.files[0]); else importJSON(fileInput.files[0]); fileInput.value = ''; });
    if (current.mapOnly) tools.append(button('지도 JSON 가져오기', () => fileInput.click()), button('지도 JSON 내보내기', () => runMapAction('export')), fileInput, button('새 지도', () => runMapAction('new')));
    else {
      tools.append(button('JSON 가져오기', () => fileInput.click()), button('JSON 내보내기', exportJSON), fileInput, button('전체 삭제', clearAll, 'danger'));
      if (resetUndo) tools.append(button('전체 삭제 되돌리기', undoClear));
    }
    top.append(title, tools);
    const nav = $('nav', 'editor-nav');
    nav.setAttribute('aria-label', '시나리오 편집 탭');
    (current.mapOnly ? [] : tabs).forEach(([id, label]) => {
      const tab = button(label, () => navigate(id), current.page === id ? 'secondary selected' : 'secondary');
      if (current.page === id) tab.setAttribute('aria-current', 'page');
      nav.append(tab);
    });
    const content = $('main', 'editor-content' + (current.page === 'flowchart' ? ' flowchart-content' : ''));
    if (current.mapOnly) renderMapOnly(content);
    else if (current.page !== 'flowchart') {
      ({ overview: renderOverview, stats: renderStats, flags: renderFlags, events: renderEventList, map: renderMap, reign: renderReign, randomEvents: renderRandomEvents, endings: renderEndings, json: renderJSON })[current.page](content);
    }
    const report = $('div', 'notice');
    report.id = 'editor-report'; report.hidden = true; report.setAttribute('role', 'status'); report.setAttribute('aria-live', 'polite');
    const footer = $('footer', 'editor-footer');
    if (current.mapOnly) {
      const share=button('갤러리에 공유', () => runMapAction('share', { saved: true }));
      share.setAttribute('data-community-only','');
      footer.append(button('지도 검사', () => runMapAction('check')), button('지도 저장', () => runMapAction('save', { saved: true }), 'primary'), share, button('이 지도로 시나리오 만들기', () => runMapAction('createScenario', { saved: true, closeAfter: true })), button('닫기', () => close(false)));
    }
    else footer.append(button('검사하기', check), button('초안 저장', saveDraft), button('적용하고 새 게임', apply, 'primary'), button('닫기', () => close(false)));
    shell.append(top);
    if (!current.mapOnly) shell.append(nav);
    shell.append(content, report, footer);
    root.append(shell);
    if (current.page === 'flowchart' && !current.mapOnly) {
      current.flowchartCleanup = ScenarioFlowchart.mount(content, {
        scenario: current.draft,
        onChange: mark,
        onOpenRandomEvents: () => navigate('randomEvents'),
        onOpenReign: () => navigate('reign'),
        onOpenEvent: eventId => {
          const index = current.draft.events.findIndex(event => event.id === eventId);
          if (index >= 0) { current.eventIndex = index; navigate('events'); }
        }
      });
    }
  }

  function close(force) {
    ++openSequence;
    if (!current) { globalThis.MapMaker?.cancelPending?.(); return true; }
    if (!force && current.dirty && !confirm(current.mapOnly ? '아직 저장하지 않은 지도 수정을 닫을까요? 보관하려면 취소하고 “지도 저장” 또는 “지도 JSON 내보내기”를 누르세요.' : '아직 게임에 적용하지 않은 편집 초안을 닫을까요? 보관하려면 취소하고 JSON으로 내보내세요.')) return false;
    globalThis.MapMaker?.cancelPending?.();
    const dialog = current.dialog;
    if (current.flowchartCleanup) current.flowchartCleanup();
    dialog.classList.remove('flowchart-mode', 'map-maker-mode');
    dialog.setAttribute('aria-label', '시나리오 편집');
    current = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    return true;
  }

  function open(scenario, onApply, options = {}) {
    globalThis.MapMaker?.cancelPending?.();
    const request = ++openSequence;
    if (needsTemplate(scenario)) return ensureTemplate(scenario).then(() => request === openSequence ? openReady(scenario, onApply, options) : false);
    return openReady(scenario, onApply, options);
  }

  function openReady(scenario, onApply, options) {
    const report = validation(scenario);
    if (report.errors.length) throw new Error('편집할 시나리오를 확인해 주세요.\n' + report.errors.map(messageText).join('\n'));
    if (typeof onApply !== 'function') throw new Error('시나리오 적용 함수가 없습니다.');
    if (current && !close(false)) return;
    const dialog = document.getElementById('editor-dialog');
    if (!dialog || !document.getElementById('editor-root')) throw new Error('편집기 dialog 요소가 없습니다.');
    current = { draft: copy(scenario), onApply, dialog, dirty: false, page: options.mapOnly ? 'map' : tabs.some(([id]) => id === options.page) ? options.page : 'overview', mapOnly: Boolean(options.mapOnly), mapActions: options.mapActions || {}, eventIndex: 0, endingIndex: 0, randomIndex: 0, reignIndex: 0, mapProvince: null, mapCountry: null, jsonBuffer: '', jsonDirty: false, flowchartCleanup: null };
    dialog.setAttribute('aria-label', current.mapOnly ? '지도 편집' : '시나리오 편집');
    if (!dialog.dataset.editorBound) {
      dialog.dataset.editorBound = 'true';
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    }
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    render();
    (current.mapOnly ? dialog.querySelector('[aria-label="지도 제목"]') : dialog.querySelector('[aria-current="page"]'))?.focus({ preventScroll: true });
    return true;
  }

  globalThis.ScenarioEditor = { open, close: () => close(false), cancelPending: () => { ++openSequence; } };
  globalThis.ScenarioEditorV2 = { upgrade, mapConfig, initialMapState, conditions: conditionsEditor, territory: territoryEditor, rewriteReferences, planMapChange, territoryReferences };
})();
