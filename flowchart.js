/* Offline scenario graph. Scenarios stay plain data; the editor shares its draft. */
(function (root) {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';
  let serial = 0;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const svgElement = (tag, attributes) => {
    const node = document.createElementNS(SVG, tag);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const eventsOf = scenario => Array.isArray(scenario && scenario.events) ? scenario.events.filter(event => event && typeof event === 'object') : [];
  const choicesOf = event => Array.isArray(event.choices) ? event.choices.filter(choice => choice && typeof choice === 'object') : [];
  const rulesOf = scenario => Array.isArray(scenario && scenario.randomEvents) ? scenario.randomEvents.filter(rule => rule && typeof rule === 'object') : [];
  const specialTarget = id => id === 'END' || id === 'RETURN';
  const hasConditions = item => Array.isArray(item.when) && item.when.length > 0;
  const inherited = choice => choice.next === undefined || choice.next === '';
  const isReign = scenario => scenario.schemaVersion === 2 && scenario.mode === 'reign';
  function reignLinks(scenario) {
    const events = eventsOf(scenario), byID = new Map(events.map(event => [event.id, event]));
    const linked = new Set(), pending = rulesOf(scenario).map(rule => rule.eventId);
    while (pending.length) {
      const id = pending.pop(), event = byID.get(id); if (!event || linked.has(id)) continue;
      linked.add(id);
      [event.next, ...choicesOf(event).map(choice => inherited(choice) ? event.next : choice.next)].forEach(next => { if (byID.has(next)) pending.push(next); });
    }
    return linked;
  }

  function addChoice(event) {
    if (!event || !Array.isArray(event.choices) || event.choices.length >= 20) return null;
    const choice = { text: '새 선택지를 입력하세요.', effects: {}, setFlags: {}, when: [] };
    event.choices.push(choice);
    return choice;
  }

  function allocateId(scenario, prefix) {
    const taken = new Set([scenario.id]);
    ['events', 'stats', 'flags', 'endings', 'randomEvents'].forEach(key => (scenario[key] || []).forEach(item => { if (item) taken.add(item.id); }));
    let index = 1;
    while (taken.has(prefix + '_' + index)) index += 1;
    return prefix + '_' + index;
  }

  function addEvent(scenario) {
    if (!scenario || !Array.isArray(scenario.events) || scenario.events.length >= 1000) return null;
    const event = { id: allocateId(scenario, 'event'), title: '새 사건', body: '이 사건의 상황을 입력하세요.', when: [], next: 'END', choices: [] };
    addChoice(event).text = '계속한다.';
    scenario.events.push(event);
    if (scenario.events.length === 1) scenario.start = event.id;
    return event;
  }

  function addRandomRule(scenario, eventId) {
    if (!scenario || (scenario.randomEvents !== undefined && !Array.isArray(scenario.randomEvents)) || !eventsOf(scenario).some(event => event.id === eventId) || (scenario.randomEvents || []).length >= 200) return null;
    const event = eventsOf(scenario).find(item => item.id === eventId);
    const rule = { id: allocateId(scenario, 'random'), title: event.title || '새 돌발 사건', eventId, when: [], chance: 30, priority: 100, once: true, cooldown: 0 };
    if (!Array.isArray(scenario.randomEvents)) scenario.randomEvents = [];
    scenario.randomEvents.push(rule);
    return rule;
  }

  function addRandomEvent(scenario) {
    if (!scenario || !Array.isArray(scenario.events) || (scenario.randomEvents !== undefined && !Array.isArray(scenario.randomEvents)) || scenario.events.length >= 1000 || (scenario.randomEvents || []).length >= 200) return null;
    const event = addEvent(scenario);
    if (!event) return null;
    event.title = '새 돌발 사건';
    event.body = '예기치 않은 일이 발생했습니다. 이 돌발 사건의 상황을 입력하세요.';
    event.next = 'RETURN';
    const rule = addRandomRule(scenario, event.id);
    return { event, rule };
  }

  function removeChoice(event, index) {
    if (!event || !Array.isArray(event.choices) || event.choices.length <= 1 || !Number.isInteger(index) || index < 0 || index >= event.choices.length) return false;
    event.choices.splice(index, 1);
    return true;
  }

  function removeRandomRule(scenario, ruleId) {
    if (!scenario || !Array.isArray(scenario.randomEvents)) return false;
    const index = scenario.randomEvents.findIndex(rule => rule.id === ruleId);
    if (index < 0) return false;
    scenario.randomEvents.splice(index, 1);
    return true;
  }

  function connect(scenario, sourceId, choiceIndex, targetId) {
    const events = eventsOf(scenario);
    const event = events.find(item => item.id === sourceId);
    if (!event || (!specialTarget(targetId) && !events.some(item => item.id === targetId))) return false;
    if (isReign(scenario) && !reignLinks(scenario).has(sourceId)) return false;
    if (choiceIndex === null || choiceIndex === undefined) event.next = targetId;
    else {
      if (!Number.isInteger(choiceIndex) || !Array.isArray(event.choices) || !event.choices[choiceIndex]) return false;
      event.choices[choiceIndex].next = targetId;
    }
    return true;
  }

  function analyze(scenario) {
    const events = eventsOf(scenario);
    const ids = new Set(events.map(event => event.id));
    const edges = [];
    const warnings = [];
    const reign = isReign(scenario), linkedEventIds = reign ? reignLinks(scenario) : new Set(ids);
    const turnCards = new Set((scenario.reign?.turns || []).flatMap(turn => turn.eventIds || []));
    const randomRules = rulesOf(scenario).map(rule => Object.assign({}, rule, { invalid: !ids.has(rule.eventId) }));
    events.forEach(event => {
      if (reign && !linkedEventIds.has(event.id)) return;
      const add = (target, type, extra) => edges.push(Object.assign({ source: event.id, target, type, invalid: !specialTarget(target) && !ids.has(target) }, extra));
      add(event.next, 'default');
      choicesOf(event).forEach((choice, choiceIndex) => add(inherited(choice) ? event.next : choice.next, 'choice', { choiceIndex, inherited: inherited(choice) }));
      if (hasConditions(event)) add(event.next, 'skip');
    });
    const reachable = new Set();
    const pending = reign ? [...turnCards].filter(id => ids.has(id)) : ids.has(scenario.start) ? [scenario.start] : [];
    if (reign || pending.length) randomRules.filter(rule => !rule.invalid && rule.chance !== 0).forEach(rule => pending.push(rule.eventId));
    while (pending.length) {
      const id = pending.pop();
      if (reachable.has(id)) continue;
      reachable.add(id);
      edges.filter(edge => edge.source === id && edge.type !== 'default' && !edge.invalid && ids.has(edge.target)).forEach(edge => pending.push(edge.target));
    }
    if (events.length && !reign && !ids.has(scenario.start)) warnings.push({ message: '시작 사건을 찾을 수 없습니다: ' + (scenario.start || '(미지정)'), eventId: null });
    if (reign) {
      const parts = new Set((scenario.reign?.parts || []).map(part => part.id));
      (scenario.reign?.turns || []).forEach(turn => (turn.eventIds || []).forEach(id => {
        const event = events.find(item => item.id === id);
        if (!event) warnings.push({ message: (turn.date || turn.title || turn.id) + ': 등록한 사건 ' + id + '을 찾을 수 없습니다.', eventId: null });
        else if (!parts.has(event.part)) warnings.push({ message: id + ': 치세 카드 분야를 지정해 주세요.', eventId: id });
      }));
    }
    const broken = new Set();
    edges.filter(edge => edge.invalid).forEach(edge => {
      const key = edge.source + '\n' + edge.target;
      if (broken.has(key)) return;
      broken.add(key);
      warnings.push({ message: edge.source + ' → ' + (edge.target || '(미지정)') + ': 대상 사건이 없습니다.', eventId: edge.source });
    });
    events.filter(event => !reachable.has(event.id)).forEach(event => warnings.push({ message: event.id + (reign ? ': 연도 사건 목록이나 활성 돌발 규칙에 등록되지 않았습니다.' : ': 시작 사건에서 이어지는 경로가 없습니다.'), eventId: event.id }));
    randomRules.filter(rule => rule.invalid).forEach(rule => warnings.push({ message: (rule.title || rule.id || '중간사건 규칙') + ': 대상 사건 ' + (rule.eventId || '(미지정)') + '을 찾을 수 없습니다.', eventId: null }));
    return { edges, reachableIds: Array.from(reachable), warnings, randomRules, reign, linkedEventIds: [...linkedEventIds], reignEventIds: reign ? [...turnCards] : [] };
  }

  function mount(container, options) {
    const scenario = options.scenario;
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const onOpenEvent = typeof options.onOpenEvent === 'function' ? options.onOpenEvent : () => {};
    const onOpenRandomEvents = typeof options.onOpenRandomEvents === 'function' ? options.onOpenRandomEvents : null;
    const onOpenReign = typeof options.onOpenReign === 'function' ? options.onOpenReign : null;
    const uid = 'branch-' + (++serial);
    let disposed = false;
    let selectedId = eventsOf(scenario).some(event => event.id === scenario.start) ? scenario.start : eventsOf(scenario)[0]?.id;
    let selectedChoice = null;
    let model;
    let frame = 0;
    let editFrame = 0;
    let scale = 1;
    let pan = { x: 25, y: 25 };
    let fitMode = true;
    let size = { width: 1000, height: 800 };
    let dragging = null;
    const sectionState = new Map();
    const positions = new Map(Object.entries(scenario.editorLayout?.positions || {}).filter(([, position]) => position && Number.isFinite(position.x) && Number.isFinite(position.y)).map(([id, position]) => [id, { x: Math.max(35, position.x), y: Math.max(40, position.y), manual: true }]));
    const cards = new Map();

    const host = element('section', 'branch-flow-root');
    host.setAttribute('aria-label', '사건 분기 흐름도');
    const toolbar = element('div', 'branch-toolbar');
    const intro = element('div', 'branch-intro');
    intro.append(element('strong', '', '분기 흐름도'), element('span', '', scenario.mode === 'reign' ? '치세 카드 편집 · 연도와 분야의 진행은 치세·연도 탭에서 설정합니다. 아래 일반 연결선은 치세의 카드 순서를 정하지 않습니다.' : '카드를 눌러 본문·선택지·조건·확률을 함께 편집하세요.'));
    const controls = element('div', 'branch-controls');
    const zoomLabel = element('output', 'branch-zoom', '100%');
    zoomLabel.setAttribute('aria-label', '현재 확대 비율');
    function button(text, action, className) {
      const node = element('button', 'branch-button' + (className ? ' ' + className : ''), text);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    }
    controls.append(button('−', () => zoomAt(scale / 1.2), 'branch-zoom-button'), zoomLabel,
      button('+', () => zoomAt(scale * 1.2), 'branch-zoom-button'), button('선택 사건 보기', focusSelected), button('전체 보기', fit), button('자동 정렬', () => { positions.clear(); if (scenario.editorLayout) delete scenario.editorLayout.positions; onChange(); fitMode = true; renderGraph(); }));
    controls.children[0].setAttribute('aria-label', '흐름도 축소');
    controls.children[2].setAttribute('aria-label', '흐름도 확대');
    const addEventButton = button('＋ 사건 추가', handleAddEvent, 'branch-add-button');
    const addRandomButton = button('＋ 돌발 사건 추가', handleAddRandomEvent, 'branch-add-random');
    controls.prepend(addEventButton, addRandomButton);
    toolbar.append(intro, controls);
    const body = element('div', 'branch-body');
    const graphArea = element('div', 'branch-graph-area');
    const stage = element('div', 'branch-flow-stage');
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', '흐름도 영역. 빈 공간을 끌어 이동하고, 확대 및 전체 보기 버튼을 사용할 수 있습니다.');
    const world = element('div', 'branch-world');
    const lines = svgElement('svg', { class: 'branch-connections', 'aria-hidden': 'true' });
    const nodeLayer = element('div', 'branch-nodes');
    const dragLines = svgElement('svg', { class: 'branch-drag-connections', 'aria-hidden': 'true' });
    world.append(lines, nodeLayer, dragLines);
    const emptyState = element('div', 'branch-empty-canvas');
    emptyState.append(element('span', 'branch-empty-symbol', '＋'), element('strong', '', '첫 사건부터 시작하세요'), element('p', '', '사건을 추가하고 선택지의 연결점을 끌어 이야기를 이어갈 수 있습니다.'), button('＋ 사건 추가', handleAddEvent, 'branch-add-button'));
    stage.append(world, emptyState);
    const legend = element('div', 'branch-legend');
    [['default', isReign(scenario) ? '돌발 대응의 기본 연결' : '사건 기본 연결'], ['choice', isReign(scenario) ? '돌발 대응의 개별 경로' : '개별 선택 경로'], ['skip', '등장 조건 불충족 → 건너뜀']].forEach(([kind, label]) => {
      const item = element('span', 'branch-legend-item');
      item.append(element('i', 'branch-legend-line branch-legend-' + kind), document.createTextNode(label));
      legend.append(item);
    });
    const hint = element('div', 'branch-navigation-hint', (isReign(scenario) ? '치세 카드의 선택은 다른 미결정 분야나 연도 정산으로 이어집니다. 선 연결은 돌발 대응 사건에만 사용합니다. · ' : '● 연결점을 끌어 다른 사건에 놓으세요 · ') + '빈 공간 끌기·스크롤로 이동 · Ctrl + 휠로 확대 · 조건의 실제 충족 여부는 계산하지 않습니다.');
    graphArea.append(stage, legend, hint);
    const inspector = element('aside', 'branch-inspector');
    inspector.setAttribute('aria-label', '선택한 사건 편집');
    body.append(graphArea, inspector);
    const status = element('div', 'branch-status');
    status.setAttribute('aria-live', 'polite');
    const randomSummary = element('div', 'branch-random-summary');
    randomSummary.setAttribute('aria-label', '매 선택 후 중간사건 추첨 규칙');
    host.append(toolbar);
    if (isReign(scenario)) {
      const note = element('div', 'branch-mode-notice');
      note.append(element('strong', '', '치세 모드 · 연도/분야가 진행 순서를 정합니다.'), element('span', '', '일반 카드의 next 연결은 사용하지 않습니다. 카드 본문·선택·효과는 여기서 편집하고, 연도별 카드 배치와 정산 규칙은 치세·연도 탭에서 설정하세요.'));
      if (onOpenReign) note.append(button('치세·연도 설정 ↗', onOpenReign, 'branch-reign-open'));
      host.append(note);
    }
    host.append(randomSummary, body, status);
    container.replaceChildren(host);

    function handleAddEvent() {
      const event = addEvent(scenario);
      if (!event) { status.textContent = '사건은 최대 1,000개까지 추가할 수 있습니다.'; return; }
      selectedId = event.id;
      selectedChoice = null;
      onChange();
      renderGraph();
      focusSelected();
      inspector.scrollTop = 0;
      inspector.querySelector('[data-branch-text="title"]')?.focus({ preventScroll: true });
    }
    function handleAddRandomEvent() {
      const result = addRandomEvent(scenario);
      if (!result) { status.textContent = '사건 1,000개 또는 돌발 규칙 200개 한도에 도달했습니다.'; return; }
      selectedId = result.event.id;
      selectedChoice = null;
      sectionState.set('rules-' + selectedId, true);
      sectionState.set('rule-' + result.rule.id, true);
      onChange();
      renderGraph();
      focusSelected();
      inspector.scrollTop = 0;
      inspector.querySelector('[data-branch-text="title"]')?.focus({ preventScroll: true });
    }
    function handleAddChoice(event) {
      if (!addChoice(event)) { status.textContent = '선택지는 사건마다 최대 20개까지 추가할 수 있습니다.'; return; }
      selectedChoice = event.choices.length - 1;
      sectionState.set('choice-' + event.id + '-' + selectedChoice, true);
      onChange();
      renderGraph();
      chosen(event.id, selectedChoice);
      inspector.querySelector('[data-branch-text="choice-' + selectedChoice + '"]')?.focus({ preventScroll: true });
    }

    function updateTransform() {
      world.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + scale + ')';
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }
    function fit() {
      if (disposed) return;
      const bounds = stage.getBoundingClientRect();
      if (bounds.width < 5 || bounds.height < 5) return;
      scale = Math.max(0.12, Math.min(1, (bounds.width - 36) / size.width, (bounds.height - 36) / size.height));
      pan = { x: (bounds.width - size.width * scale) / 2, y: (bounds.height - size.height * scale) / 2 };
      fitMode = true;
      updateTransform();
    }
    function zoomAt(next, clientX, clientY) {
      const bounds = stage.getBoundingClientRect();
      const point = { x: clientX === undefined ? bounds.width / 2 : clientX - bounds.left, y: clientY === undefined ? bounds.height / 2 : clientY - bounds.top };
      const clamped = Math.max(0.12, Math.min(2, next));
      const factor = clamped / scale;
      pan = { x: point.x - (point.x - pan.x) * factor, y: point.y - (point.y - pan.y) * factor };
      scale = clamped;
      fitMode = false;
      updateTransform();
    }
    function focusSelected() {
      const position = positions.get(selectedId);
      if (!position) return;
      const bounds = stage.getBoundingClientRect();
      scale = 1;
      pan = { x: bounds.width / 2 - (position.x + position.width / 2), y: bounds.height / 2 - (position.y + position.height / 2) };
      fitMode = false;
      updateTransform();
    }
    function targetLabel(id) {
      if (id === 'END') return '엔딩 판정';
      if (id === 'RETURN') return '원래 흐름으로 복귀';
      const event = eventsOf(scenario).find(item => item.id === id);
      return event ? (event.title || '제목 없음') : '⚠ ' + (id || '미지정');
    }
    function chosen(eventId, choiceIndex) {
      selectedId = eventId;
      selectedChoice = choiceIndex === undefined ? null : choiceIndex;
      if (selectedChoice !== null) sectionState.set('choice-' + eventId + '-' + selectedChoice, true);
      cards.forEach((entry, id) => {
        entry.node.classList.toggle('branch-selected', id === selectedId);
        entry.choiceRows.forEach((row, index) => row.classList.toggle('branch-choice-selected', id === selectedId && index === selectedChoice));
      });
      renderInspector();
      if (selectedChoice === null) inspector.scrollTop = 0;
      else {
        const setting = inspector.querySelector('.branch-setting-selected');
        if (setting && inspector.scrollHeight > inspector.clientHeight) {
          // Scroll only the inspector. scrollIntoView() would also move the
          // surrounding dialog or page when the panel is near its bottom.
          const panelBounds = inspector.getBoundingClientRect();
          const settingBounds = setting.getBoundingClientRect();
          if (settingBounds.top < panelBounds.top + 12) inspector.scrollTop += settingBounds.top - panelBounds.top - 12;
          else if (settingBounds.height > inspector.clientHeight - 24) inspector.scrollTop += settingBounds.top - panelBounds.top - 12;
          else if (settingBounds.bottom > panelBounds.bottom - 12) inspector.scrollTop += settingBounds.bottom - panelBounds.bottom + 12;
        }
      }
      drawLines();
    }
    function destinationSelect(label, value, allowInherit, action, fieldKey) {
      const wrap = element('label', 'branch-field');
      wrap.append(element('span', 'branch-field-label', label));
      const select = element('select', 'branch-select');
      select.dataset.branchField = fieldKey;
      const choices = [];
      if (allowInherit) choices.push(['', '기본 연결 따름 → ' + targetLabel(eventsOf(scenario).find(event => event.id === selectedId)?.next)]);
      choices.push(['END', '이야기 종료 → 엔딩 판정']);
      choices.push(['RETURN', '중간사건 종료 → 원래 흐름으로 복귀']);
      eventsOf(scenario).forEach(event => choices.push([event.id, event.id + ' · ' + (event.title || '제목 없음')]));
      if (!choices.some(([key]) => key === value)) choices.unshift([value, '⚠ 없는 대상: ' + (value || '(미지정)')]);
      choices.forEach(([key, title]) => {
        const option = element('option', '', title);
        option.value = key === undefined ? '' : key;
        select.append(option);
      });
      select.value = value === undefined ? '' : value;
      select.addEventListener('change', () => {
        action(select.value);
        onChange();
        renderGraph(true);
        inspector.querySelectorAll('.branch-choice-setting').forEach(item => item.classList.toggle('branch-setting-selected', Number(item.dataset.branchChoiceIndex) === selectedChoice));
        inspector.querySelectorAll('select[data-branch-field^="choice-"] option[value=""]').forEach(option => {
          option.textContent = '기본 연결 따름 → ' + targetLabel(eventsOf(scenario).find(event => event.id === selectedId)?.next);
        });
      });
      wrap.append(select);
      return wrap;
    }
    function textField(label, value, action, key, multiline, settings = {}) {
      const wrap = element('label', 'branch-field');
      wrap.append(element('span', 'branch-field-label', label));
      const input = element(multiline ? 'textarea' : 'input', 'branch-text-input');
      if (!multiline) input.type = 'text';
      else input.rows = settings.rows || 4;
      input.value = value || '';
      input.maxLength = settings.maxLength || (multiline ? 20000 : key === 'title' ? 300 : 1000);
      input.dataset.branchText = key;
      input.addEventListener('input', () => { action(input.value); onChange(); });
      wrap.append(input);
      return wrap;
    }
    function scheduleGraphRefresh() {
      if (editFrame) return;
      editFrame = requestAnimationFrame(() => {
        editFrame = 0;
        if (!disposed) renderGraph(true);
      });
    }
    function simpleSelect(label, value, items, action) {
      const wrap = element('label', 'branch-field');
      wrap.append(element('span', 'branch-field-label', label));
      const input = element('select', 'branch-select');
      const values = items.slice();
      if (!values.some(item => String(item[0]) === String(value))) values.unshift([value, '⚠ 없음: ' + (value || '미지정')]);
      values.forEach(([key, title]) => {
        const option = element('option', '', title);
        option.value = String(key);
        input.append(option);
      });
      input.value = String(value);
      input.addEventListener('change', () => { action(input.value); onChange(); });
      wrap.append(input);
      return wrap;
    }
    function numberField(label, value, action, settings = {}) {
      const wrap = element('label', 'branch-field');
      wrap.append(element('span', 'branch-field-label', label));
      const input = element('input', 'branch-text-input');
      input.type = 'number';
      input.step = settings.integer ? '1' : 'any';
      if (settings.min !== undefined) input.min = String(settings.min);
      if (settings.max !== undefined) input.max = String(settings.max);
      input.value = String(value === undefined ? 0 : value);
      input.addEventListener('input', () => {
        let next = Number(input.value);
        if (!Number.isFinite(next)) return;
        if (settings.integer) next = Math.floor(next);
        if (settings.min !== undefined) next = Math.max(settings.min, next);
        if (settings.max !== undefined) next = Math.min(settings.max, next);
        if (input.value !== '' && Number(input.value) !== next) input.value = String(next);
        action(next);
        onChange();
      });
      wrap.append(input);
      return wrap;
    }
    function checkboxField(label, value, action) {
      const wrap = element('label', 'branch-checkbox');
      const input = element('input');
      input.type = 'checkbox';
      input.checked = Boolean(value);
      input.addEventListener('change', () => { action(input.checked); onChange(); });
      wrap.append(input, element('span', '', label));
      return wrap;
    }
    function fold(title, key, initiallyOpen) {
      const details = element('details', 'branch-edit-section');
      details.open = sectionState.has(key) ? sectionState.get(key) : Boolean(initiallyOpen);
      details.append(element('summary', '', title));
      details.addEventListener('toggle', () => { if (details.isConnected) sectionState.set(key, details.open); });
      return details;
    }
    function conditionBuilder(owner, title, key) {
      if (root.ScenarioEditorV2?.conditions) {
        if (!Array.isArray(owner.when)) owner.when = [];
        const details = fold(title + ' · ' + owner.when.length + '개', key, false);
        details.append(root.ScenarioEditorV2.conditions(scenario, owner.when, title, () => { onChange(); details.querySelector('summary').textContent = title + ' · ' + owner.when.length + '개'; scheduleGraphRefresh(); }));
        return details;
      }
      const conditions = () => Array.isArray(owner.when) ? owner.when : [];
      const section = fold(title + ' · ' + conditions().length + '개', key, false);
      const content = element('div', 'branch-edit-section-body');
      const rows = element('div', 'branch-condition-rows');
      const note = element('p', 'branch-help', '아래 조건을 모두 만족해야 합니다. 조건이 없으면 항상 허용됩니다.');
      const availableStats = Array.isArray(scenario.stats) ? scenario.stats : [];
      const availableFlags = Array.isArray(scenario.flags) ? scenario.flags : [];
      const changed = () => {
        if (owner.eventId && owner.id) {
          const ruleSection = section.closest('.branch-rule-setting');
          if (ruleSection) ruleSection.querySelector('summary').textContent = (owner.title || owner.id) + ' · ' + ruleLabel(owner);
        }
        scheduleGraphRefresh();
      };
      const add = button('＋ 조건 추가', () => {
        if (conditions().length >= 100 || (!availableStats.length && !availableFlags.length)) return;
        if (!Array.isArray(owner.when)) owner.when = [];
        const isFlag = availableStats.length === 0;
        owner.when.push({ kind: isFlag ? 'flag' : 'stat', key: (isFlag ? availableFlags : availableStats)[0].id, op: isFlag ? 'eq' : 'gte', value: isFlag ? true : 50 });
        renderRows();
        onChange();
        changed();
      }, 'branch-inline-add');
      function renderRows() {
        rows.replaceChildren();
        section.querySelector('summary').textContent = title + ' · ' + conditions().length + '개';
        add.disabled = conditions().length >= 100 || (!availableStats.length && !availableFlags.length);
        if (!conditions().length) rows.append(element('p', 'branch-help', availableStats.length || availableFlags.length ? '조건 없음' : '수치 또는 선택 기록을 먼저 추가하면 조건을 설정할 수 있습니다.'));
        conditions().forEach((condition, index) => {
          const row = element('div', 'branch-condition-editor-row');
          const kinds = [];
          if (availableStats.length) kinds.push(['stat', '수치']);
          if (availableFlags.length) kinds.push(['flag', '선택 기록']);
          const isFlag = condition.kind === 'flag';
          const keys = (isFlag ? availableFlags : availableStats).map(item => [item.id, item.name || item.id]);
          row.append(simpleSelect('종류', condition.kind, kinds, value => {
            condition.kind = value;
            const flag = value === 'flag';
            condition.key = (flag ? availableFlags : availableStats)[0]?.id || '';
            condition.op = flag ? 'eq' : 'gte';
            condition.value = flag ? true : 50;
            renderRows();
            changed();
          }), simpleSelect('대상', condition.key, keys, value => { condition.key = value; changed(); }),
          simpleSelect('비교', condition.op, isFlag ? [['eq', '같음'], ['ne', '다름']] : [['gte', '이상 ≥'], ['lte', '이하 ≤'], ['eq', '같음 ='], ['ne', '다름 ≠'], ['gt', '초과 >'], ['lt', '미만 <']], value => { condition.op = value; changed(); }));
          row.append(isFlag ? simpleSelect('값', String(condition.value), [['true', '있음'], ['false', '없음']], value => { condition.value = value === 'true'; changed(); }) : numberField('비교값', condition.value, value => { condition.value = value; changed(); }));
          row.append(button('조건 삭제', () => { owner.when.splice(index, 1); renderRows(); onChange(); changed(); }, 'branch-delete-button'));
          rows.append(row);
        });
      }
      renderRows();
      content.append(note, rows, add);
      section.append(content);
      return section;
    }
    function ruleLabel(rule) {
      const details = [(Number.isFinite(rule.chance) ? rule.chance : 100) + '%'];
      details.push(hasConditions(rule) ? '조건 ' + rule.when.length + '개' : '조건 없음');
      if (rule.once) details.push('1회');
      if (Number.isFinite(rule.cooldown) && rule.cooldown > 0) details.push('간격 ' + rule.cooldown + '턴');
      return details.join(' · ');
    }
    function ruleConditions(rule) {
      return (Array.isArray(rule.when) ? rule.when : []).map(condition => {
        try {
          if (root.GameEngine && typeof root.GameEngine.explainCondition === 'function') return root.GameEngine.explainCondition(condition, scenario);
        } catch (_) { /* An unfinished draft may not have its referenced stat yet. */ }
        return condition ? [condition.key, condition.op, String(condition.value)].join(' ') : '미완성 조건';
      }).join(' · ') || '조건 없음';
    }
    function renderRandomSummary() {
      randomSummary.replaceChildren();
      randomSummary.hidden = !model.randomRules.length || !eventsOf(scenario).length;
      if (randomSummary.hidden) return;
      const heading = element('div', 'branch-random-heading');
      heading.append(element('strong', '', '선택 후 중간사건'), element('span', '', '전역 규칙 ' + model.randomRules.length + '개'));
      heading.title = '매 선택 후 조건과 확률을 확인하는 전역 추첨 규칙입니다. 아래 진행 경로의 선과 별도로 작동합니다.';
      randomSummary.append(heading);
      const list = element('div', 'branch-random-rule-list');
      model.randomRules.forEach(rule => {
        const chip = button('', () => {
          if (!rule.invalid) { chosen(rule.eventId); focusSelected(); }
          else if (onOpenRandomEvents) onOpenRandomEvents();
        }, 'branch-random-rule' + (rule.invalid ? ' branch-random-invalid' : ''));
        chip.append(element('strong', '', (rule.title || rule.id || '중간사건') + ' → ' + (rule.eventId || '미지정')), element('span', '', ruleLabel(rule)));
        chip.title = '대상: ' + targetLabel(rule.eventId) + '\n' + ruleLabel(rule) + ' · 우선순위 ' + (rule.priority || 0) + '\n조건: ' + ruleConditions(rule) + '\n선택 후 전역 추첨 규칙. 누르면 대상 사건을 봅니다.';
        list.append(chip);
      });
      randomSummary.append(list);
      if (onOpenRandomEvents) randomSummary.append(button('규칙 편집 ↗', onOpenRandomEvents, 'branch-random-edit'));
    }
    function renderInspector() {
      inspector.replaceChildren();
      const event = eventsOf(scenario).find(item => item.id === selectedId);
      if (!event) {
        inspector.append(element('h3', '', eventsOf(scenario).length ? '사건을 선택하세요' : '아직 사건이 없습니다'), element('p', 'branch-help', eventsOf(scenario).length ? '흐름도에서 사건 카드나 선택지를 누르면 연결을 편집할 수 있습니다.' : '첫 사건을 추가하면 시작 사건으로 지정됩니다. 수치·선택 기록·엔딩은 각 편집 탭에서 추가할 수 있습니다.'));
        return;
      }
      const usesLinks = !model.reign || model.linkedEventIds.includes(event.id);
      const eyebrow = element('div', 'branch-inspector-eyebrow', '사건 통합 편집 · ' + event.id);
      inspector.append(eyebrow, element('h3', 'branch-inspector-title', event.title || '제목 없음'));
      const startButton = button(scenario.start === event.id ? '✓ 시작 사건' : '이 사건에서 시작', () => {
        scenario.start = event.id;
        onChange();
        renderGraph();
      }, 'branch-start-button');
      startButton.disabled = scenario.start === event.id;
      const actions = element('div', 'branch-inspector-actions');
      if (!model.reign) actions.append(startButton);
      else if (onOpenReign) actions.append(button('치세·연도 설정 ↗', onOpenReign));
      actions.append(button('기존 사건 편집 탭 ↗', () => onOpenEvent(event.id)));
      inspector.append(actions);
      inspector.append(textField('사건 제목', event.title, value => {
        event.title = value;
        inspector.querySelector('.branch-inspector-title').textContent = value || '제목 없음';
        host.querySelectorAll('option').forEach(option => {
          if (option.value === event.id) option.textContent = event.id + ' · ' + (value || '제목 없음');
        });
        scheduleGraphRefresh();
      }, 'title'));
      inspector.append(textField('사건 본문', event.body, value => { event.body = value; }, 'body', true, { rows: 5 }));
      inspector.append(element('p', 'branch-help branch-name-help', '플레이어 이름을 넣을 자리에 {name}을 쓰세요. 원고는 입력한 그대로 저장됩니다.'));
      const metadata = fold('시기·화자·장 표시', 'metadata-' + event.id, false);
      const metadataBody = element('div', 'branch-edit-section-body');
      [['date', '날짜·시기'], ['speaker', '화자'], ['chapter', '장·챕터']].forEach(([key, label]) => metadataBody.append(textField(label, event[key], value => { event[key] = value; }, key, false, { maxLength: 300 })));
      metadata.append(metadataBody);
      inspector.append(metadata);
      if (scenario.mode === 'reign') inspector.append(simpleSelect('치세 카드 분야', event.part || '', [['', '분야 미지정'], ...(scenario.reign?.parts || []).map(part => [part.id, part.name])], value => { event.part = value; }));
      inspector.append(conditionBuilder(event, '사건 자체 등장 조건', 'event-conditions-' + event.id));
      if (usesLinks) {
        inspector.append(destinationSelect(model.reign ? '돌발 대응의 기본 다음 사건' : '사건의 기본 다음 사건', event.next, false, value => { event.next = value; }, 'default'));
        inspector.append(element('p', 'branch-help', model.reign ? '이 연결은 돌발 대응으로 등장했을 때 사용합니다. 연도의 일반 카드로 고를 때는 next를 사용하지 않습니다. RETURN으로 치세의 분야 선택에 복귀할 수 있습니다.' : '기본 연결을 따르는 선택지에 적용됩니다. 사건 자체 등장 조건을 만족하지 않으면 이 경로로 건너뜁니다.'));
      } else inspector.append(element('p', 'branch-mode-card-note', '치세 카드입니다. 선택 후 남은 분야를 고르며, 모든 분야를 결정하면 연도를 정산합니다. 다음 연도와 정산 규칙은 치세·연도 탭에서 설정합니다. 기존 next 값은 연대기로 전환할 때를 위해 보관하며 여기서는 사용하지 않습니다.'));
      const choiceHeading = element('div', 'branch-choice-heading');
      const addChoiceButton = button('＋ 선택지 추가', () => handleAddChoice(event), 'branch-add-choice');
      addChoiceButton.disabled = choicesOf(event).length >= 20;
      addChoiceButton.title = addChoiceButton.disabled ? '사건마다 선택지는 최대 20개입니다.' : '기본 연결을 따르는 새 선택지를 추가합니다.';
      choiceHeading.append(element('h4', 'branch-inspector-subtitle', '선택지 통합 편집'), addChoiceButton);
      inspector.append(choiceHeading);
      choicesOf(event).forEach((choice, index) => {
        const item = fold('선택 ' + (index + 1) + ' · ' + (choice.text || '내용 없음'), 'choice-' + event.id + '-' + index, selectedChoice === index || (selectedChoice === null && index === 0));
        item.classList.add('branch-choice-setting');
        if (selectedChoice === index) item.classList.add('branch-setting-selected');
        item.dataset.branchChoiceIndex = String(index);
        const content = element('div', 'branch-edit-section-body');
        content.append(textField('선택지 문장', choice.text, value => {
          choice.text = value;
          item.querySelector('summary').textContent = '선택 ' + (index + 1) + ' · ' + (value || '내용 없음');
          scheduleGraphRefresh();
        }, 'choice-' + index, true, { rows: 2, maxLength: 1000 }));
        content.append(textField('선택지 설명', choice.description, value => { choice.description = value; }, 'description-' + index, true, { rows: 2, maxLength: 2000 }));
        content.append(textField('선택 후 결과 본문', choice.result, value => { choice.result = value; if (root.ScenarioEditorV2) root.ScenarioEditorV2.upgrade(scenario); else scenario.schemaVersion = 2; }, 'result-' + index, true, { rows: 3 }),
          checkboxField('실제 역사에서 선택한 경로', choice.historical === true, value => { choice.historical = value; if (root.ScenarioEditorV2) root.ScenarioEditorV2.upgrade(scenario); else scenario.schemaVersion = 2; }));
        const nextField = destinationSelect('선택 ' + (index + 1) + (model.reign ? ' · 돌발 대응 이후' : ' 이후'), inherited(choice) ? '' : choice.next, true, value => {
          if (value === '') delete choice.next;
          else choice.next = value;
          selectedChoice = index;
        }, 'choice-' + index);
        if (usesLinks) content.append(nextField);
        const effects = fold('수치 변화', 'effects-' + event.id + '-' + index, false);
        const effectBody = element('div', 'branch-edit-section-body branch-small-grid');
        (scenario.stats || []).forEach(stat => effectBody.append(numberField(stat.name || stat.id, choice.effects?.[stat.id] || 0, value => {
          if (!choice.effects || typeof choice.effects !== 'object') choice.effects = {};
          if (value === 0) delete choice.effects[stat.id];
          else choice.effects[stat.id] = value;
        })));
        if (!(scenario.stats || []).length) effectBody.append(element('p', 'branch-help', '시나리오에 수치를 먼저 추가하세요.'));
        effects.append(effectBody);
        const flags = fold('선택 기록 변경', 'flags-' + event.id + '-' + index, false);
        const flagBody = element('div', 'branch-edit-section-body');
        (scenario.flags || []).forEach(flag => {
          const value = choice.setFlags && Object.prototype.hasOwnProperty.call(choice.setFlags, flag.id) ? String(choice.setFlags[flag.id]) : '';
          flagBody.append(simpleSelect(flag.name || flag.id, value, [['', '변경 없음'], ['true', '있음으로 기록'], ['false', '없음으로 기록']], next => {
            if (!choice.setFlags || typeof choice.setFlags !== 'object') choice.setFlags = {};
            if (next === '') delete choice.setFlags[flag.id];
            else choice.setFlags[flag.id] = next === 'true';
          }));
        });
        if (!(scenario.flags || []).length) flagBody.append(element('p', 'branch-help', '시나리오에 선택 기록을 먼저 추가하세요.'));
        flags.append(flagBody);
        content.append(effects, flags, conditionBuilder(choice, '선택지 사용 조건', 'choice-conditions-' + event.id + '-' + index));
        if (root.ScenarioEditorV2?.territory) {
          const territory = fold('영토·점령·영향권 변화', 'territory-' + event.id + '-' + index, false);
          territory.append(root.ScenarioEditorV2.territory(scenario, choice, () => { onChange(); scheduleGraphRefresh(); })); content.append(territory);
        }
        const remove = button('이 선택지 삭제', () => {
          if (!removeChoice(event, index)) return;
          selectedChoice = Math.min(index, event.choices.length - 1);
          sectionState.set('choice-' + event.id + '-' + selectedChoice, true);
          onChange();
          renderGraph();
          chosen(event.id, selectedChoice);
        }, 'branch-delete-button');
        remove.disabled = choicesOf(event).length <= 1;
        remove.title = remove.disabled ? '사건에는 선택지가 1개 이상 필요합니다.' : '이 선택지와 연결 설정을 삭제합니다.';
        content.append(remove);
        item.append(content);
        inspector.append(item);
      });
      const eventRules = rulesOf(scenario).filter(rule => rule.eventId === event.id);
      const rulesSection = fold('돌발 사건 추첨 규칙 · ' + eventRules.length + '개', 'rules-' + event.id, eventRules.length > 0);
      const rulesBody = element('div', 'branch-edit-section-body');
      rulesBody.append(element('p', 'branch-help', '일반 사건에는 발생 확률이 없습니다. 돌발 사건으로 등록하면 매 선택 후 추첨 조건과 확률을 적용합니다. 등록해도 본문과 현재 연결은 유지됩니다.'));
      if (scenario.start === event.id && eventRules.length) rulesBody.append(element('p', 'branch-condition-note', '현재 시작 사건으로도 지정되어 있습니다. 첫 사건이므로 바로 표시되며, 이후에는 추첨 규칙의 대상이 됩니다. RETURN에서 돌아갈 흐름이 없으면 엔딩을 판정합니다.'));
      const register = button(eventRules.length ? '＋ 이 사건의 추첨 규칙 추가' : '이 사건을 돌발 사건으로 등록', () => {
        const rule = addRandomRule(scenario, event.id);
        if (!rule) { status.textContent = '돌발 사건 규칙은 최대 200개입니다.'; return; }
        sectionState.set('rules-' + event.id, true);
        sectionState.set('rule-' + rule.id, true);
        onChange();
        renderGraph();
      }, 'branch-add-random');
      register.disabled = rulesOf(scenario).length >= 200;
      rulesBody.append(register);
      eventRules.forEach((rule, index) => {
        const ruleSection = fold((rule.title || rule.id) + ' · ' + ruleLabel(rule), 'rule-' + rule.id, index === 0);
        ruleSection.classList.add('branch-rule-setting');
        ruleSection.dataset.branchRuleId = rule.id;
        const ruleBody = element('div', 'branch-edit-section-body');
        ruleBody.append(element('p', 'branch-help', '규칙 ID: ' + rule.id + ' · 대상 사건: ' + event.id));
        const updateRuleSummary = () => {
          ruleSection.querySelector('summary').textContent = (rule.title || rule.id) + ' · ' + ruleLabel(rule);
          scheduleGraphRefresh();
        };
        ruleBody.append(textField('돌발 규칙 이름', rule.title, value => { rule.title = value; updateRuleSummary(); }, 'rule-title-' + rule.id, false, { maxLength: 300 }));
        const numbers = element('div', 'branch-small-grid');
        numbers.append(numberField('발생 확률 (%)', rule.chance, value => { rule.chance = value; updateRuleSummary(); }, { min: 0, max: 100 }), numberField('우선순위', rule.priority, value => { rule.priority = value; updateRuleSummary(); }));
        ruleBody.append(numbers, checkboxField('한 게임에서 한 번만 발생', rule.once !== false, value => { rule.once = value; updateRuleSummary(); }), numberField('다시 발생하기 전 건너뛸 선택 수', rule.cooldown || 0, value => { rule.cooldown = value; updateRuleSummary(); }, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }), conditionBuilder(rule, '선택 후 추첨 조건', 'rule-conditions-' + rule.id));
        ruleBody.append(button('이 추첨 규칙 삭제', () => {
          if (!removeRandomRule(scenario, rule.id)) return;
          onChange();
          renderGraph();
        }, 'branch-delete-button'));
        ruleSection.append(ruleBody);
        rulesBody.append(ruleSection);
      });
      if (eventRules.length) rulesBody.append(element('p', 'branch-help', '돌발 사건을 마치고 본래 진행으로 돌아가려면 마지막 연결을 RETURN으로 지정하세요. 규칙을 삭제해도 사건 본문은 남습니다.'));
      rulesSection.append(rulesBody);
      inspector.append(rulesSection);
      const endNote = element('div', 'branch-end-note');
      endNote.append(element('strong', '', model.reign ? '마지막 연도 정산 → 엔딩 · RETURN → 치세 복귀' : 'END는 엔딩 판정 · RETURN은 돌발 사건 복귀'), element('p', '', model.reign ? '연도 목록의 마지막 정산을 마치면 엔딩 조건을 판정합니다. 즉시 엔딩은 각 결정과 정산 후에도 적용됩니다. 돌발 대응의 RETURN은 중단했던 분야 선택으로 돌아갑니다.' : 'END는 누적 수치·선택 기록과 엔딩 조건·우선순위로 결말을 결정합니다. 즉시 엔딩과 확률 엔딩은 매 선택 후 판정합니다. RETURN은 원래 대기 중이던 다음 사건으로 복귀하며, 대기 중인 흐름이 없으면 엔딩을 판정합니다.'));
      inspector.append(endNote);
      if (model.warnings.length) {
        const details = element('details', 'branch-warnings');
        const summary = element('summary', '', '연결 확인 ' + model.warnings.length + '건');
        details.append(summary);
        const list = element('ul');
        model.warnings.forEach(warning => {
          const item = element('li');
          if (warning.eventId) item.append(button(warning.message, () => chosen(warning.eventId), 'branch-warning-link'));
          else item.textContent = warning.message;
          list.append(item);
        });
        details.append(list, element('p', 'branch-help', '연결 구조만 검사합니다. 수치·선택 조건을 실제로 만족할 수 있는지와 엔딩 도달 가능성은 포함하지 않습니다.'));
        inspector.append(details);
      }
    }

    function renderGraph(keepInspector = false) {
      model = analyze(scenario);
      addEventButton.disabled = eventsOf(scenario).length >= 1000;
      addEventButton.title = addEventButton.disabled ? '사건은 최대 1,000개입니다.' : '새 사건을 추가하고 내용을 작성합니다.';
      addRandomButton.disabled = eventsOf(scenario).length >= 1000 || rulesOf(scenario).length >= 200;
      addRandomButton.title = addRandomButton.disabled ? '사건 1,000개 또는 돌발 규칙 200개 한도입니다.' : '복귀 연결과 추첨 규칙을 가진 새 돌발 사건을 추가합니다.';
      nodeLayer.replaceChildren();
      cards.clear();
      const events = eventsOf(scenario);
      const reachable = new Set(model.reachableIds);
      const randomTargets = new Set(model.randomRules.map(rule => rule.eventId));
      emptyState.hidden = events.length > 0;
      world.hidden = events.length === 0;
      renderRandomSummary();
      events.forEach((event, index) => {
        const usesLinks = !model.reign || model.linkedEventIds.includes(event.id);
        const node = element('article', 'branch-node' + (event.id === selectedId ? ' branch-selected' : '') + (!reachable.has(event.id) ? ' branch-unconnected' : ''));
        node.dataset.branchEvent = event.id;
        const handle = element('div', 'branch-node-handle');
        handle.dataset.branchDrag = event.id;
        handle.append(element('span', 'branch-event-number', String(index + 1).padStart(2, '0')), element('span', 'branch-node-id', event.id), element('span', 'branch-drag-icon', '⠿'));
        if (!model.reign && scenario.start === event.id) handle.append(element('span', 'branch-start-chip', '시작'));
        if (randomTargets.has(event.id)) handle.append(element('span', 'branch-random-target-chip', '중간사건'));
        const title = button(event.title || '제목 없음', () => chosen(event.id), 'branch-node-title');
        const inputPort = button('', () => chosen(event.id), 'branch-input-port');
        inputPort.setAttribute('aria-label', event.id + ' 입력 연결점. 다른 선택지의 연결점을 이곳으로 끌어 연결할 수 있습니다.');
        inputPort.title = '이 사건으로 연결';
        node.append(handle, title); if (usesLinks) node.append(inputPort);
        if (model.reign) {
          const turns = (scenario.reign?.turns || []).filter(turn => (turn.eventIds || []).includes(event.id));
          const part = (scenario.reign?.parts || []).find(part => part.id === event.part);
          if (turns.length) node.append(element('div', 'branch-reign-membership', turns.map(turn => turn.date || turn.title || turn.id).join(' · ') + ' / ' + (part?.name || '분야 미지정')));
        }
        if (hasConditions(event)) node.append(element('div', 'branch-node-condition', model.reign && !usesLinks ? '조건부 카드 · 해당 분야의 첫 허용 후보로 표시' : '조건부 사건 · 불충족 시 기본 경로로 건너뜀'));
        const choiceRows = [];
        choicesOf(event).forEach((choice, choiceIndex) => {
          const line = element('div', 'branch-choice-line' + (event.id === selectedId && choiceIndex === selectedChoice ? ' branch-choice-selected' : ''));
          const row = button('', () => chosen(event.id, choiceIndex), 'branch-choice-row');
          row.title = choice.text || '선택지 내용 없음';
          row.append(element('span', 'branch-choice-number', String(choiceIndex + 1)), element('span', 'branch-choice-text', choice.text || '내용 없음'));
          const destination = inherited(choice) ? event.next : choice.next;
          const badge = element('span', 'branch-choice-destination' + (!inherited(choice) ? ' branch-explicit-destination' : ''), (hasConditions(choice) ? '◇ ' : '') + (!usesLinks ? '분야 결정' : inherited(choice) ? '기본' : destination === 'END' ? 'END' : destination));
          badge.title = !usesLinks ? '선택 후 남은 분야를 결정하고 연도를 정산합니다.' : '다음: ' + targetLabel(destination) + (hasConditions(choice) ? ' · 선택 조건 있음' : '');
          row.append(badge);
          const outputPort = button('', () => chosen(event.id, choiceIndex), 'branch-output-port');
          outputPort.dataset.branchSource = event.id;
          outputPort.dataset.branchChoice = String(choiceIndex);
          outputPort.setAttribute('aria-label', event.id + ' 선택 ' + (choiceIndex + 1) + ' 연결점. 끌어서 다음 사건을 연결하거나 눌러 연결 설정을 여세요.');
          outputPort.title = '끌어서 다음 사건 연결 · 클릭하면 연결 설정';
          line.append(row); if (usesLinks) line.append(outputPort);
          choiceRows.push(line);
          node.append(line);
        });
        const defaultRow = element('div', 'branch-default-line');
        const defaultButton = button(!usesLinks ? '연도 정산으로 진행 · next 미사용' : '기본 → ' + (event.next === 'END' ? '엔딩 판정' : event.next === 'RETURN' ? '원래 흐름으로 복귀' : event.next || '미지정'), () => chosen(event.id), 'branch-default-row');
        const defaultPort = button('', () => chosen(event.id), 'branch-output-port branch-default-port');
        defaultPort.dataset.branchSource = event.id;
        defaultPort.dataset.branchChoice = 'default';
        defaultPort.setAttribute('aria-label', event.id + ' 기본 연결점. 끌어서 기본 다음 사건을 연결할 수 있습니다.');
        defaultPort.title = '끌어서 기본 다음 사건 연결';
        defaultRow.append(defaultButton); if (usesLinks) defaultRow.append(defaultPort);
        node.append(defaultRow);
        if (!reachable.has(event.id)) node.append(element('div', 'branch-node-warning', model.reign ? '연도·활성 돌발 규칙에 미등록' : '시작점에서 연결되지 않음'));
        node.addEventListener('click', eventObject => { if (eventObject.target === node) chosen(event.id); });
        nodeLayer.append(node);
        cards.set(event.id, { node, handle, title, defaultRow, choiceRows, event });
      });
      if (events.length) {
        const ending = element('article', 'branch-node branch-end-node');
        ending.dataset.branchEvent = 'END';
        ending.append(element('span', 'branch-end-symbol', '◎'), element('strong', '', '엔딩 판정'), element('p', '', model.reign ? '마지막 연도 정산 후 결말 결정' : '누적 수치와 조건으로 결말 결정'), element('span', '', (Array.isArray(scenario.endings) ? scenario.endings.length : 0) + '개 엔딩 · 조건/우선순위 적용'));
        const endingPort = button('', () => { status.textContent = 'END에 연결하면 누적 수치·조건에 따라 엔딩을 판정합니다.'; }, 'branch-input-port');
        endingPort.setAttribute('aria-label', '엔딩 판정 입력 연결점. 선택지의 연결점을 이곳으로 끌어 이야기를 끝내세요.');
        endingPort.title = '엔딩 판정으로 연결';
        ending.append(endingPort);
        nodeLayer.append(ending);
        cards.set('END', { node: ending, choiceRows: [], event: null });
        const returning = element('article', 'branch-node branch-return-node');
        returning.dataset.branchEvent = 'RETURN';
        returning.append(element('span', 'branch-return-symbol', '↩'), element('strong', '', '원래 흐름으로 복귀'), element('p', '', model.reign ? '돌발 대응 종료 → 치세 분야 선택' : '중간사건 종료 → 대기하던 다음 사건'), element('span', '', 'RETURN · 중간사건 전용'));
        const returnPort = button('', () => { status.textContent = 'RETURN은 중간사건을 종료하고 원래 대기 중이던 다음 사건으로 복귀합니다.'; }, 'branch-input-port');
        returnPort.setAttribute('aria-label', '원래 흐름으로 복귀 입력 연결점. 중간사건의 마지막 선택지를 이곳으로 연결하세요.');
        returnPort.title = '중간사건을 끝내고 원래 흐름으로 복귀';
        returning.append(returnPort);
        nodeLayer.append(returning);
        cards.set('RETURN', { node: returning, choiceRows: [], event: null });
      }
      const rows = [];
      const cols = events.length < 4 ? Math.max(1, Math.min(3, events.length + 1)) : events.length >= 7 ? 4 : 3;
      Array.from(cards.entries()).forEach(([id, entry], index) => {
        const row = Math.floor(index / cols);
        rows[row] = Math.max(rows[row] || 0, entry.node.offsetHeight);
      });
      const rowTops = [];
      let top = 40;
      rows.forEach(height => { rowTops.push(top); top += height + 62; });
      Array.from(cards.entries()).forEach(([id, entry], index) => {
        const row = Math.floor(index / cols);
        let col = index % cols;
        if (row % 2) col = cols - 1 - col;
        const initial = { x: 40 + col * 315, y: rowTops[row], width: 250, height: entry.node.offsetHeight, row, col };
        const previous = positions.get(id);
        const position = previous && previous.manual ? Object.assign(initial, { x: previous.x, y: previous.y, manual: true }) : initial;
        positions.set(id, position);
        entry.node.style.left = position.x + 'px';
        entry.node.style.top = position.y + 'px';
      });
      Array.from(positions.keys()).filter(id => !cards.has(id)).forEach(id => positions.delete(id));
      updateBounds();
      if (!keepInspector) renderInspector();
      else inspector.querySelectorAll('.branch-rule-setting').forEach(section => {
        const rule = rulesOf(scenario).find(item => item.id === section.dataset.branchRuleId);
        if (rule) section.querySelector('summary').textContent = (rule.title || rule.id) + ' · ' + ruleLabel(rule);
      });
      drawLines();
      status.textContent = events.length ? events.length + '개 사건 · ' + (model.reign ? model.reignEventIds.length + '개 연도 등록 카드 · ' : model.edges.filter(edge => edge.type === 'choice').length + '개 선택 경로 · ') + (model.warnings.length ? '연결 확인 ' + model.warnings.length + '건' : model.reign ? '연도·돌발 등록 확인됨' : '끊긴 연결 없음') + ' · 변경 후 ‘적용하고 새 게임’으로 반영' : model.reign ? '빈 치세 원고 · 치세·연도 탭에서 분야와 연도를 만든 뒤 사건을 등록하세요.' : '빈 시나리오 · 첫 사건을 추가하면 시작 사건으로 지정됩니다.';
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed) return;
        // A caller may mount inside a dialog just before showing it. Re-measure
        // real card heights once its layout becomes visible, rather than fitting
        // a zero-height layout computed while the dialog was hidden.
        if (measurementsChanged()) renderGraph(keepInspector);
        else if (fitMode) fit();
      });
    }
    function measurementsChanged() {
      return Array.from(cards.entries()).some(([id, entry]) => entry.node.offsetHeight > 0 && entry.node.offsetHeight !== positions.get(id)?.height);
    }
    function updateBounds() {
      size.width = 450;
      size.height = 250;
      positions.forEach(position => {
        size.width = Math.max(size.width, position.x + position.width + 70);
        size.height = Math.max(size.height, position.y + position.height + 55);
      });
      world.style.width = size.width + 'px';
      world.style.height = size.height + 'px';
      lines.setAttribute('width', size.width);
      lines.setAttribute('height', size.height);
      dragLines.setAttribute('width', size.width);
      dragLines.setAttribute('height', size.height);
    }

    // Rounded orthogonal routes use the whitespace around cards, including for
    // reverse edges and repeated destinations. Separate ports retain each choice.
    function roundedPath(points) {
      if (points.length < 2) return '';
      let result = 'M ' + points[0].x + ' ' + points[0].y;
      for (let index = 1; index < points.length - 1; index++) {
        const previous = points[index - 1], current = points[index], next = points[index + 1];
        const beforeLength = Math.hypot(current.x - previous.x, current.y - previous.y);
        const afterLength = Math.hypot(next.x - current.x, next.y - current.y);
        if (!beforeLength || !afterLength) continue;
        const radius = Math.min(9, beforeLength / 2, afterLength / 2);
        const before = { x: current.x - (current.x - previous.x) / beforeLength * radius, y: current.y - (current.y - previous.y) / beforeLength * radius };
        const after = { x: current.x + (next.x - current.x) / afterLength * radius, y: current.y + (next.y - current.y) / afterLength * radius };
        result += ' L ' + before.x + ' ' + before.y + ' Q ' + current.x + ' ' + current.y + ' ' + after.x + ' ' + after.y;
      }
      const last = points[points.length - 1];
      return result + ' L ' + last.x + ' ' + last.y;
    }
    function drawLines() {
      lines.replaceChildren();
      const defs = svgElement('defs');
      ['default', 'choice', 'skip', 'active'].forEach(kind => {
        const marker = svgElement('marker', { id: uid + '-' + kind, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' });
        marker.append(svgElement('path', { d: 'M 0 0 L 8 4 L 0 8 z', class: 'branch-arrow-' + kind }));
        defs.append(marker);
      });
      lines.append(defs);
      const sorted = model.edges.filter(edge => !edge.invalid).sort((a, b) => Number(a.source === selectedId || a.target === selectedId) - Number(b.source === selectedId || b.target === selectedId));
      sorted.forEach(edge => {
        const source = positions.get(edge.source), target = positions.get(edge.target);
        const sourceCard = cards.get(edge.source), targetCard = cards.get(edge.target);
        if (!source || !target || !sourceCard || !targetCard) return;
        const row = edge.type === 'choice' ? sourceCard.choiceRows[edge.choiceIndex] : sourceCard.defaultRow;
        if (!row) return;
        const active = edge.source === selectedId || edge.target === selectedId;
        const specific = active && edge.source === selectedId && edge.type === 'choice' && edge.choiceIndex === selectedChoice;
        const rank = edge.type === 'choice' ? edge.choiceIndex : edge.type === 'skip' ? sourceCard.choiceRows.length + 1 : sourceCard.choiceRows.length;
        const offset = Math.min(rank, 7) * 3;
        const sameRow = Math.abs(source.y - target.y) < 20;
        const isSelf = edge.source === edge.target;
        const towardsRight = target.x > source.x;
        const sourceX = source.x + source.width;
        let sourceY = source.y + row.offsetTop + row.offsetHeight / 2;
        if (edge.type === 'skip') sourceY += 5;
        const targetX = target.x;
        const targetY = target.y + 32;
        const sourceGutter = sourceX + 17 + offset;
        const targetGutter = targetX - 16 - offset;
        let points;
        if (sameRow && !isSelf && towardsRight && Math.abs(source.x - target.x) < 350) {
          const midpoint = (sourceX + targetX) / 2 + (towardsRight ? 1 : -1) * (offset - 10);
          points = [{ x: sourceX, y: sourceY }, { x: midpoint, y: sourceY }, { x: midpoint, y: targetY }, { x: targetX, y: targetY }];
        } else {
          let routeY;
          if (isSelf) routeY = Math.max(10, source.y - 16 - offset);
          else if (target.y > source.y) routeY = source.y + source.height + 16 + offset;
          else routeY = Math.max(10, source.y - 16 - offset);
          points = [{ x: sourceX, y: sourceY }, { x: sourceGutter, y: sourceY }, { x: sourceGutter, y: routeY }, { x: targetGutter, y: routeY }, { x: targetGutter, y: targetY }, { x: targetX, y: targetY }];
        }
        const path = svgElement('path', { d: roundedPath(points), class: 'branch-edge branch-edge-' + edge.type + (active ? ' branch-edge-active' : '') + (specific ? ' branch-edge-specific' : ''), 'marker-end': 'url(#' + uid + '-' + (specific ? 'active' : edge.type) + ')' });
        const title = svgElement('title');
        title.textContent = edge.source + ' → ' + edge.target + ' · ' + (edge.type === 'choice' ? '선택 ' + (edge.choiceIndex + 1) + (edge.inherited ? ' (기본 연결 따름)' : '') : edge.type === 'skip' ? '등장 조건 불충족' : '기본 연결');
        path.append(title);
        lines.append(path);
        lines.append(svgElement('circle', { cx: sourceX, cy: sourceY, r: specific ? 4 : 3, class: 'branch-port branch-port-' + edge.type }));
      });
    }

    function pointerDown(event) {
      if (event.button !== 0) return;
      if (event.target.closest('.branch-empty-canvas')) return;
      if (dragging) cancelDrag();
      const port = event.target.closest('.branch-output-port');
      const handle = event.target.closest('.branch-node-handle');
      if (port) {
        const id = port.dataset.branchSource;
        const choiceIndex = port.dataset.branchChoice === 'default' ? null : Number(port.dataset.branchChoice);
        chosen(id, choiceIndex === null ? undefined : choiceIndex);
        const bounds = port.getBoundingClientRect();
        dragging = { kind: 'connection', id, choiceIndex, x: event.clientX, y: event.clientY, pointerId: event.pointerId, started: false,
          start: worldPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2), port, dropId: null };
      } else if (handle) {
        const id = handle.dataset.branchDrag;
        const position = positions.get(id);
        chosen(id);
        dragging = { kind: 'node', id, x: event.clientX, y: event.clientY, startX: position.x, startY: position.y, pointerId: event.pointerId };
      } else if (!event.target.closest('.branch-node')) {
        dragging = { kind: 'pan', x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y, pointerId: event.pointerId };
      }
      if (dragging) {
        if (dragging.kind !== 'connection') {
          fitMode = false;
          stage.classList.add('branch-dragging');
        }
        stage.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    }
    function worldPoint(clientX, clientY) {
      const bounds = stage.getBoundingClientRect();
      return { x: (clientX - bounds.left - pan.x) / scale, y: (clientY - bounds.top - pan.y) / scale };
    }
    function dropTarget(clientX, clientY) {
      const bounds = stage.getBoundingClientRect();
      if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
      const hit = document.elementFromPoint(clientX, clientY)?.closest('.branch-node');
      return hit && nodeLayer.contains(hit) && cards.has(hit.dataset.branchEvent) ? hit.dataset.branchEvent : null;
    }
    function drawPendingConnection(clientX, clientY) {
      if (!dragging || dragging.kind !== 'connection') return;
      const targetId = dropTarget(clientX, clientY);
      if (dragging.dropId !== targetId) {
        if (dragging.dropId) cards.get(dragging.dropId)?.node.classList.remove('branch-drop-target');
        if (targetId) cards.get(targetId)?.node.classList.add('branch-drop-target');
        dragging.dropId = targetId;
      }
      if (!dragging.path) {
        dragging.path = svgElement('path', { class: 'branch-pending-edge' });
        dragLines.append(dragging.path);
      }
      const start = dragging.start;
      const end = targetId ? { x: positions.get(targetId).x, y: positions.get(targetId).y + 32 } : worldPoint(clientX, clientY);
      const bend = Math.max(40, Math.min(140, Math.abs(end.x - start.x) * 0.45));
      dragging.path.setAttribute('d', 'M ' + start.x + ' ' + start.y + ' C ' + (start.x + bend) + ' ' + start.y + ' ' + (end.x - bend) + ' ' + end.y + ' ' + end.x + ' ' + end.y);
      dragging.path.classList.toggle('branch-pending-valid', Boolean(targetId));
    }
    function pointerMove(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
      if (dragging.kind === 'connection') {
        if (!dragging.started && Math.hypot(dx, dy) < 4) return;
        if (!dragging.started) {
          dragging.started = true;
          fitMode = false;
          stage.classList.add('branch-connecting');
          dragging.port.classList.add('branch-output-active');
        }
        drawPendingConnection(event.clientX, event.clientY);
      } else if (dragging.kind === 'pan') {
        pan = { x: dragging.startX + dx, y: dragging.startY + dy };
        updateTransform();
      } else {
        const position = positions.get(dragging.id), card = cards.get(dragging.id);
        position.x = Math.max(35, dragging.startX + dx / scale);
        position.y = Math.max(40, dragging.startY + dy / scale);
        position.manual = true;
        card.node.style.left = position.x + 'px';
        card.node.style.top = position.y + 'px';
        updateBounds();
        drawLines();
      }
    }
    function cancelDrag() {
      const previous = dragging;
      dragging = null;
      stage.classList.remove('branch-dragging', 'branch-connecting');
      dragLines.replaceChildren();
      if (previous?.dropId) cards.get(previous.dropId)?.node.classList.remove('branch-drop-target');
      if (previous?.port) previous.port.classList.remove('branch-output-active');
      if (previous && stage.hasPointerCapture(previous.pointerId)) stage.releasePointerCapture(previous.pointerId);
    }
    function pointerUp(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      const previous = dragging;
      const targetId = previous.kind === 'connection' && previous.started ? dropTarget(event.clientX, event.clientY) : null;
      cancelDrag();
      if (previous.kind === 'node' && (positions.get(previous.id)?.x !== previous.startX || positions.get(previous.id)?.y !== previous.startY)) {
        scenario.editorLayout = { ...(scenario.editorLayout || {}), positions: Object.fromEntries([...positions].filter(([, position]) => position.manual).map(([id, position]) => [id, { x: position.x, y: position.y }])) };
        onChange();
      }
      if (targetId && connect(scenario, previous.id, previous.choiceIndex, targetId)) {
        onChange();
        renderGraph();
        chosen(previous.id, previous.choiceIndex === null ? undefined : previous.choiceIndex);
        status.textContent = previous.id + ' · ' + (previous.choiceIndex === null ? '기본 연결' : '선택 ' + (previous.choiceIndex + 1)) + ' → ' + targetId + ' 연결됨 · ‘적용하고 새 게임’으로 반영';
      } else if (previous.kind === 'connection' && previous.started) status.textContent = '연결을 취소했습니다. 기존 다음 사건을 유지합니다.';
    }
    function pointerCancelled(event) {
      if (dragging && event.pointerId === dragging.pointerId) cancelDrag();
    }
    function escapeDrag(event) {
      if (event.key === 'Escape' && dragging?.kind === 'connection') {
        event.preventDefault();
        event.stopPropagation();
        cancelDrag();
        status.textContent = '연결을 취소했습니다. 기존 다음 사건을 유지합니다.';
      }
    }
    function wheel(event) {
      event.preventDefault();
      if (dragging?.kind === 'connection') return;
      if (event.ctrlKey || event.metaKey) zoomAt(scale * Math.exp(-event.deltaY * 0.008), event.clientX, event.clientY);
      else {
        pan.x -= event.deltaX;
        pan.y -= event.deltaY;
        fitMode = false;
        updateTransform();
      }
    }
    function keydown(event) {
      if (event.target !== stage) return;
      const directions = { ArrowLeft: [45, 0], ArrowRight: [-45, 0], ArrowUp: [0, 45], ArrowDown: [0, -45] };
      if (directions[event.key]) {
        event.preventDefault();
        pan.x += directions[event.key][0];
        pan.y += directions[event.key][1];
        fitMode = false;
        updateTransform();
      } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(scale * 1.2); }
      else if (event.key === '-') { event.preventDefault(); zoomAt(scale / 1.2); }
      else if (event.key === '0') { event.preventDefault(); fit(); }
    }
    stage.addEventListener('pointerdown', pointerDown);
    stage.addEventListener('pointermove', pointerMove);
    stage.addEventListener('pointerup', pointerUp);
    stage.addEventListener('pointercancel', pointerCancelled);
    stage.addEventListener('lostpointercapture', pointerCancelled);
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('keydown', keydown);
    host.addEventListener('keydown', escapeDrag, true);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (measurementsChanged()) renderGraph(true);
      else if (fitMode) fit();
    }) : null;
    if (resizeObserver) resizeObserver.observe(stage);
    renderGraph();
    updateTransform();
    return () => {
      disposed = true;
      cancelDrag();
      if (frame) cancelAnimationFrame(frame);
      if (editFrame) cancelAnimationFrame(editFrame);
      if (resizeObserver) resizeObserver.disconnect();
      stage.removeEventListener('pointerdown', pointerDown);
      stage.removeEventListener('pointermove', pointerMove);
      stage.removeEventListener('pointerup', pointerUp);
      stage.removeEventListener('pointercancel', pointerCancelled);
      stage.removeEventListener('lostpointercapture', pointerCancelled);
      stage.removeEventListener('wheel', wheel);
      stage.removeEventListener('keydown', keydown);
      host.removeEventListener('keydown', escapeDrag, true);
      host.remove();
    };
  }

  root.ScenarioFlowchart = { mount, analyze, addEvent, addChoice, addRandomEvent, addRandomRule, removeChoice, removeRandomRule, connect };
})(globalThis);
