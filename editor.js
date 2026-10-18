/* Scenario editor: plain data in, plain data out. No network or executable scenario code. */
(function () {
  'use strict';

  let current = null;
  let resetUndo = null;
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
    ['events', '사건·선택지'], ['flowchart', '분기 흐름도'], ['randomEvents', '돌발 사건'], ['endings', '엔딩'], ['json', 'JSON']
  ];
  const mark = () => { if (current) current.dirty = true; };

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
    node.addEventListener('change', () => { action(node.value); mark(); });
    wrap.append(node);
    if (options.help) wrap.append($('span', 'small muted', options.help));
    return wrap;
  }

  function checkbox(label, value, action, help) {
    const wrap = $('label', 'field-row');
    const node = $('input');
    node.type = 'checkbox';
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
      ...draft.events.map(item => item.id), ...draft.endings.map(item => item.id), ...(draft.randomEvents || []).map(item => item.id)]);
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
    const wrap = section(title, help || '아래 조건을 모두 만족해야 합니다. 조건이 없으면 항상 허용됩니다.');
    const rows = $('div');
    wrap.append(rows);

    function renderRows() {
      rows.replaceChildren();
      if (!list.length) rows.append($('p', 'small muted', '조건 없음 · 항상 허용'));
      list.forEach((condition, index) => {
        const row = $('div', 'condition-row');
        const isFlag = condition.kind === 'flag';
        const keys = (isFlag ? current.draft.flags : current.draft.stats).map(item => [item.id, item.name + ' (' + item.id + ')']);
        const operators = isFlag
          ? [['eq', '같음'], ['ne', '다름']]
          : [['gte', '이상 ≥'], ['lte', '이하 ≤'], ['eq', '같음 ='], ['ne', '다름 ≠'], ['gt', '초과 >'], ['lt', '미만 <']];
        row.append(
          select('종류', condition.kind, [['stat', '수치'], ['flag', '선택 기록']], value => {
            condition.kind = value;
            condition.key = (value === 'flag' ? current.draft.flags : current.draft.stats)[0]?.id || '';
            condition.op = value === 'flag' ? 'eq' : 'gte';
            condition.value = value === 'flag' ? true : 50;
            renderRows();
          }, { compact: true }),
          select('대상', condition.key, keys, value => { condition.key = value; }, { compact: true }),
          select('비교', condition.op, operators, value => { condition.op = value; }, { compact: true })
        );
        row.append(isFlag
          ? select('값', String(condition.value), [['true', '참 · 있음'], ['false', '거짓 · 없음']], value => { condition.value = value === 'true'; }, { compact: true })
          : input('기준값', condition.value, value => { condition.value = value; }, { type: 'number', compact: true, step: 'any' }));
        row.append(button('삭제', () => { list.splice(index, 1); mark(); renderRows(); }, 'danger'));
        rows.append(row);
      });
    }
    renderRows();
    const addCondition = button('＋ 조건 추가', () => {
      const hasStat = current.draft.stats.length > 0;
      list.push({ kind: hasStat ? 'stat' : 'flag', key: (hasStat ? current.draft.stats : current.draft.flags)[0]?.id || '',
        op: hasStat ? 'gte' : 'eq', value: hasStat ? 50 : true });
      mark();
      renderRows();
    });
    addCondition.disabled = !current.draft.stats.length && !current.draft.flags.length;
    wrap.append(addCondition);
    if (addCondition.disabled) wrap.append($('p', 'small muted', '조건을 만들려면 수치 또는 선택 기록을 먼저 추가하세요.'));
    return wrap;
  }

  function renderOverview(content) {
    const draft = current.draft;
    content.append($('h2', '', '이야기의 기본 설정'));
    content.append(notice('제목과 설명부터 바꿔 보세요. 사건·수치·기록의 ID는 다른 항목에서 연결할 때 사용하는 고유 이름입니다. ID를 바꾸면 연결 대상도 직접 수정해야 합니다.'));
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
        input('연결용 ID', stat.id, value => { stat.id = value; }, { help: 'ID를 바꾸면 기존 효과·조건의 연결도 직접 바꿔야 합니다.' })
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
        input('연결용 ID', flag.id, value => { flag.id = value; }, { help: 'ID를 바꾸면 기존 기록 변경·조건의 연결도 직접 바꿔야 합니다.' })
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
      input('연결용 ID', event.id, value => { event.id = value; }, { help: 'ID를 바꾸면 시작 사건과 다음 장면 연결도 직접 바꿔야 합니다.' })
    ), grid(
      input('장 / 부', event.chapter, value => { event.chapter = value; }),
      input('날짜 / 시점', event.date, value => { event.date = value; }),
      input('화자 / 보고자', event.speaker, value => { event.speaker = value; })
    ), input('본문', event.body, value => { event.body = value; }, { multiline: true, rows: 7 }),
    select('기본 다음 장면', event.next, eventOptions(false), value => { event.next = value; },
      { help: '선택지에 별도 연결이 있으면 선택지 설정을 우선합니다. 등장 조건을 만족하지 않은 사건은 이 기본 연결을 따라 건너뜁니다.' }));
    if (!Array.isArray(event.when)) event.when = [];
    details.append(builder(event.when, '사건 등장 조건'));
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
      input('연결용 ID', ending.id, value => { ending.id = value; }, { help: '기본 엔딩의 ID를 바꾸면 위의 기본 엔딩 지정도 바꿔야 합니다.' })
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

  function parseJSON(text) {
    let value;
    try { value = JSON.parse(text); }
    catch (error) { return { errors: ['JSON 문법 오류: ' + error.message], warnings: [], value: null }; }
    const report = validation(value);
    return { ...report, value };
  }

  function acceptJSON(redraw) {
    const result = parseJSON(current.jsonBuffer);
    if (result.errors.length) { showReport(result); return false; }
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

  function exportJSON() {
    let text;
    if (current.jsonDirty) {
      const result = parseJSON(current.jsonBuffer);
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
    reader.addEventListener('load', () => {
      if (current !== owner) return;
      const result = parseJSON(String(reader.result).replace(/^\uFEFF/, ''));
      if (result.errors.length) { showReport(result); return; }
      if (current.dirty && !confirm('가져온 파일로 현재 편집 초안을 교체할까요? 아직 내보내지 않은 수정은 사라집니다.')) return;
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

  function check() {
    if (current.jsonDirty) {
      const parsed = parseJSON(current.jsonBuffer);
      if (parsed.errors.length) { showReport(parsed); return; }
      showReport(playReport(parsed.value), '플레이 검사를 통과했습니다. JSON 내용은 아직 편집 초안에 반영하지 않았습니다.');
      return;
    }
    showReport(playReport(current.draft), '플레이 검사를 통과했습니다. “적용하고 새 게임”으로 실행할 수 있습니다.');
  }

  function apply() {
    if (current.jsonDirty && !acceptJSON(false)) return;
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

  function saveDraft() {
    if (current.jsonDirty && !acceptJSON(false)) return;
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

  function navigate(page) {
    if (current.page === 'json' && current.jsonDirty && page !== 'json') {
      if (!acceptJSON(false)) return;
    }
    current.page = page;
    render();
  }

  function render() {
    if (!current) return;
    if (current.flowchartCleanup) { current.flowchartCleanup(); current.flowchartCleanup = null; }
    current.dialog.classList.toggle('flowchart-mode', current.page === 'flowchart');
    const root = document.getElementById('editor-root');
    root.replaceChildren();
    const shell = $('div', 'editor-shell');
    const top = $('header', 'editor-top');
    const title = $('div');
    title.append($('h2', '', '시나리오 작업실'), $('p', 'small muted', '작성 중에는 초안 저장, 완성하면 적용하고 새 게임을 사용하세요. 수정한 파일은 JSON으로 따로 보관해 두세요.'));
    const tools = $('div', 'toolbar');
    const fileInput = $('input');
    fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
    fileInput.addEventListener('change', () => { importJSON(fileInput.files[0]); fileInput.value = ''; });
    tools.append(button('JSON 가져오기', () => fileInput.click()), button('JSON 내보내기', exportJSON), fileInput,
      button('전체 삭제', clearAll, 'danger'));
    if (resetUndo) tools.append(button('전체 삭제 되돌리기', undoClear));
    top.append(title, tools);
    const nav = $('nav', 'editor-nav');
    nav.setAttribute('aria-label', '시나리오 편집 탭');
    tabs.forEach(([id, label]) => {
      const tab = button(label, () => navigate(id), current.page === id ? 'secondary selected' : 'secondary');
      if (current.page === id) tab.setAttribute('aria-current', 'page');
      nav.append(tab);
    });
    const content = $('main', 'editor-content' + (current.page === 'flowchart' ? ' flowchart-content' : ''));
    if (current.page !== 'flowchart') {
      ({ overview: renderOverview, stats: renderStats, flags: renderFlags, events: renderEventList, randomEvents: renderRandomEvents, endings: renderEndings, json: renderJSON })[current.page](content);
    }
    const report = $('div', 'notice');
    report.id = 'editor-report'; report.hidden = true; report.setAttribute('role', 'status'); report.setAttribute('aria-live', 'polite');
    const footer = $('footer', 'editor-footer');
    footer.append(button('검사하기', check), button('초안 저장', saveDraft), button('적용하고 새 게임', apply, 'primary'), button('닫기', () => close(false)));
    shell.append(top, nav, content, report, footer);
    root.append(shell);
    if (current.page === 'flowchart') {
      current.flowchartCleanup = ScenarioFlowchart.mount(content, {
        scenario: current.draft,
        onChange: mark,
        onOpenRandomEvents: () => navigate('randomEvents'),
        onOpenEvent: eventId => {
          const index = current.draft.events.findIndex(event => event.id === eventId);
          if (index >= 0) { current.eventIndex = index; navigate('events'); }
        }
      });
    }
  }

  function close(force) {
    if (!current) return true;
    if (!force && current.dirty && !confirm('아직 게임에 적용하지 않은 편집 초안을 닫을까요? 보관하려면 취소하고 JSON으로 내보내세요.')) return false;
    const dialog = current.dialog;
    if (current.flowchartCleanup) current.flowchartCleanup();
    dialog.classList.remove('flowchart-mode');
    current = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    return true;
  }

  function open(scenario, onApply, options = {}) {
    const report = validation(scenario);
    if (report.errors.length) throw new Error('편집할 시나리오를 확인해 주세요.\n' + report.errors.map(messageText).join('\n'));
    if (typeof onApply !== 'function') throw new Error('시나리오 적용 함수가 없습니다.');
    if (current && !close(false)) return;
    const dialog = document.getElementById('editor-dialog');
    if (!dialog || !document.getElementById('editor-root')) throw new Error('편집기 dialog 요소가 없습니다.');
    current = { draft: copy(scenario), onApply, dialog, dirty: false, page: tabs.some(([id]) => id === options.page) ? options.page : 'overview', eventIndex: 0, endingIndex: 0, randomIndex: 0, jsonBuffer: '', jsonDirty: false, flowchartCleanup: null };
    if (!dialog.dataset.editorBound) {
      dialog.dataset.editorBound = 'true';
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(false); });
    }
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
    render();
    dialog.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
  }

  globalThis.ScenarioEditor = { open, close: () => close(false) };
})();
