/* AI handoff helpers: build copyable prompts and read pasted AI answers.
   No network access. The site never calls an AI service directly. */
(function (root) {
  'use strict';

  const EXAMPLE = {
    schemaVersion: 1,
    id: 'example_salt_city',
    title: '소금 도시의 겨울',
    subtitle: '봉쇄된 항구 도시의 마지막 석 달',
    description: '형식 예시용 짧은 시나리오입니다.',
    player: { askName: true, label: '시장의 이름', defaultName: '시장' },
    start: 'e_blockade',
    stats: [
      { id: 'food', name: '식량', description: '도시가 버틸 수 있는 양식', min: 0, max: 100, initial: 50, color: '#8a6d3b' },
      { id: 'trust', name: '민심', description: '시민들이 시장을 믿는 정도', min: 0, max: 100, initial: 60, color: '#3f6d4f' }
    ],
    flags: [
      { id: 'smugglers', name: '밀수업자와 손잡음', initial: false }
    ],
    events: [
      {
        id: 'e_blockade', chapter: '제1장', date: '11월', speaker: '항만 관리관', title: '봉쇄 첫날',
        body: '적 함대가 항구 입구를 막았습니다. 창고의 곡물은 석 달을 버티기 어렵습니다. {name} 시장님, 어떻게 하시겠습니까?',
        next: 'e_winter',
        choices: [
          { text: '배급제를 시행한다', description: '공평하지만 모두가 배고프다', effects: { food: 15, trust: -10 } },
          { text: '밀수업자에게 길을 연다', description: '식량은 들어오지만 소문이 돈다', effects: { food: 25, trust: -5 }, setFlags: { smugglers: true } },
          { text: '시민에게 사실을 알린다', effects: { trust: 10, food: -5 } }
        ]
      },
      {
        id: 'e_winter', chapter: '제2장', date: '1월', title: '혹한',
        body: '항구가 얼어붙었습니다. 시민들이 광장에 모여 시장의 답을 기다립니다.',
        next: 'END',
        choices: [
          { text: '밀수 창고를 열어 나눈다', when: [{ kind: 'flag', key: 'smugglers', op: 'eq', value: true }], effects: { food: -10, trust: 20 } },
          { text: '끝까지 버티자고 연설한다', effects: { trust: 5, food: -15 } },
          { text: '항복 협상을 준비한다', effects: { trust: -20 }, next: 'END' }
        ]
      },
      {
        id: 'e_fire', title: '창고 화재',
        body: '한밤중 곡물 창고에서 불길이 치솟았습니다.',
        next: 'RETURN',
        choices: [
          { text: '병사를 보내 불을 끈다', effects: { food: -5 } },
          { text: '방화범을 먼저 쫓는다', effects: { food: -15, trust: 5 } }
        ]
      }
    ],
    randomEvents: [
      { id: 'r_fire', title: '창고 화재', eventId: 'e_fire', when: [{ kind: 'stat', key: 'food', op: 'gte', value: 40 }], chance: 30, priority: 1, once: true }
    ],
    endings: [
      { id: 'end_riot', title: '굶주린 폭동', summary: '광장은 분노로 가득 찼다.', body: '식량이 바닥나자 시민들이 시청을 덮쳤습니다.', kind: 'bad', priority: 10, immediate: true, when: [{ kind: 'stat', key: 'food', op: 'lte', value: 0 }] },
      { id: 'end_spring', title: '봄의 항구', summary: '도시는 겨울을 이겨 냈다.', body: '얼음이 녹고 봉쇄가 풀렸습니다. 사람들은 {name}의 이름을 오래 기억했습니다.', kind: 'good', priority: 5, immediate: false, when: [{ kind: 'stat', key: 'trust', op: 'gte', value: 60 }, { kind: 'stat', key: 'food', op: 'gte', value: 20 }] },
      { id: 'end_shadow', title: '그림자 시장', summary: '살아남았지만 빚이 남았다.', body: '밀수업자들은 이제 도시의 진짜 주인이 되었습니다.', kind: 'mixed', priority: 3, immediate: false, when: [{ kind: 'flag', key: 'smugglers', op: 'eq', value: true }] },
      { id: 'end_surrender', title: '조용한 항복', summary: '도시는 함락되지 않고 넘겨졌다.', body: '피는 흐르지 않았지만, 깃발은 바뀌었습니다.', kind: 'mixed', priority: 0, immediate: false }
    ],
    defaultEnding: 'end_surrender'
  };

  const SIZES = {
    short: { label: '짧게', events: '6~9', note: '추천' },
    medium: { label: '보통', events: '12~16', note: '' },
    long: { label: '길게', events: '20~30', note: '답변이 끊길 수 있음' }
  };

  const RULES = `[JSON 형식 규칙]
1. 답변은 JSON 객체 하나뿐이다. 앞뒤 설명, 주석(//), 말줄임(...)을 쓰지 마라. \`\`\`json 코드블록으로 감싸는 것은 괜찮다.
2. 모든 id는 영문자로 시작하고 영문·숫자·밑줄(_)만 쓴다. 같은 종류 안에서 중복 금지. 사건 id로 END, RETURN은 쓸 수 없다.
3. start, next, eventId, defaultEnding, 그리고 effects·setFlags·when의 key는 반드시 이 JSON 안에 실제로 정의한 id를 가리켜야 한다.
4. 조건 when은 배열이다. 수치: {"kind":"stat","key":"수치id","op":"gte","value":50} / 기록: {"kind":"flag","key":"기록id","op":"eq","value":true}. op는 eq, ne, gte, lte, gt, lt 중 하나이고 기록에는 eq, ne만 쓴다. 여러 조건은 모두 만족해야 한다.
5. 수치(stats)는 min < max, min ≤ initial ≤ max인 숫자. effects 값은 숫자(예: -10, 15). color는 "#RRGGBB".
6. 기록(flags)의 initial과 setFlags 값은 true 또는 false.
7. 모든 사건(events)에는 id, title, body, next, choices(1~20개, 보통 2~4개)가 있어야 한다. next는 사건 id 또는 "END"(돌발 사건은 "RETURN").
8. 모든 사건에는 when이 없는 선택지가 적어도 1개 있어야 한다. 그래야 선택지가 모두 잠기지 않는다.
9. 모든 엔딩에는 id, title, body, kind("good"/"mixed"/"bad"), priority(숫자), immediate(true/false)가 있어야 한다. chance는 immediate:true인 엔딩에만 쓴다.
10. defaultEnding은 immediate:false이고 when이 없는 엔딩의 id여야 한다.
11. 개수 제한: 수치 1~20, 기록 0~200, 사건 1~1000, 엔딩 1~100. "draft" 속성은 넣지 마라.`;

  const GAME = `[게임 규칙 — 이 규칙대로 작동하도록 설계해라]
- 플레이어는 사건(event)을 읽고 선택지(choice) 하나를 고른다. 선택지의 effects만큼 수치가 오르내리고(min~max 범위로 잘림), setFlags로 기록이 켜지거나 꺼진다.
- 다음 사건: 선택지에 next가 있으면 그곳으로, 없으면 사건의 next로 간다. "END"에 도착하면 이야기가 끝나고 엔딩을 고른다.
- 사건에 when(등장 조건)이 있고 맞지 않으면 그 사건을 건너뛰고 그 사건의 next로 간다.
- 선택지에 when이 있고 맞지 않으면 그 선택지는 잠긴 채 보인다.
- 즉시 엔딩(immediate:true): 매 선택 직후 조건을 검사해 맞으면 곧바로 게임이 끝난다(예: 식량 0 이하 → 폭동). chance(1~99)를 주면 그 확률로만 발동한다.
- 일반 엔딩(immediate:false): "END"에 도착했을 때 조건이 맞는 엔딩 중 priority가 가장 높은 것이 나온다. 하나도 맞지 않으면 defaultEnding이 나온다.
- 돌발 사건(randomEvents, 선택 사항): 매 선택 후 조건이 맞으면 chance% 확률로 eventId의 사건이 끼어든다. 그 사건의 next를 "RETURN"으로 두면 원래 가려던 사건으로 돌아간다. once:true면 한 번만 일어난다.
- 본문·제목에 {name}을 쓰면 플레이어가 입력한 이름으로 바뀐다.
- 사건에는 chapter, date, speaker(말하는 사람), 선택지에는 description(짧은 설명)을 선택적으로 넣을 수 있다.`;

  const CRAFT = `[재미있는 시나리오를 위한 지침]
- 엔딩마다 서로 다른 수치·기록 조합으로 도달하게 하고, 각 엔딩에 실제로 도달할 수 있는 경로가 있는지 확인해라.
- 수치가 극단으로 치우치면 나오는 즉시 엔딩(bad)을 2~3개 두면 긴장감이 생긴다.
- 선택지마다 얻는 것과 잃는 것이 함께 있게 하라. 정답이 뻔한 선택지는 피하라.
- 중요한 결정은 setFlags로 기록하고, 뒤의 사건 등장 조건·잠긴 선택지·엔딩 조건에 활용하라.
- 이야기가 한 줄로만 흐르지 않도록 선택에 따라 다른 사건으로 갈라졌다가 다시 만나게 하라.`;

  function buildPrompt(options = {}) {
    const idea = String(options.idea || '').trim();
    const size = SIZES[options.size] || SIZES.short;
    const endings = Number(options.endings) || 5;
    const base = options.baseScenario;
    const head = '너는 선택형 텍스트 게임 「역사의 갈림길」의 시나리오 작가다.';
    if (base) {
      return [
        head,
        '아래 [현재 시나리오] JSON을 [요청]에 맞게 고치거나 늘려라. 바뀌지 않은 부분까지 모두 포함한 전체 JSON 하나로만 답해라.',
        '',
        '[요청]',
        idea || '이야기를 더 풍성하게 다듬고, 사건과 엔딩을 조금 더 늘려 줘.',
        '',
        GAME, '', RULES, '', CRAFT, '',
        '[현재 시나리오]',
        JSON.stringify(base)
      ].join('\n');
    }
    return [
      head,
      '아래 [만들 이야기]로 시나리오를 쓰고, [JSON 형식 규칙]에 정확히 맞는 JSON 하나로만 답해라.',
      '',
      '[만들 이야기]',
      idea || '주제는 네가 골라라. 실제 역사의 한 갈림길에서 다른 선택을 했다면 어떻게 되었을지 그리는 대체역사 이야기.',
      '',
      '[분량]',
      `- 사건(events) ${size.events}개, 엔딩(endings) ${endings}개(그중 즉시 엔딩 1~3개), 수치(stats) 3~5개, 기록(flags) 2~6개.`,
      '- 사건 본문은 3~6문장, 엔딩 본문은 3~7문장으로 간결하게 써라. 답변이 길어져 중간에 끊기지 않도록 분량을 지켜라.',
      '- 모든 글은 한국어로 쓴다. id만 영문으로 쓴다.',
      '',
      GAME, '', RULES, '', CRAFT, '',
      '[형식 예시 — 구조만 참고하고 내용·id·수치는 새로 만들어라]',
      JSON.stringify(EXAMPLE)
    ].join('\n');
  }

  function buildRepairPrompt(problem) {
    const lines = ['방금 준 시나리오 JSON을 「역사의 갈림길」에 불러왔더니 아래 문제가 있었다.'];
    if (problem.kind === 'truncated') {
      lines.push('', '[문제]', '- 답변이 중간에 끊겨 JSON이 완성되지 않았다.', '',
        '같은 이야기를 사건 본문과 엔딩 본문을 더 짧게 줄이고 필요하면 사건 수도 줄여서, 처음부터 끝까지 완성된 전체 JSON 하나로 다시 출력해라. 설명은 쓰지 말고 JSON만 출력해라.');
    } else if (problem.kind === 'parse') {
      lines.push('', '[문제]', `- JSON 문법 오류: ${problem.detail}`, '- 쉼표 누락·남는 쉼표, 따옴표(" 대신 “ ”), 닫히지 않은 괄호, 주석이나 말줄임(...)이 있는지 확인해라.', '',
        '문법을 고친 전체 JSON을 처음부터 끝까지 다시 출력해라. 설명은 쓰지 말고 JSON만 출력해라.');
    } else if (problem.kind === 'empty') {
      lines.push('', '[문제]', '- 답변에서 JSON 객체({ ... })를 찾지 못했다.', '',
        '설명 없이 시나리오 전체를 JSON 객체 하나로 출력해라.');
    } else {
      const errors = (problem.errors || []).slice(0, 40);
      lines.push('', '[문제]', ...errors.map(item => '- ' + item));
      if ((problem.errors || []).length > errors.length) lines.push(`- 그 밖에 ${problem.errors.length - errors.length}개`);
      lines.push('', '위 문제를 모두 고친 전체 JSON을 처음부터 끝까지 다시 출력해라. 고친 부분만이 아니라 전체를 출력하고, 설명은 쓰지 마라.');
    }
    lines.push('', RULES);
    return lines.join('\n');
  }

  class PasteError extends Error {
    constructor(kind, message, detail = '') { super(message); this.kind = kind; this.detail = detail; }
  }

  // Walks text outside JSON strings. Returns the end index of the balanced object, or -1.
  function balancedEnd(text, start) {
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') { depth -= 1; if (depth === 0) return i; }
    }
    return -1;
  }

  // Light, string-aware cleanup: comments and trailing commas only.
  function looseClean(text) {
    let out = '', inString = false, escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (inString) {
        out += c;
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; out += c; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i += 1; out += '\n'; continue; }
      if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
      if (c === ',') {
        let j = i + 1; while (j < text.length && /\s/.test(text[j])) j += 1;
        if (text[j] === '}' || text[j] === ']') continue;
      }
      out += c;
    }
    return out;
  }

  function locate(text, position) {
    const before = text.slice(0, position), line = before.split('\n').length, column = position - before.lastIndexOf('\n');
    const snippet = text.slice(Math.max(0, position - 30), position + 30).replace(/\s+/g, ' ').trim();
    return `${line}번째 줄 ${column}번째 글자 근처 “${snippet}”`;
  }

  function extract(raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new PasteError('empty', '붙여 넣은 내용이 없습니다. AI의 답변을 복사해 붙여 넣어 주세요.');
    // Drop markdown fence lines so a continued answer can be appended at the end.
    const text = raw.replace(/^﻿/, '').split(/\r?\n/).filter(line => !/^\s*```/.test(line)).join('\n');
    const start = text.indexOf('{');
    if (start < 0) throw new PasteError('empty', '붙여 넣은 내용에서 JSON({ … })을 찾지 못했습니다. AI 답변 전체를 복사했는지 확인해 주세요.');
    const end = balancedEnd(text, start);
    if (end < 0) throw new PasteError('truncated', 'AI 답변이 중간에 끊긴 것 같습니다. JSON의 끝(마지막 } )이 없습니다.');
    const body = text.slice(start, end + 1);
    let value, cleaned = false;
    try { value = JSON.parse(body); } catch (first) {
      try { value = JSON.parse(looseClean(body)); cleaned = true; } catch (second) {
        const match = /position (\d+)/.exec(first.message);
        const detail = match ? locate(body, Number(match[1])) : '정확한 위치를 찾지 못했습니다';
        throw new PasteError('parse', `JSON 문법 오류가 있습니다. ${detail}`, detail);
      }
    }
    // Some answers wrap the scenario: {"scenario": {...}}.
    if (value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === undefined && !Array.isArray(value.events)) {
      const inner = Object.values(value).filter(item => item && typeof item === 'object' && !Array.isArray(item) && Array.isArray(item.events));
      if (inner.length === 1) value = inner[0];
    }
    return { value, cleaned };
  }

  // Fill fields AI answers commonly omit. Only unambiguous defaults; returns notes.
  function normalize(scenario) {
    const fixes = [];
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return fixes;
    if (scenario.schemaVersion === undefined || scenario.schemaVersion === '1') { scenario.schemaVersion = 1; fixes.push('schemaVersion'); }
    if (typeof scenario.id !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(scenario.id)) { scenario.id = 'ai_scenario'; fixes.push('시나리오 id'); }
    if (scenario.flags === undefined) { scenario.flags = []; fixes.push('flags'); }
    if (scenario.draft !== undefined) { delete scenario.draft; fixes.push('draft 제거'); }
    if (Array.isArray(scenario.events)) scenario.events.forEach(event => {
      if (event && typeof event === 'object' && event.next === undefined) { event.next = 'END'; fixes.push(`사건 ${event.id || ''}의 next`); }
    });
    if (Array.isArray(scenario.endings)) {
      scenario.endings.forEach(ending => {
        if (!ending || typeof ending !== 'object') return;
        if (typeof ending.immediate !== 'boolean') { ending.immediate = ending.chance !== undefined; fixes.push(`엔딩 ${ending.id || ''}의 immediate`); }
        if (typeof ending.priority !== 'number') { ending.priority = Number(ending.priority) || 0; fixes.push(`엔딩 ${ending.id || ''}의 priority`); }
        if (!['good', 'mixed', 'bad'].includes(ending.kind)) { ending.kind = 'mixed'; fixes.push(`엔딩 ${ending.id || ''}의 kind`); }
      });
      const ids = new Set(scenario.endings.map(ending => ending && ending.id));
      if (!ids.has(scenario.defaultEnding)) {
        const fallback = scenario.endings.find(ending => ending && ending.immediate === false && (!ending.when || ending.when.length === 0));
        if (fallback) { scenario.defaultEnding = fallback.id; fixes.push('defaultEnding'); }
      }
    }
    if (Array.isArray(scenario.events) && scenario.events.length && !scenario.events.some(event => event && event.id === scenario.start)) {
      scenario.start = scenario.events[0] && scenario.events[0].id; fixes.push('start');
    }
    return fixes;
  }

  root.ScenarioAI = { EXAMPLE, SIZES, buildPrompt, buildRepairPrompt, extract, normalize, PasteError };
})(typeof window !== 'undefined' ? window : globalThis);
