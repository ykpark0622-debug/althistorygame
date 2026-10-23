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
2. 모든 id는 영문자로 시작하고 영문·숫자·밑줄(_)만 쓴다. 같은 종류 안에서 중복 금지. 사건 id로 END, RETURN, REIGN은 쓸 수 없다.
3. start, next, eventId, defaultEnding, effects·setFlags·when의 key는 정의된 id를 가리켜야 한다. 지도 지역·국가 id만 선택한 기본 지도의 목록을 참조한다.
4. 조건 when은 배열이다. 수치: {"kind":"stat","key":"수치id","op":"gte","value":50} / 기록: {"kind":"flag","key":"기록id","op":"eq","value":true}. op는 eq, ne, gte, lte, gt, lt 중 하나이고 기록에는 eq, ne만 쓴다. 여러 조건은 모두 만족해야 한다.
5. 수치(stats)는 min < max, min ≤ initial ≤ max인 숫자. effects 값은 숫자(예: -10, 15). color는 "#RRGGBB".
6. 기록(flags)의 initial과 setFlags 값은 true 또는 false.
7. 모든 사건(events)에는 id, title, body, next, choices(1~20개, 보통 2~4개)가 있어야 한다. next는 사건 id 또는 "END"(돌발 사건은 "RETURN").
8. 모든 사건에는 when이 없는 선택지가 적어도 1개 있어야 한다. 그래야 선택지가 모두 잠기지 않는다.
9. 모든 엔딩에는 id, title, body, kind("good"/"mixed"/"bad"), priority(숫자), immediate(true/false)가 있어야 한다. chance는 immediate:true인 엔딩에만 쓴다.
10. defaultEnding은 immediate:false이고 when이 없는 엔딩의 id여야 한다.
11. 개수 제한: 수치 1~20, 기록 0~200, 사건 1~1000, 엔딩 1~100. "draft" 속성은 넣지 마라.
12. schemaVersion은 숫자 1 또는 2다. 기존 V1은 사건형(chronicle)이다. 지도나 연차 통치(reign)를 쓰면 숫자 2를 사용한다. V2의 mode는 "chronicle" 또는 "reign"이다.`;

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

  const copy = value => JSON.parse(JSON.stringify(value));

  function settings(options = {}) {
    const base = options.baseScenario || {};
    const mode = ['chronicle', 'reign'].includes(options.mode) ? options.mode : (base.schemaVersion === 2 && base.mode === 'reign' ? 'reign' : 'chronicle');
    const id = Object.prototype.hasOwnProperty.call(options, 'mapTemplateId') ? options.mapTemplateId : base.map?.templateId;
    const templateId = typeof id === 'string' ? id : '';
    const template = templateId && root.MapTemplates && typeof root.MapTemplates.get === 'function' ? root.MapTemplates.get(templateId) : null;
    if (templateId && !template) throw new Error('선택한 지도 틀을 찾을 수 없습니다: ' + templateId);
    return { mode, template, countryId: options.mapCountryId || base.map?.playerCountry || '', version: mode === 'reign' || template || base.schemaVersion === 2 ? 2 : 1 };
  }

  function promptProvinces(template, countryId, base) {
    const limit = 300;
    if (template.provinces.length <= limit) return template.provinces;
    const byId = new Map(template.provinces.map(province => [province.id, province])), selected = new Map();
    const add = province => { if (province && selected.size < limit) selected.set(province.id, province); };
    // Keep the existing scenario's actual targets ahead of optional examples.
    add(template.provinces[0]);
    if (base?.map?.templateId === template.id) {
      for (const values of Object.values(base.map.initial || {})) for (const id of Object.keys(values || {})) add(byId.get(id));
      const visit = value => {
        if (!value || typeof value !== 'object' || selected.size >= limit) return;
        if (value.prov) add(byId.get(value.prov));
        if (value.kind === 'territory') add(byId.get(value.key));
        for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
      };
      visit(base.events); visit(base.reign); visit(base.endings);
    }
    if (countryId) {
      for (const province of template.provinces) if ((base?.map?.initial?.owners?.[province.id] || province.owner) === countryId) add(province);
    } else {
      // Give a new world scenario real IDs from different countries, rather
      // than filling the prompt with the first alphabetic country's districts.
      const owners = new Set();
      for (const province of template.provinces) if (!owners.has(province.owner)) { owners.add(province.owner); add(province); }
    }
    for (const province of template.provinces) add(province);
    return [...selected.values()];
  }

  function mapInstructions(template, countryId, base) {
    if (!template) return '[지도 선택]\n- 지도를 사용하지 않는다. 출력 JSON에는 map과 territory 및 kind:"territory" 조건을 넣지 마라. [현재 시나리오]에 있더라도 출력에서 제거하고 지도 없이 진행하도록 고쳐라.';
    const provinces = promptProvinces(template, countryId, base), limited = provinces.length < template.provinces.length;
    const registry=root.MapTemplates,editor=root.ScenarioEditorV2;
    const balancedRegion=template.balancedRegionId||({'world-balanced':'world','europe-balanced':'europe_med'})[template.id];
    const selection=editor?.mapSetupSelection?.(template.id)||(template.historicalRegionId?{regionId:template.historicalRegionId,eraId:template.historicalEraId}:balancedRegion?{regionId:balancedRegion,eraId:'balanced_modern'}:registry?.selection?.(template.id))||(template.regionId?{regionId:template.regionId,eraId:template.eraId}:null);
    const region=registry?.regions?.().find(item=>item.id===selection?.regionId),era=selection?(editor?.mapSetupEras?.(selection.regionId)||registry?.eras?.(selection.regionId)||[]).find(item=>item.id===selection.eraId):null;
    const scope=selection?`${region?.name||selection.regionId} (${selection.regionId}) / 시대 기본안: ${era?.name||(selection.eraId==='balanced_modern'?'현대 · 균형 지도':template.name)} (${selection.eraId})`:template.name+' (기존 지도 고유 범위·기본안)';
    const sameMap=base?.map?.templateId===template.id,countries=new Map(template.countries.map(country=>[country.id,country]));
    if(sameMap)for(const country of base.map.countries||[])countries.set(country.id,{...countries.get(country.id),...country});
    return [
      '[선택한 기본 지도]',
      '- templateId: ' + template.id + ' / 이름: ' + template.name,
      '- 아래의 지역·국가 id를 그대로 사용해라. 지도 그림이나 SVG path를 생성하지 마라.',
      template.notice ? '- 지도 안내: ' + template.notice : '',
      '- 지도 범위: '+scope+'. 이 지도 밖의 지역 ID를 쓰지 마라. 기본 소유국은 이미 선택한 기본안을 반영하므로 바꿀 지역만 initial에 넣어라.',
      Array.isArray(template.geographicBounds)?'- 실제 지도 경위도 범위 [서쪽 경도,남쪽 위도,동쪽 경도,북쪽 위도]: '+JSON.stringify(template.geographicBounds)+'. 위 지역 분류보다 좁게 자른 지도라면 이 실제 범위를 따른다.':'',
      '- 전체 지도는 '+template.provinces.length.toLocaleString()+'개 지역이다. 아래 지역 ID 참고 목록의 개수에 맞춰 지도를 자르거나 templateId를 바꾸지 마라.',
      base?.map&&!sameMap?'- [현재 시나리오]의 기존 지도는 참고 자료다. 출력 map.templateId는 반드시 '+template.id+'로 바꾸고, 이전 지도 밖의 지역 참조와 국명 좌표는 새 범위에 맞게 제거하거나 변환해라. 유효한 새 지역 ID만 사용해라.':'',
      sameMap?'- [현재 시나리오]에 편집된 국가·소유권·점령·영향권·국명 위치가 있으면 해당 값을 유지하고 요청받은 변경만 적용해라. 기본 지도로 덮어쓰지 마라.':'',
      '국가 목록: ' + JSON.stringify([...countries.values()].filter(c=>c.available!==false||c.id===countryId).map(({ id, name, color }) => ({ id, name, color }))),
      limited ? '- 촘촘한 지도: 전체 ' + template.provinces.length.toLocaleString() + '개 중 실제 ID ' + provinces.length + '개만 아래에 싣는다.' + (countryId ? ' 현재 플레이 국가 ' + countryId + '와 기존 시나리오에서 참조한 지역을 우선한다.' : ' 국가별 대표 지역을 우선한다.') : '',
      '지역 목록: ' + JSON.stringify(provinces.map(({ id, name, owner }) => ({ id, name, owner:sameMap?(base.map.initial?.owners?.[id]||owner):owner }))),
      limited ? '- 아래 목록과 [현재 시나리오]에 없는 지역 ID를 추측하거나 새로 만들지 마라. 더 필요한 지역은 편집기의 지역 검색 또는 지도·초기 영토 탭의 "지역 ID 목록 내려받기"에서 확인한 ID 목록을 사용자에게 받아 사용해라. 지도 전체를 initial.owners에 복사하지 말고 변경할 지역만 지정해라.' : '',
      '- map 형식: {"templateId":"' + template.id + '","playerCountry":"위 국가 id","countries":[],"initial":{"owners":{},"occupation":{},"influence":{},"markers":{}}}. countries는 기본 국가를 덮어쓰거나 추가할 때 id/name/color를 넣는다.',
      '- country.labelPosition은 선택사항이다. 기존 값은 유지하고, 새 좌표는 요청받았을 때만 지도 안의 [가로,세로]로 쓴다. 범위는 [0,0]부터 [' + template.width + ',' + template.height + ']까지이며 null은 국명 숨김, 생략은 자동 배치다. focusBounds(국가로 이동할 때의 확대 범위)와 혼동하지 마라.',
      '- initial.owners의 키는 지역 id, 값은 국가 id다. 지정하지 않은 소유권은 기본 지도를 따른다. occupation(점령)·influence(영향권)는 지역→국가, markers(주석)는 지역→짧은 문장이다.',
      '- 선택지 territory: [{"prov":"지역 id","to":"소유 국가 id","occupation":"점령 국가 id 또는 null","influence":"영향 국가 id 또는 null","marker":"짧은 문장 또는 null"}]. 바꿀 필드만 적어라. null은 소유권 이외 층을 지운다. to에는 null을 쓰지 마라.',
      '- 영토 조건: {"kind":"territory","key":"지역 id","field":"owner","op":"eq","value":"국가 id"}. field는 owner/occupation/influence/marker, op는 eq/ne다. marker는 문장/null, 비소유 층은 국가 id/null도 비교할 수 있다.',
      '- 소유·점령·영향권은 구별해라. 실제 국경과 게임용 구획의 차이는 안내하고, 역사와 다른 영토 변경은 선택 결과로 설명해라.'
    ].filter(Boolean).join('\n');
  }

  function reignInstructions(mode) {
    if (mode !== 'reign') return '[진행 방식]\n- mode:"chronicle": 기존 사건과 선택지의 next를 따라 분기한다.';
    return `[진행 방식: 연차 통치 모드]
- schemaVersion:2, mode:"reign". reign:{parts:[{id,name,color}],turns:[{id,date,title,body,eventIds:[],between:[],settlements:[]}]}를 작성한다.
- parts는 조정·군무·외교 등 결정 분야다. 일반 사건에 part:"분야 id"를 붙인다. 각 turn.eventIds에는 그 연차의 사건 id만 나열한다. 분야마다 현재 조건을 만족하는 첫 사건을 사용한다.
- 플레이어는 현재 열린 모든 분야에서 하나씩 결정한 뒤 연차를 결산한다. 해당 모드의 일반 선택지는 next로 다음 사건을 직접 선택하지 않는다. 연차와 분야를 설계해라.
- 매 연차에 when 없는 일반 사건을 적어도 하나 배치하고, 각 사건에도 조건 없는 선택지를 남겨라. 이전 결정으로 다음 분야와 다음 연차의 사건이 달라지게 하라.
- between은 연차 진입 때(첫 연차 포함), settlements는 결산 때 적용하는 규칙 배열이다. {id,text,when:[],effects:{},setFlags:{},territory:[]} 형식이며 만족한 규칙을 나열한 순서대로 모두 적용한다. 뒤 규칙은 앞 규칙의 변경을 본다.
- 지연 결과는 이전 선택의 setFlags를 다음 연차 between/settlements.when에서 확인하여 표현한다. result에는 선택 직후 보여줄 결과 문장을 적는다.
- 돌발 사건은 같은 events 배열에 두되 turn.eventIds에는 넣지 않고 next:"RETURN"으로 복귀시킨다. 마지막 연차 결산 후 일반 엔딩을 판정한다.
- historical:true는 실제 역사에서 이루어진 선택이라고 확인한 경우에만 표시한다. 편의상 첫 선택지를 모두 실제 역사로 지정하지 마라.`;
  }

  function gameInstructions(mode) {
    if (mode !== 'reign') return GAME;
    return GAME.split('\n').map(line => {
      if (line.startsWith('- 플레이어는 사건')) return '- 플레이어는 한 연차에 열린 분야별 사건을 읽고 각 분야에서 선택지 하나씩을 고른 뒤 결산한다. 수치는 min~max 범위로 잘리고 setFlags로 기록이 바뀐다.';
      if (line.startsWith('- 다음 사건:')) return '- 다음 진행은 reign.turns의 순서다. 일반 사건·선택지의 next로 연차를 건너뛰지 않는다.';
      if (line.startsWith('- 사건에 when')) return '- 일반 사건의 when은 해당 연차·분야에서 표시할 카드의 자격이다. 조건이 안 맞으면 같은 분야에서 다음으로 자격 있는 사건을 찾는다.';
      if (line.startsWith('- 일반 엔딩')) return '- 일반 엔딩(immediate:false)은 마지막 연차 결산 후 조건이 맞는 엔딩 중 priority가 가장 높은 것으로 고른다. 하나도 맞지 않으면 defaultEnding이다.';
      if (line.startsWith('- 즉시 엔딩')) return line + ' 연차 결산 뒤에도 즉시 엔딩을 검사한다.';
      return line;
    }).join('\n');
  }

  function buildExample(options = {}) {
    const selected = settings(options);
    const example = copy(EXAMPLE);
    if (selected.version === 2) { example.schemaVersion = 2; example.mode = selected.mode; }
    example.events.forEach(event => event.choices.forEach(choice => { choice.result = '결정의 효과가 반영되었습니다.'; }));
    if (selected.template) {
      const template = selected.template;
      const province = template.provinces[0];
      const country = template.countries.find(item => item.id === province?.owner) || template.countries[0];
      if (!province || !country) throw new Error('기본 지도에 지역과 국가가 필요합니다.');
      const other = template.countries.find(item => item.id !== country.id&&item.available!==false) || country;
      example.map = { templateId: template.id, playerCountry: country.id, countries: [], initial: { owners: {}, occupation: {}, influence: {}, markers: {} } };
      example.events[0].choices[0].territory = [{ prov: province.id, influence: country.id, marker: '구호품 도착' }];
      example.events[0].choices[1].territory = [{ prov: province.id, to: other.id, occupation: other.id }];
      example.events[1].choices[0].territory = [{ prov: province.id, occupation: null, marker: null }];
    }
    if (selected.mode === 'reign') {
      example.id = 'example_reign_city';
      example.events[0].part = 'council';
      example.events[1].part = 'council';
      example.events.push(
        { id: 'e_patrol', part: 'guard', title: '호송대 편성', body: '구호선의 항로를 순찰할 인력이 필요합니다.', next: 'END', choices: [
          { text: '호송대를 늘린다', effects: { food: -5, trust: 5 }, result: '구호선에 호위가 붙었습니다.' },
          { text: '연안의 자율 순찰을 지원한다', effects: { trust: -3, food: 3 }, result: '도시의 지출을 줄였습니다.' }
        ] },
        { id: 'e_audit', part: 'guard', title: '창고의 장부', body: '겨울 창고의 분배를 점검할 시기입니다.', next: 'END', choices: [
          { text: '장부를 공개하고 구휼한다', effects: { food: -5, trust: 8 }, result: '시민들이 분배 과정을 확인했습니다.' },
          { text: '예비 식량을 쌓는다', effects: { food: 5, trust: -5 }, result: '도시의 비축이 늘었습니다.' }
        ] }
      );
      example.reign = {
        parts: [{ id: 'council', name: '조정', color: '#3f6d4f' }, { id: 'guard', name: '경비', color: '#8a6d3b' }],
        turns: [
          { id: 'turn_autumn', date: '11월', title: '봉쇄의 시작', body: '조정과 경비의 결정을 각각 내립니다.', eventIds: ['e_blockade', 'e_patrol'],
            between: [{ id: 'entry_rations', text: '도시의 기본 배급에 식량을 썼습니다.', when: [], effects: { food: -3 } }],
            settlements: [{ id: 'autumn_accounts', text: '가을의 분배 장부를 정리했습니다.', when: [], effects: { trust: 2 } }] },
          { id: 'turn_winter', date: '1월', title: '겨울의 결산', body: '이전 선택의 결과가 돌아옵니다.', eventIds: ['e_winter', 'e_audit'],
            between: [{ id: 'smuggler_debt', text: '밀수업자들이 지난 약속의 대가를 청했습니다.', when: [{ kind: 'flag', key: 'smugglers', op: 'eq', value: true }], effects: { trust: -8, food: 5 } }],
            settlements: [{ id: 'winter_accounts', text: '마지막 겨울을 결산합니다.', when: [], effects: { food: -3 } }] }
        ]
      };
    }
    return example;
  }

  function buildPrompt(options = {}) {
    const idea = String(options.idea || '').trim();
    const size = SIZES[options.size] || SIZES.short;
    const endings = Number(options.endings) || 5;
    const base = options.baseScenario;
    const selected = settings(options);
    const featureRules = '[선택한 형식]\n- schemaVersion:' + selected.version + ', mode:"' + selected.mode + '". 이 선택을 기준으로 전체 원고를 작성해라.' +
      (selected.version === 2 ? '\n- 선택지 result에는 결정 직후의 결과 문장을 적을 수 있다. historical:true는 실제 역사에서 이루어진 선택으로 확인한 경우에만 표시한다. 첫 선택지를 일괄적으로 실제 역사라고 표시하지 마라.' : '') +
      '\n\n' + reignInstructions(selected.mode) + '\n\n' + mapInstructions(selected.template, selected.countryId, base);
    const head = '너는 선택형 텍스트 게임 「역사의 갈림길」의 시나리오 작가다.';
    if (base) {
      return [
        head,
        '아래 [현재 시나리오] JSON을 [요청]에 맞게 고치거나 늘려라. 바뀌지 않은 부분까지 모두 포함한 전체 JSON 하나로만 답해라.',
        '',
        '[요청]',
        idea || '이야기를 더 풍성하게 다듬고, 사건과 엔딩을 조금 더 늘려 줘.',
        '',
        gameInstructions(selected.mode), '', RULES, '', featureRules, '', CRAFT, '',
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
      gameInstructions(selected.mode), '', RULES, '', featureRules, '', CRAFT, '',
      '[형식 예시 — 구조만 참고하고 내용·id·수치는 새로 만들어라]',
      JSON.stringify(buildExample(options))
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
    lines.push('', '원래 원고가 schemaVersion:2이면 지도와 연차 통치 설정을 유지해라. 모드를 임의로 V1로 낮추거나 지역·국가 id를 바꾸지 마라.', '', RULES);
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
      if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i += 1; continue; }
      if (c === '/' && text[i + 1] === '*') { const close = text.indexOf('*/', i + 2); if (close < 0) return -1; i = close + 1; continue; }
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
      if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); out += ' '; i = end < 0 ? text.length : end + 1; continue; }
      out += c;
    }
    let cleaned = ''; inString = false; escaped = false;
    for (let i = 0; i < out.length; i += 1) {
      const c = out[i];
      if (inString) {
        cleaned += c;
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      if (c === ',') {
        let next = i + 1; while (next < out.length && /\s/.test(out[next])) next += 1;
        if (out[next] === '}' || out[next] === ']') continue;
      }
      cleaned += c;
    }
    return cleaned;
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
    let fallback = null, parseError = null, truncated = false;
    const candidates = /\{(?=\s*(?:"|\}|\/))/g;
    let candidate;
    while ((candidate = candidates.exec(text))) {
      const start = candidate.index;
      const likelyScenario = /"(?:schemaVersion|events|scenario|stats|endings)"\s*:/.test(text.slice(start, start + 300));
      const end = balancedEnd(text, start);
      if (end < 0) { if (likelyScenario) truncated = true; continue; }
      const body = text.slice(start, end + 1);
      let value, cleaned = false;
      try { value = JSON.parse(body); }
      catch (first) {
        try { value = JSON.parse(looseClean(body)); cleaned = true; }
        catch {
          if (!parseError || likelyScenario) {
            const match = /position (\d+)/.exec(first.message);
            const detail = match ? locate(body, Number(match[1])) : '정확한 위치를 찾지 못했습니다';
            parseError = new PasteError('parse', `JSON 문법 오류가 있습니다. ${detail}`, detail);
          }
          continue;
        }
      }
      if (value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === undefined && !Array.isArray(value.events)) {
        const inner = Object.values(value).filter(item => item && typeof item === 'object' && !Array.isArray(item) && Array.isArray(item.events));
        if (inner.length === 1) value = inner[0];
      }
      const result = { value, cleaned };
      if (value && typeof value === 'object' && Array.isArray(value.events)) return result;
      if (!fallback || (value && value.schemaVersion !== undefined && fallback.value?.schemaVersion === undefined)) fallback = result;
      candidates.lastIndex = end + 1;
    }
    if (truncated) throw new PasteError('truncated', 'AI 답변이 중간에 끊긴 것 같습니다. JSON의 끝(마지막 } )이 없습니다.');
    if (parseError) throw parseError;
    if (fallback) return fallback;
    throw new PasteError('empty', '붙여 넣은 내용에서 JSON({ … })을 찾지 못했습니다. AI 답변 전체를 복사했는지 확인해 주세요.');
  }

  // Fill fields AI answers commonly omit. Only unambiguous defaults; returns notes.
  function normalize(scenario) {
    const fixes = [];
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return fixes;
    if (scenario.schemaVersion === undefined) { scenario.schemaVersion = scenario.map || scenario.reign || scenario.mode === 'reign' ? 2 : 1; fixes.push('schemaVersion'); }
    else if (scenario.schemaVersion === '1' || scenario.schemaVersion === '2') { scenario.schemaVersion = Number(scenario.schemaVersion); fixes.push('schemaVersion'); }
    if (scenario.schemaVersion === 2 && scenario.mode === undefined) { scenario.mode = scenario.reign ? 'reign' : 'chronicle'; fixes.push('mode'); }
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

  root.ScenarioAI = { EXAMPLE, SIZES, buildExample, buildPrompt, buildRepairPrompt, extract, normalize, PasteError };
})(typeof window !== 'undefined' ? window : globalThis);
