(function () {
  'use strict';
  const E = GameEngine;
  const byId = id => document.getElementById(id);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const hash = value => { let h=2166136261;for(const c of JSON.stringify(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36); };
  const baseKey = 'history-crossroads:web:v1';
  const MAX_SCENARIO_BYTES = 5 * 1024 * 1024;
  let storageOK = true, timer, scenario, state, awaitingName=false, nameReturnState=null;
  let launcherMode='file', ai={idea:'',size:'short',endings:'5',mode:'chronicle',mapTemplateId:'',base:false,paste:'',prompt:'',promptNote:'',showPrompt:false,problem:null,repair:'',repairNote:'',showRepair:false};
  let compareMap=false,referenceCache=null;
  let launcherBusy=false, launcherError='', launcherMessage='', failedScenarioUrl=null, loadSequence=0, pendingUrlController=null;
  let deferredStoredScenario=null, startupRetry=false, startupRestore=true, aiMapLoading=false, aiMapSequence=0, aiMapError='';
  const provinceNameIndexes=new WeakMap();
  const requestedHome=new URL(location.href).searchParams.get('home')==='1';
  let homeMode=true;
  const storage = {
    get(key){try{return JSON.parse(localStorage.getItem(baseKey+':'+key));}catch{return null;}},
    set(key,value){try{localStorage.setItem(baseKey+':'+key,JSON.stringify(value));return true;}catch{storageOK=false;return false;}}
  };
  try{localStorage.setItem(baseKey+':check','1');localStorage.removeItem(baseKey+':check');}catch{storageOK=false;}
  const custom = storage.get('scenario');
  // A saved map must be loaded before full engine validation. Until then, keep
  // the original manuscript and autosave untouched rather than rejecting it.
  scenario=E.clone(DEFAULT_SCENARIO);state=null;
  const signature = () => hash(scenario);
  function sourceContext(){
    const page=new URL(location.href),path=page.searchParams.get('scenario');
    if(!path)return 'local';
    try{const source=new URL(path,page);source.hash='';return 'url:'+source.href;}catch{return 'invalid:'+path;}
  }
  function saveSourceContext(saved=true){
    if(saved)storage.set('sourceContext',{context:sourceContext(),signature:signature()});
  }
  const discovered = () => storage.get('collection:'+signature()) || [];
  function storedState(){
    const template=globalThis.MapTemplates?.get(scenario.map?.templateId);
    if(!state?.map||!template||template.provinces.length<=1000)return E.clone(state);
    // Template owners are immutable assets; save only differences, plus verified replay history.
    const saved=E.clone({...state,map:null}),owners={};
    for(const p of template.provinces)if(state.map.owners[p.id] !== (scenario.map.initial?.owners?.[p.id]||p.owner))owners[p.id]=state.map.owners[p.id];
    saved.map={...E.clone({...state.map,owners:{}}),owners};saved.mapEncoding='template-delta-v1';return saved;
  }
  function restoreSavedState(raw){
    if(raw?.mapEncoding!=='template-delta-v1')return E.restoreState(scenario,raw);
    const template=globalThis.MapTemplates?.get(scenario.map?.templateId);if(!template||!raw.map?.owners)throw Error('저장한 지도의 템플릿을 찾을 수 없습니다.');
    const owners={...Object.fromEntries(template.provinces.map(p=>[p.id,p.owner])),...(scenario.map.initial?.owners||{}),...raw.map.owners};
    const expanded={...raw,map:{...raw.map,owners}};delete expanded.mapEncoding;return E.restoreState(scenario,expanded);
  }
  const envelope = () => ({signature:signature(),state:storedState(),at:new Date().toISOString()});
  const display = value => E.formatText(value,state);
  const t = value => escape(display(value));
  const playerSettings = () => ({askName:true,label:'당신의 이름',defaultName:'집정관',placeholder:'이름을 입력하세요',...(scenario.player||{})});
  const reignMode = () => scenario.schemaVersion===2&&scenario.mode==='reign';
  const isEmptyScenario = () => scenario.draft===true&&!scenario.events.length&&!scenario.stats.length&&!scenario.endings.length&&!scenario.flags.length&&!(scenario.randomEvents||[]).length;
  function notify(message){byId('toast').textContent=message;byId('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>{byId('toast').hidden=true;},3500);}
  function status(message,error=false){const node=byId('status-message');node.textContent=message;node.classList.toggle('error',error);node.hidden=!message;}
  function saveAuto(){storage.set('autosave',envelope());}
  function rememberEnding(){
    if(!state||awaitingName||!state.endingId)return;
    const list=discovered();if(!list.includes(state.endingId)){list.push(state.endingId);storage.set('collection:'+signature(),list);}
  }
  function effectText(effects){return Object.entries(effects||{}).filter(([,v])=>v!==0).map(([id,v])=>`${scenario.stats.find(s=>s.id===id)?.name||id} ${v>0?'+':''}${v}`).join(' · ');}
  function immediateRisks(candidate){
    const risks=[];
    for(const ending of scenario.endings.filter(e=>e.immediate&&e.id!==scenario.defaultEnding&&E.testConditions(e.when,candidate)).sort((a,b)=>b.priority-a.priority)){
      const chance=ending.chance===undefined?100:ending.chance;
      if(chance>0)risks.push({ending,chance});
      if(chance===100)break;
    }
    return risks;
  }
  function projectedRiskMarkup(choice){
    const projected={...state,turn:state.turn+1,stats:{...state.stats},flags:{...state.flags,...(choice.setFlags||{})}};
    if(state.map&&(choice.territory||[]).length){
      projected.map={...state.map};const copied=new Set();
      const setLayer=(layer,province,value)=>{if(!copied.has(layer)){projected.map[layer]={...state.map[layer]};copied.add(layer);}projected.map[layer][province]=value;};
      for(const change of choice.territory){
        if(change.to!==undefined)setLayer('owners',change.prov,change.to);
        for(const [field,layer] of [['occupation','occupation'],['influence','influence'],['marker','markers']])if(Object.hasOwn(change,field))setLayer(layer,change.prov,change[field]);
      }
    }
    for(const [id,delta] of Object.entries(choice.effects||{})){
      const stat=scenario.stats.find(s=>s.id===id);
      if(stat)projected.stats[id]=Math.max(stat.min,Math.min(stat.max,projected.stats[id]+delta));
    }
    const risks=immediateRisks(projected);
    const destination=choice.next===undefined?E.getEvent(scenario,state)?.next:choice.next;
    const encounters=risks.some(r=>r.chance===100)||(destination==='RETURN'&&(!reignMode()||state.activeRandomEventId))?[]:encounterRisks(projected);
    return (risks.length?`<span class="choice-risk">⚠ 선택 후 ${risks.map(r=>`${t(r.ending.title)} ${r.chance}%`).join(' · ')}</span>`:'')+
      (encounters.length?`<span class="choice-encounter">◇ 돌발 사건 ${encounters.map(r=>`${t(r.title)} ${r.chance}%`).join(' · ')}${risks.length?' · 즉시 엔딩이 발생하지 않으면 추첨':''}</span>`:'');
  }
  function encounterRisks(candidate){
    const result=[];
    for(const rule of E.getRandomEventRisks(scenario,candidate)){
      if(rule.chance>0)result.push(rule);
      if(rule.chance===100)break;
    }
    return result;
  }
  function riskResultText(record){
    return [
      ...(record.riskRolls||[]).filter(r=>r.chance>0).map(r=>`${scenario.endings.find(e=>e.id===r.endingId)?.title||r.endingId} ${r.chance}%: ${r.triggered?'발생':'통과'}`),
      ...(record.eventRolls||[]).filter(r=>r.chance>0).map(r=>`${(scenario.randomEvents||[]).find(e=>e.id===r.randomEventId)?.title||r.randomEventId} ${r.chance}%: ${r.triggered?'발생':'미발생'}`)
    ].join(' · ');
  }
  function effectMarkup(choice){
    const nums=Object.entries(choice.effects||{}).filter(([,v])=>v!==0).map(([id,v])=>`<span class="effect ${v>0?'up':'down'}">${t(scenario.stats.find(s=>s.id===id)?.name||id)} ${v>0?'＋':'−'}${Math.abs(v)}</span>`).join('');
    const flags=Object.entries(choice.setFlags||{}).map(([id,v])=>`<span class="effect flag">${v?'◇':'↩'} ${t(scenario.flags.find(f=>f.id===id)?.name||id)}${v?'':' 해제'}</span>`).join('');
    const ids=[...new Set((choice.territory||[]).map(change=>change.prov))];
    const template=globalThis.MapTemplates?.get(scenario.map?.templateId);
    let names=template&&provinceNameIndexes.get(template);
    if(template&&!names){names=new Map(template.provinces.map(p=>[p.id,p.name]));provinceNameIndexes.set(template,names);}
    const first=ids.length?(names?.get(ids[0])||ids[0]):'';
    const label=ids.length>1?`${first} 외 ${ids.length-1}개 지역에 변화`:`${first}에 변화`;
    const details=ids.slice(0,6).map(id=>names?.get(id)||id).join(' · ')+(ids.length>6?` · 외 ${ids.length-6}개 지역`:'');
    const mapEffects=ids.length?`<span class="effect flag map-effect-summary" title="${escape(details)}">⌖ ${escape(label)}</span>`:'';
    return nums+flags+mapEffects?`<span class="choice-effects">${nums}${flags}${mapEffects}</span>`:'';
  }
  function renderMap(){
    const panel=byId('player-map-panel');if(!panel)return;
    panel.hidden=!scenario.map;byId('map-reference-tools').hidden=!scenario.map;if(!scenario.map){MapView.dispose?.(byId('player-map'));return;}
    if(!referenceCache||referenceCache.signature!==signature())referenceCache={signature:signature(),reference:E.getHistoricalReference?.(scenario)};
    const reference=referenceCache.reference;
    byId('map-reference-tools').innerHTML=reference?.complete?`<button class="btn secondary" data-map-compare aria-pressed="${compareMap}" title="작성자가 표시한 기준 선택의 최종 지도와 비교합니다.">${compareMap?'기준 역사 비교 끄기':'기준 역사와 비교'}</button>`:'';
    MapView.render(byId('player-map'),scenario,state,{compareState:compareMap&&reference?.complete?reference.state:null});
  }
  function decisionResultMarkup(){
    if(!state||awaitingName||!state.history.length)return '';
    const record=state.history[state.history.length-1],event=scenario.events.find(e=>e.id===record.eventId),choice=event?.choices[record.choiceIndex];
    if(!choice?.result)return '';
    const historical=event.choices.find(c=>c.historical);
    return `<section class="decision-result"><strong>직전 결정의 결과</strong><p>${t(choice.result)}</p>${historical?`<p class="small">기준 선택: ${t(historical.text)}${choice.historical?' · 같은 길을 택했습니다.':' · 다른 길을 택했습니다.'}</p>`:''}</section>`;
  }
  function timelineChoice(record){
    const event=scenario.events.find(item=>item.id===record.eventId),choice=event?.choices[record.choiceIndex];
    const part=scenario.reign?.parts?.find(item=>item.id===event?.part);
    const color=/^#[0-9a-f]{6}$/i.test(part?.color||'')?part.color:'#65785c';
    return `<p>${part?`<span class="timeline-part" style="--part-color:${color}">${t(part.name)}</span>`:''}${record.historical||choice?.historical?'<span class="historical-mark" title="작성자가 표시한 기준 역사와 같은 선택">기준</span>':''}${t(record.choiceText)}</p>`;
  }
  function renderTimeline(){
    const panel=byId('timeline-panel');if(!panel)return;
    byId('timeline-count').textContent=state&&!awaitingName?String(state.history.length):'0';
    if(!state||awaitingName){panel.innerHTML='<p class="empty-memory">이야기를 시작하면 선택한 길이 이곳에 쌓입니다.</p>';byId('timeline-note').textContent='';return;}
    if(reignMode()){
      const groups=new Map();let index=0;
      for(const record of state.history){
        const turnIndex=record.action==='settle'&&Number.isInteger(record.turnIndex)?record.turnIndex:index;
        if(!groups.has(turnIndex))groups.set(turnIndex,[]);groups.get(turnIndex).push(record);
        if(record.action==='settle')index=turnIndex+1;
      }
      const current=state.reign.turnIndex,turns=scenario.reign.turns,start=Math.max(0,current-16),end=Math.min(turns.length,Math.max(32,current+17));
      panel.innerHTML=turns.slice(start,end).map((turn,offset)=>{
        const turnIndex=start+offset,records=groups.get(turnIndex)||[],settled=records.some(record=>record.action==='settle');
        const cls=settled?'played':turnIndex===current?'current':'upcoming';
        const choices=records.filter(record=>record.action!=='settle'),settlement=records.find(record=>record.action==='settle');
        return `<article class="timeline-entry ${cls}" ${cls==='current'?'aria-current="step"':''}><div class="timeline-date">${t(turn.date||String(turnIndex+1)+'번째 해')}</div><div class="timeline-copy"><h3>${t(turn.title)}</h3>${choices.slice(-8).map(timelineChoice).join('')}${choices.length>8?`<p>이 해에 ${choices.length}번의 결정</p>`:''}${settlement?.result?`<p>${t(settlement.result)}</p>`:''}${!choices.length?`<p>${turnIndex===current?(state.endingId?'이 해에 통치 종료':'지금 당신의 결정을 기다립니다.'):turnIndex>current?'예정':'기록 없음'}</p>`:''}${settled&&!settlement?.result?'<p>정산 완료</p>':''}</div></article>`;
      }).join('');
      byId('timeline-note').textContent=(start||end<turns.length?'현재 해 주변의 기록을 표시합니다. 전체 선택 기록에서 모든 결정을 볼 수 있습니다. ':'')+'앞으로의 사건과 선택지는 지금까지의 결정에 따라 달라질 수 있습니다.';
    }else{
      const records=state.history.slice(-8);
      const current=!state.endingId?E.getEvent(scenario,state):null;
      panel.innerHTML=records.map(record=>{const event=scenario.events.find(item=>item.id===record.eventId);return `<article class="timeline-entry played"><div class="timeline-date">${t(event?.date||'#'+record.turn)}</div><div class="timeline-copy"><h3>${t(record.eventTitle)}</h3>${timelineChoice(record)}${record.result?`<p>${t(record.result)}</p>`:''}</div></article>`;}).join('')+(current?`<article class="timeline-entry current" aria-current="step"><div class="timeline-date">${t(current.date||'현재')}</div><div class="timeline-copy"><h3>${t(current.title)}</h3><p>${state.activeRandomEventId?'돌발 사건 대응 중':'지금 당신의 결정을 기다립니다.'}</p></div></article>`:'');
      if(!panel.innerHTML)panel.innerHTML='<p class="empty-memory">아직 선택한 사건이 없습니다.</p>';
      byId('timeline-note').textContent=state.history.length>8?'최근 8번의 결정을 표시합니다. 전체 선택 기록에서 앞선 결정도 볼 수 있습니다.':'기준 표시는 시나리오 작성자가 지정한 역사 선택입니다.';
    }
  }
  function renderPlayGuide(){
    const mode=reignMode();
    byId('play-guide-title').textContent=mode?'치세 모드는 이렇게 움직입니다':'연대기 모드는 이렇게 움직입니다';
    byId('play-guide-content').innerHTML=`<ul>${mode?'<li><strong>한 해에 여러 결정:</strong> 각 분야의 카드에서 하나씩 고릅니다. 고를 때마다 수치와 지도가 바뀝니다.</li><li><strong>정산:</strong> 현재 선택 가능한 모든 분야를 결정하면 정산할 수 있습니다. 결정의 조합으로 추가 결과가 붙고 다음 해가 열립니다.</li><li><strong>달라지는 선택지:</strong> 앞선 결정과 현재 수치에 따라 다음 해에 나타나는 카드와 선택지가 달라집니다.</li>':'<li><strong>장면마다 한 번의 결정:</strong> 사건을 읽고 선택지를 고르면 수치와 기록이 바뀌고 다음 장면으로 이어집니다.</li><li><strong>이어지는 갈림길:</strong> 선택, 수치, 앞선 결정에 따라 다른 사건이 열리고 여러 결말로 이어집니다.</li>'}<li><strong>돌발 사건과 위기:</strong> 작성자가 설정한 조건과 확률에 따라 새로운 사건이나 즉시 결말이 발생할 수 있습니다.</li>${scenario.map?'<li><strong>선택이 남긴 지도:</strong> 지역을 눌러 주인과 상태를 확인하세요. 마우스 휠로 확대·축소하고 지도를 끌어 이동할 수 있습니다. 기준 역사 비교는 작성자가 지정한 선택의 최종 결과를 보여 줍니다.</li>':''}</ul>`;
  }
  function render(){
    document.body.classList.toggle('is-home',homeMode);
    if(homeMode){renderHome();return;}
    const empty=isEmptyScenario();
    document.title=empty?'역사의 갈림길 · 시나리오 플레이어':display(scenario.title)+' · 역사의 갈림길';
    byId('scenario-title').textContent=empty?'당신의 이야기를 여세요':display(scenario.title);
    byId('scenario-subtitle').textContent=empty?'시나리오 파일을 불러오거나 빈 공간에서 새 이야기를 만드세요.':display(scenario.subtitle||'당신의 결정으로 쓰는 또 하나의 역사');
    byId('scenario-description').textContent=empty?'프로그램에는 시나리오가 포함되어 있지 않습니다. JSON 파일은 이 브라우저에서 읽습니다.':display(scenario.description||'');
    document.body.classList.toggle('empty-workspace',empty);
    document.body.classList.toggle('has-player-map',Boolean(scenario.map));
    byId('scenario-mode-label').textContent=empty?'YOUR STORY, YOUR CHOICES':reignMode()?'치세 · 한 해의 여러 결정':'연대기 · 장면마다 달라지는 역사';
    renderPlayGuide();renderTimeline();
    renderMap();
    for(const id of ['save-button','restart-button','journal-button','collection-button'])byId(id).disabled=!state||awaitingName;
    if(!state){renderDraft();return;}
    byId('turn-label').textContent=awaitingName?'통치자의 이름을 정하고 이야기를 시작하세요.':`${state.playerName} · ${reignMode()?'치세 '+(state.reign.turnIndex+1)+'번째 해 · ':''}${state.turn}번의 기록`;
    byId('stats-panel').innerHTML=scenario.stats.map(s=>{
      const value=state.stats[s.id],percent=100*(value-s.min)/(s.max-s.min);
      const color=/^#[0-9a-f]{6}$/i.test(s.color||'')?s.color:'#688764';
      const last=state.history[state.history.length-1],delta=awaitingName?0:(last?.effects?.[s.id]||0)+(last?.results||[]).reduce((sum,result)=>sum+(result.effects?.[s.id]||0),0);
      return `<div class="stat" title="${t(s.description||s.name)}"><div class="stat-top"><span class="stat-name">${t(s.name)}</span><span class="stat-number">${value}<small>/ ${s.max}</small>${delta?`<small class="stat-delta ${delta<0?'down':''}">${delta>0?'+':''}${delta}</small>`:''}</span></div><div class="stat-track" role="progressbar" aria-label="${t(s.name)}" aria-valuemin="${s.min}" aria-valuemax="${s.max}" aria-valuenow="${value}"><div class="stat-fill" style="width:${percent}%;background:${color}"></div></div><div class="stat-help">${t(s.description||'')}</div></div>`;
    }).join('');
    const active=state.endingId?[]:immediateRisks(state);
    const encounters=state.endingId||active.some(r=>r.chance===100)?[]:encounterRisks({...state,turn:state.turn+1});
    byId('risk-summary').hidden=!active.length&&!encounters.length&&!state.activeRandomEventId;
    byId('risk-summary').innerHTML=(active.length?`<strong>현재 위기 조건 충족</strong>${active.map(r=>`<span>${t(r.ending.title)} · 선택 후 ${r.chance}%</span>`).join('')}`:'')+
      (encounters.length?`<strong class="encounter-label">현재 돌발 사건 조건 충족</strong>${encounters.map(r=>`<span>${t(r.title)} · 선택 후 ${r.chance}%</span>`).join('')}`:'')+
      (state.activeRandomEventId?'<strong class="encounter-label">돌발 사건 대응 중</strong><small>대응 선택에서는 돌발 사건을 추가 추첨하지 않습니다. 즉시 엔딩 조건은 계속 적용됩니다.</small>':'<small>선택의 수치 변화를 반영한 뒤 조건을 다시 판정합니다.</small>');
    const flags=scenario.flags.filter(f=>state.flags[f.id]);
    byId('flags-count').textContent=flags.length;
    byId('flags-panel').innerHTML=flags.length?`<div class="flag-badges">${flags.map(f=>`<span class="flag-badge">◇ ${t(f.name)}</span>`).join('')}</div>`:'<p class="empty-memory">아직 중요한 결정이 없습니다.<br>당신의 선택이 이곳에 쌓입니다.</p>';
    byId('ending-count').textContent=`${discovered().filter(id=>scenario.endings.some(e=>e.id===id)).length} / ${scenario.endings.length} →`;
    const manual=storage.get('save');
    byId('load-button').disabled=!manual||manual.signature!==signature();
    byId('save-status').textContent=storageOK?'매 선택마다 이 브라우저에 자동 저장됩니다.':'브라우저 저장을 사용할 수 없습니다.';
    byId('story-panel').classList.toggle('game-over',Boolean(state.endingId&&scenario.endings.find(e=>e.id===state.endingId)?.kind==='bad'));
    if(awaitingName)renderNameSetup();else if(state.endingId)renderEnding();else if(reignMode()&&!state.activeRandomEventId)renderReign();else renderEvent();
  }
  function renderHome(){
    document.title='역사의 갈림길 · 초기 화면';
    document.body.classList.add('empty-workspace');
    document.body.classList.remove('has-player-map');
    byId('scenario-title').textContent='당신의 이야기를 여세요';
    byId('scenario-subtitle').textContent='시나리오를 불러오거나 새로운 이야기를 만드세요.';
    byId('scenario-mode-label').textContent='YOUR STORY, YOUR CHOICES';
    byId('scenario-description').textContent='';
    MapView.dispose?.(byId('player-map'));
    byId('player-map-panel').hidden=true;byId('map-reference-tools').hidden=true;
    byId('story-panel').classList.remove('game-over');
    const current=Boolean(deferredStoredScenario||scenario.map||!isEmptyScenario());
    const savedScenario=deferredStoredScenario||scenario,isDraft=savedScenario.draft===true;
    byId('story-panel').innerHTML=(current?`<section class="home-resume" style="display:block" aria-label="저장된 시나리오 시작 방법"><div style="min-width:0;overflow-wrap:anywhere"><div class="small-label">이 브라우저에 저장된 시나리오</div><h2 style="font-size:22px;margin:10px 0">${escape(savedScenario.title||'저장한 시나리오')}</h2><p>${isDraft?'작성하던 초안을 다시 열 수 있습니다.':'이전 진행을 이어가거나 같은 시나리오를 처음부터 시작하세요.'}</p></div><div class="toolbar" style="display:flex;flex-wrap:wrap;gap:10px;margin:18px 0 10px"><button type="button" class="btn primary" id="resume-scenario-link" data-launch-action="resume-scenario">${isDraft?'작성하던 시나리오로 돌아가기':'이어서 하기'}</button>${isDraft?'':'<button type="button" class="btn secondary" id="restart-scenario-button" data-launch-action="restart-scenario">처음부터 시작하기</button>'}<button type="button" class="btn secondary" id="delete-scenario-record-button" data-launch-action="delete-scenario-record" style="color:#a5463a;border-color:#d8b4aa">기록 삭제하기</button></div><p>선택한 뒤에 필요한 지도를 불러옵니다. 다른 이야기는 아래에서 열 수 있습니다.</p></section>`:'')+launcherMarkup(false);
    updateLauncherFeedback();
  }
  function leaveHome(){
    if(!homeMode)return;
    homeMode=false;
    try{const url=new URL(location.href);url.searchParams.delete('home');globalThis.history?.replaceState(null,'',url.href);}catch{}
  }
  function renderNameSetup(){
    const settings=playerSettings(),remembered=storage.get('playerName');
    const suggested=nameReturnState?.playerName||(typeof remembered==='string'?remembered:'');
    byId('story-panel').classList.remove('game-over');
    byId('risk-summary').hidden=true;
    byId('story-panel').innerHTML=`<section class="name-setup"><div class="small-label">A NEW CHAPTER BEGINS</div><h2>누구의 역사를 쓰시겠습니까?</h2><p>이름을 정하면 당신의 선택으로 이야기가 시작됩니다.</p><form id="player-name-form"><label class="field name-field"><span>${escape(settings.label)}</span><input id="player-name-input" name="playerName" type="text" maxlength="48" autocomplete="off" placeholder="${escape(settings.placeholder)}" value="${escape(suggested)}" aria-describedby="player-name-help name-error" required></label><p id="player-name-help" class="small muted">최대 24자. 이야기 속 이름과 진행 저장에 함께 사용됩니다.</p><p id="name-error" class="name-error" role="alert" hidden></p><div class="toolbar"><button class="btn primary" type="submit">이 이름으로 시작</button><button class="btn secondary" type="button" data-action="default-name">${escape(settings.defaultName)} 이름으로 시작</button>${nameReturnState?'<button class="btn secondary" type="button" data-action="cancel-name">진행으로 돌아가기</button>':''}</div></form></section>`;
  }
  function startWithName(value){
    if(!awaitingName)return;
    try{
      const playerName=E.normalizePlayerName(value);
      const started=E.createState(scenario,{seed:state.seed,playerName});
      state=started;awaitingName=false;nameReturnState=null;
      storage.set('playerName',playerName);rememberEnding();saveAuto();render();status(`${playerName}의 이야기를 시작합니다.`);
      byId('story-panel').focus({preventScroll:true});
    }catch(error){const box=byId('name-error');box.textContent=error.message;box.hidden=false;byId('player-name-input').focus();}
  }
  function renderDraft(){
    byId('turn-label').textContent='시나리오를 작성하는 중입니다.';
    byId('stats-panel').innerHTML=scenario.stats.length?'<p class="empty-memory">초안에 수치 '+scenario.stats.length+'개가 있습니다.</p>':'<p class="empty-memory">수치부터 자유롭게 만들어 보세요.</p>';
    byId('risk-summary').hidden=true;byId('risk-summary').innerHTML='';
    byId('flags-count').textContent='0';byId('flags-panel').innerHTML='<p class="empty-memory">작성한 선택 기록은 플레이할 때 표시됩니다.</p>';
    byId('ending-count').textContent='0 / '+scenario.endings.length+' →';byId('load-button').disabled=true;
    byId('save-status').textContent=storageOK?'초안은 이 브라우저에 저장됩니다. 원고는 JSON으로 따로 보관하세요.':'JSON으로 초안을 내려받아 보관하세요.';
    byId('story-panel').classList.remove('game-over');
    byId('story-panel').innerHTML=isEmptyScenario()?launcherMarkup(false):`<div class="empty-authoring"><div class="small-label">YOUR EMPTY CANVAS</div><h2>이야기를 작성하고 있습니다</h2><p>사건 ${scenario.events.length}개 · 수치 ${scenario.stats.length}개 · 엔딩 ${scenario.endings.length}개</p><p>흐름도에서 첫 사건과 선택지를 만들고, 수치와 기본 엔딩을 추가하세요. 준비가 되면 편집기에서 ‘적용하고 새 게임’을 누르면 됩니다.</p><div class="toolbar"><button class="btn primary" data-action="edit-flow">흐름도에서 작성하기</button><button class="btn secondary" data-action="edit-scenario">기본 설정·수치·엔딩 편집</button><button class="btn secondary" data-launch-action="choose-file">다른 JSON 불러오기</button></div></div>`;
    updateLauncherFeedback();
  }
  function renderEvent(){
    const event=E.getEvent(scenario,state),choices=E.getChoices(scenario,state);
    if(!event)throw Error('현재 사건을 찾을 수 없습니다.');
    const speaker=display(event.speaker||'국정 회의');
    const returnName=state.pendingNext==='REIGN'?'현재 해의 분야별 카드':state.pendingNext==='END'?'기존 엔딩 판정':scenario.events.find(e=>e.id===state.pendingNext)?.title;
    const encounterNotice=state.activeRandomEventId?`<div class="encounter-notice"><strong>돌발 사건</strong><span>복귀 경로를 선택하면 ${t(returnName||'예정된 다음 사건')}${state.pendingNext==='END'?'으로 진행합니다.':'(으)로 돌아갑니다.'}</span></div>`:'';
    byId('story-panel').innerHTML=`${encounterNotice}<div class="event-meta"><span class="chapter">${t(event.chapter||'새로운 역사')}<span class="event-number">선택 ${String(state.turn+1).padStart(2,'0')}</span></span><span>${t(event.date||'')}</span></div><div class="speaker-line"><div class="portrait" aria-hidden="true">${escape(speaker.replace(/\s/g,'').slice(0,1))}</div><div class="speaker-name">${escape(speaker)}<span class="speaker-caption">A VOICE IN HISTORY</span></div></div><h2 class="event-title">${t(event.title)}</h2><div class="event-body">${t(event.body)}</div><div class="choice-section-label">당신의 결정은</div><div class="choices">${choices.map(({choice,index,enabled,reason})=>`<button class="choice ${enabled?'':'locked'}" data-choice="${index}" ${enabled?'':'disabled'}><span class="choice-key">${index+1}</span><span class="choice-copy"><span class="choice-title">${t(choice.text)}</span>${choice.description?`<span class="choice-description">${t(choice.description)}</span>`:''}${effectMarkup(choice)}${enabled?projectedRiskMarkup(choice):''}${enabled?'':`<span class="choice-locked">🔒 ${t(reason||'조건을 충족하지 못했습니다.')}</span>`}</span><span class="choice-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
    byId('story-panel').insertAdjacentHTML('afterbegin',`<span class="mode-badge">${reignMode()?'치세':'연대기'} · ${state.activeRandomEventId?'돌발 사건 대응':'장면과 선택'}</span>${decisionResultMarkup()}`);
  }
  function renderReign(){
    const status=E.getReignStatus(scenario,state),turn=status.turn;
    if(!turn)throw Error('현재 치세의 해를 찾을 수 없습니다.');
    const resultList=(list,title,cls)=>list?.length?`<section class="${cls}"><strong>${title}</strong>${list.map(r=>`<p>${t(typeof r==='string'?r:r.text)}</p>`).join('')}</section>`:'';
    const settlements=(status.results||[]).filter(result=>typeof result==='string'||result.type!=='choice');
    const responses=(status.results||[]).filter(result=>result.type==='choice'&&!result.partId);
    byId('story-panel').innerHTML=`<span class="mode-badge">치세 · 분야별 결정과 정산</span><div class="event-meta"><span class="chapter">${t(turn.date||'제 '+(status.turnIndex+1)+'년')}</span><span>${Object.keys(status.decisions||{}).length}개 분야 결정</span></div><h2 class="event-title">${t(turn.title)}</h2><div class="event-body">${t(turn.body||'각 분야에서 하나씩 선택한 뒤 정산하세요.')}</div>${resultList(status.between,'그 사이에 일어난 일','reign-between')}${resultList(settlements,'정산의 결과','reign-results')}${resultList(responses,'돌발 사건 대응의 결과','reign-responses')}${status.cards.map(({part,event,choices})=>{
      const pick=status.decisions?.[part.id],selected=pick&&scenario.events.find(e=>e.id===pick.eventId)?.choices[pick.choiceIndex];
      return `<article class="reign-card ${pick?'selected':''}" data-reign-card="${escape(part.id)}" style="--part-color:${/^#[0-9a-f]{6}$/i.test(part.color||'')?part.color:'#537b63'}"><div class="reign-card-heading"><span class="reign-part">${t(part.name)}</span>${pick?'<span class="reign-decided">결정함</span>':''}</div><h3>${t(event.title)}</h3>${pick?`<p class="reign-pick">✓ ${t(selected?.text||'결정 완료')}</p>${selected?effectMarkup(selected):''}${selected?.result?`<p class="reign-choice-result">${t(selected.result)}</p>`:''}`:`<div class="event-body">${t(event.body)}</div>${choices.map(({choice,index,enabled,reason})=>`<button class="choice" data-part-event="${escape(event.id)}" data-part-choice="${index}" ${enabled?'':'disabled'}><span class="choice-copy"><span class="choice-title">${t(choice.text)}</span>${choice.description?`<span class="choice-description">${t(choice.description)}</span>`:''}${effectMarkup(choice)}${enabled?projectedRiskMarkup(choice):`<span class="choice-locked">${t(reason)}</span>`}</span><span class="choice-arrow">↗</span></button>`).join('')}`}</article>`;
     }).join('')}<button class="btn primary reign-settle" data-action="settle-reign" ${status.ready?'':'disabled'}>${status.ready?'정산하고 '+(status.turnIndex+1===scenario.reign.turns.length?'결말 보기':'다음 해로'):'각 분야의 결정을 마치면 정산할 수 있습니다'}</button>`;
  }
  function playReign(eventId,index){
    if(!state||awaitingName)return;try{state=E.choosePart(scenario,state,eventId,index);rememberEnding();saveAuto();render();status('분야별 결정을 반영했습니다.');}catch(error){status(error.message,true);}
  }
  function settleReign(){
    if(!state||awaitingName)return;try{state=E.settleTurn(scenario,state);rememberEnding();saveAuto();render();status('선택의 조합을 정산했습니다.');byId('story-panel').focus({preventScroll:true});}catch(error){status(error.message,true);}
  }
  function renderEnding(){
    const ending=scenario.endings.find(e=>e.id===state.endingId);
    byId('story-panel').innerHTML=`<div class="event-meta"><span class="chapter">${ending.kind==='bad'?'정부의 통치가 끝났습니다':'역사의 한 페이지가 닫혔습니다'}</span><span>${state.turn}번의 결정</span></div><p class="ending-banner">${ending.kind==='bad'?'GAME OVER · BAD ENDING':'ANOTHER HISTORY, YOUR LEGACY'}</p><div class="ending-ornament" aria-hidden="true">${ending.kind==='bad'?'敗':'終'}</div><h2 class="ending-title">${t(ending.title)}</h2><p class="ending-summary">${t(ending.summary||'당신의 선택이 남긴 역사입니다.')}</p><div class="ending-body">${t(ending.body||'')}</div><div class="ending-actions"><button class="btn primary" data-action="restart">다른 역사를 써보기</button><button class="btn secondary" data-action="journal">선택의 기록</button><button class="btn secondary" data-action="collection">발견한 결말</button></div><p class="ending-footnote">${t(riskResultText(state.history[state.history.length-1]||{})||'수치와 선택 기록의 조합으로 결정된 결말입니다. 다른 선택은 또 다른 역사를 만듭니다.')}</p>`;
    if(reignMode()&&state.reign.results?.length)byId('story-panel').insertAdjacentHTML('afterbegin',`<section class="reign-results"><strong>마지막 정산</strong>${state.reign.results.map(r=>`<p>${t(typeof r==='string'?r:r.text)}</p>`).join('')}</section>`);
    if(!reignMode())byId('story-panel').insertAdjacentHTML('afterbegin',decisionResultMarkup());
  }
  function play(index){
    if(awaitingName||!state)return;
    try{state=E.choose(scenario,state,index);rememberEnding();saveAuto();render();const last=state.history[state.history.length-1];status('직전 결정: '+display(last.choiceText)+(effectText(last.effects)?' · '+effectText(last.effects):'')+(riskResultText(last)?' | 위기 판정: '+riskResultText(last):''));byId('story-panel').focus({preventScroll:true});}
    catch(error){status(error.message,true);}
  }
  function restart(ask=true){
    if(!state||awaitingName)return;
    if(ask&&state.turn>0&&!state.endingId&&!confirm('현재 회차를 끝내고 처음부터 시작할까요? 직접 저장한 진행은 남아 있습니다.'))return;
    try{
      const previous=state;
      state=E.createState(scenario,{playerName:previous.playerName});awaitingName=playerSettings().askName!==false;
      nameReturnState=awaitingName?previous:null;
      if(!awaitingName)saveAuto();render();status('');
    }catch(error){status(error.message,true);}
  }
  function info(title,body){byId('info-content').innerHTML=`<h2>${escape(title)}</h2>${body}`;byId('info-dialog').showModal();}
  function journal(){
    const entries=state?.history.map((h,i)=>{
      const effects={...(h.effects||{})};for(const result of h.results||[])for(const [id,delta] of Object.entries(result.effects||{}))effects[id]=(effects[id]||0)+delta;
      const resultText=h.result||(h.results||[]).map(r=>r.text).filter(Boolean).join('\n');
      return `<article class="journal-entry"><h3>${i+1}. ${t(h.eventTitle)}</h3><p>${t(h.choiceText)}</p><p>${t(effectText(effects)||'수치 변화 없음')}</p>${resultText?`<p>${t(resultText)}</p>`:''}${h.historical?'<p class="small">기준 역사와 같은 선택</p>':''}${riskResultText(h)?`<p class="journal-risk">사건·위기 판정 · ${t(riskResultText(h))}</p>`:''}</article>`;
    });info('지나온 선택',entries?.length?entries.join(''):'<p>아직 선택한 사건이 없습니다.</p>');
  }
  function collection(){const found=discovered();info('당신이 발견한 결말',scenario.endings.map(e=>found.includes(e.id)?`<article class="ending-item"><h3>${t(e.title)}</h3><p>${t(e.summary||'')}</p></article>`:'<article class="ending-item undiscovered"><h3>아직 쓰이지 않은 역사</h3><p>다른 선택을 통해 이 결말을 발견해 보세요.</p></article>').join(''));}
  function launcherMarkup(dialog){
    const currentMap=scenario.map||deferredStoredScenario?.map;
    const tabs=`<section class="map-maker-entry"><div><strong>지도만 만들고 싶다면</strong><p>지역과 시대를 고르고 영토·국가 이름·색을 편집하세요. 지도 JSON으로 보관하고 갤러리에 공유할 수 있습니다.</p></div><div class="toolbar"><button type="button" class="btn primary" data-launch-action="map-maker">지도 제작기 열기</button><button type="button" class="btn secondary" data-launch-action="new-map">새 지도 만들기</button><a class="btn secondary" href="gallery.html?kind=map" data-community-only>지도 갤러리</a>${currentMap?'<button type="button" class="btn secondary" data-launch-action="copy-scenario-map">현재 시나리오 지도 복사</button>':''}</div></section><div class="launcher-actions map-start-action"><button type="button" class="btn secondary" data-launch-action="setup-map">${currentMap?'현재 시나리오의 지역·시대 설정':'시나리오에 지역·시대 지도 넣기'}</button><span class="small muted">지역 선택 → 시대 기본안 → 지도에서 영토 수정</span></div><div class="launcher-tabs" role="tablist" aria-label="시나리오를 시작하는 방법"><button type="button" role="tab" class="launcher-tab" data-launch-action="mode-file" aria-selected="${launcherMode==='file'}">JSON 파일 열기</button><button type="button" role="tab" class="launcher-tab" data-launch-action="mode-ai" aria-selected="${launcherMode==='ai'}"><span aria-hidden="true">✦</span> AI로 만들기 · 붙여 넣기</button></div>`;
    const file=`<div class="scenario-dropzone" data-scenario-dropzone data-launch-action="choose-file" tabindex="0" role="button" aria-label="JSON 파일 불러오기. Enter 또는 스페이스 키로 파일을 고를 수 있습니다."><span class="drop-symbol" aria-hidden="true">↥</span><strong>JSON 파일을 이곳에 놓으세요</strong><span>또는 아래 버튼으로 파일 선택 · 최대 5 MB</span></div><div class="launcher-actions"><button type="button" class="btn primary" data-launch-action="choose-file">JSON 파일 불러오기</button><button type="button" class="btn secondary" data-launch-action="new">빈 시나리오 새로 작성</button></div><p class="launcher-progress" data-launch-progress role="status" aria-live="polite" ${launcherMessage?'':'hidden'}>${escape(launcherMessage)}</p><p class="launcher-error" data-launch-error role="alert" ${launcherError?'':'hidden'}>${escape(launcherError)}</p><button type="button" class="btn secondary" data-launch-action="retry-url" ${failedScenarioUrl?'':'hidden'}>주소에서 다시 불러오기</button><button type="button" class="btn secondary" data-launch-action="retry-startup" ${startupRetry?'':'hidden'}>저장한 시나리오 다시 열기</button>`;
    return `<section class="scenario-launcher" aria-label="시나리오 불러오기"><div class="small-label">YOUR STORY, YOUR CHOICES</div><h2>${dialog?'시나리오 열기':'어떤 이야기를 시작할까요?'}</h2><p>보관한 시나리오 JSON 파일을 열거나, AI에게 시나리오를 만들어 달라고 해서 붙여 넣으세요. 직접 작성할 수도 있습니다.</p><a class="launcher-gallery" href="gallery.html" data-community-only>다른 사람이 만든 시나리오를 갤러리에서 바로 플레이하기 <span aria-hidden="true">→</span></a><div class="sample-picks" data-web-only><span class="small muted">기능 예시</span><button class="btn secondary" data-launch-action="demo-chronicle">연대기 · 세종과 지도</button><button class="btn secondary" data-launch-action="demo-reign">치세 · 유럽과 정산</button><button class="btn secondary" data-launch-action="demo-world">동아시아 · 임진왜란</button></div>${tabs}<div class="launcher-pane">${launcherMode==='ai'?aiMarkup():file}</div><p class="launcher-note">파일과 붙여 넣은 내용은 브라우저 안에서만 읽습니다. 시나리오와 진행은 접속한 브라우저에 각각 저장되며, 다른 접속자와 공유되지 않습니다. 원고는 JSON으로 따로 보관하세요.</p>${dialog?'<p class="launcher-note">새 시나리오를 열면 현재 시나리오가 교체됩니다. 형식 검사를 통과한 내용만 적용합니다.</p><div class="launcher-dialog-footer"><button type="button" class="btn secondary" data-launch-action="close">돌아가기</button></div>':''}</section>`;
  }
  function aiPromptOptions(){
    const base=ai.base&&canUseBase()?scenario:null;
    return {idea:ai.idea,size:ai.size,endings:ai.endings,mode:ai.mode,mapTemplateId:ai.mapTemplateId,baseScenario:base?E.clone(base):null};
  }
  function aiPromptPreview(){
    if(aiMapLoading)return '선택한 지도만 불러오고 있습니다. 잠시 뒤 요청문을 확인할 수 있습니다.';
    if(aiMapError)return aiMapError;
    if(ai.mapTemplateId&&!globalThis.MapTemplates?.get(ai.mapTemplateId))return '선택한 지도를 불러온 뒤 요청문을 만들 수 있습니다. 요청문 복사를 누르면 다시 시도합니다.';
    try{return ai.prompt||ScenarioAI.buildPrompt(aiPromptOptions());}catch(error){return error.message;}
  }
  function updateAIPromptControls(){
    document.querySelectorAll('[data-launch-action="ai-copy-prompt"]').forEach(node=>{node.disabled=aiMapLoading;node.setAttribute('aria-busy',String(aiMapLoading));});
    document.querySelectorAll('[data-ai-prompt]').forEach(node=>{node.value=aiPromptPreview();});
    document.querySelectorAll('.ai-maker .ai-note').forEach(node=>{
      if(node.closest('.ai-problem'))return;
      const message=aiMapLoading?'선택한 지도만 불러오고 있습니다.':aiMapError||ai.promptNote;
      node.textContent=message;node.hidden=!message;
    });
  }
  function loadAIMap(){
    const sequence=++aiMapSequence,id=ai.mapTemplateId;
    aiMapError='';aiMapLoading=Boolean(id&&!globalThis.MapTemplates?.get(id));
    updateAIPromptControls();
    if(!aiMapLoading)return Promise.resolve(true);
    return Promise.resolve().then(()=>globalThis.MapTemplates.ensure(id)).then(()=>{
      if(sequence!==aiMapSequence)return false;
      aiMapLoading=false;updateAIPromptControls();return true;
    },error=>{
      if(sequence!==aiMapSequence)return false;
      aiMapLoading=false;aiMapError='지도를 불러오지 못했습니다. 요청문 복사를 눌러 다시 시도하세요. '+error.message;
      updateAIPromptControls();return false;
    });
  }
  function aiMarkup(){
    const sizes=Object.entries(ScenarioAI.SIZES).map(([key,item])=>`<option value="${key}" ${ai.size===key?'selected':''}>${escape(item.label)} · 사건 ${escape(item.events)}개${item.note?' ('+escape(item.note)+')':''}</option>`).join('');
    const endings=['3','4','5','6','8'].map(n=>`<option value="${n}" ${ai.endings===n?'selected':''}>${n}개</option>`).join('');
    const base=canUseBase()?`<label class="ai-check"><input type="checkbox" data-ai-field="base" ${ai.base?'checked':''}> 지금 열린 「${escape(scenario.title)}」을 바탕으로 고치거나 늘리기</label>`:'';
    const registry=globalThis.MapTemplates,regions=registry?.regions?.()||[],selected=registry?.selection?.(ai.mapTemplateId);
    const legacy=Boolean(ai.mapTemplateId&&!selected),regionId=selected?.regionId||(legacy?'legacy':'');
    const mapOptions=(registry?.list()||[]).filter(m=>!registry?.selection?.(m.id)).map(m=>`<option value="${escape(m.id)}" ${ai.mapTemplateId===m.id?'selected':''}>${escape(m.name)}</option>`).join('');
    const regionOptions=regions.map(r=>`<option value="${escape(r.id)}" ${regionId===r.id?'selected':''}>${escape(r.name)}</option>`).join('');
    const eraOptions=(selected?registry?.eras?.(selected.regionId):[]).map(era=>`<option value="${escape(era.id)}" ${selected?.eraId===era.id?'selected':''}>${escape(era.name)}</option>`).join('');
    const mapFields=regions.length?`<label class="field"><span>지도 범위</span><select data-ai-field="mapRegion"><option value="" ${!regionId?'selected':''}>지도 없이</option>${regionOptions}<option value="legacy" ${legacy?'selected':''}>기존 지도 호환</option></select></label>${legacy?`<label class="field"><span>기존 지도</span><select data-ai-field="mapTemplateId">${mapOptions}</select></label>`:`<label class="field"><span>시대 기본안</span><select data-ai-field="mapEra" ${!selected?'disabled':''}>${eraOptions||'<option>지역을 먼저 선택하세요</option>'}</select></label>`}`:`<label class="field"><span>지도</span><select data-ai-field="mapTemplateId"><option value="">지도 없이</option>${mapOptions}</select></label>`;
    const v2Options=`<div class="ai-v2-settings"><label class="field"><span>게임 방식</span><select data-ai-field="mode"><option value="chronicle" ${ai.mode==='chronicle'?'selected':''}>연대기 · 장면마다 선택</option><option value="reign" ${ai.mode==='reign'?'selected':''}>치세 · 분야별 선택 후 정산</option></select></label>${mapFields}</div>`;
    const problem=ai.problem;
    const repairable=problem&&problem.kind!=='blank';
    const tip=problem&&problem.kind==='truncated'?'<p class="ai-help">AI에게 “이어서 출력해 줘”라고 보낸 뒤, 이어진 부분을 붙여 넣은 내용 맨 끝에 덧붙여 다시 불러와도 됩니다.</p>':'';
    return `<div class="ai-maker"><p class="ai-intro">ChatGPT·Claude·Gemini 같은 AI에게 요청문을 붙여 넣으면, 이 프로그램에 바로 넣을 수 있는 시나리오 JSON을 써 줍니다. 이 사이트가 AI에 직접 접속하거나 내용을 보내지는 않습니다.</p><ol class="ai-steps">`+
      `<li class="ai-step"><div class="ai-step-head"><span class="ai-step-no" aria-hidden="true">1</span><strong>요청문 복사하기</strong></div><label class="field"><span>어떤 이야기를 원하나요? <small>비워 두면 AI가 주제를 고릅니다</small></span><textarea data-ai-field="idea" rows="3" maxlength="4000" placeholder="예: 1592년, 조선 수군이 먼저 대마도를 친다면? 왕의 입장에서 결정하는 이야기">${escape(ai.idea)}</textarea></label><div class="ai-options"><label class="field"><span>분량</span><select data-ai-field="size">${sizes}</select></label><label class="field"><span>엔딩 수</span><select data-ai-field="endings">${endings}</select></label></div>${v2Options}${base}<div class="ai-row"><button type="button" class="btn primary" data-launch-action="ai-copy-prompt" ${aiMapLoading?'disabled aria-busy="true"':''}>AI 요청문 복사</button><span class="ai-links">AI 열기 <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT</a><a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Claude</a><a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">Gemini</a></span></div><p class="ai-note" role="status" aria-live="polite" ${ai.promptNote?'':'hidden'}>${escape(ai.promptNote)}</p><details class="ai-prompt-view" ${ai.showPrompt?'open':''}><summary>요청문 내용 보기</summary><textarea readonly rows="8" data-ai-prompt aria-label="AI 요청문">${escape(aiPromptPreview())}</textarea></details></li>`+
      `<li class="ai-step"><div class="ai-step-head"><span class="ai-step-no" aria-hidden="true">2</span><strong>AI 답변 붙여 넣기</strong></div><p class="ai-help">AI의 답변을 통째로 복사해 붙여 넣으세요. 앞뒤 설명이나 \`\`\`json 표시가 섞여 있어도 JSON 부분만 골라냅니다. 다른 곳에서 복사한 시나리오 JSON도 됩니다.</p><textarea class="ai-paste" data-ai-field="paste" rows="7" spellcheck="false" aria-label="AI 답변 붙여 넣기" placeholder="여기에 붙여 넣기 (Ctrl+V)">${escape(ai.paste)}</textarea><div class="ai-row"><button type="button" class="btn primary" data-launch-action="ai-import">불러와서 시작하기</button><button type="button" class="btn secondary" data-launch-action="ai-clear">지우기</button><span class="ai-shortcut">Ctrl + Enter</span></div></li>`+
      `<li class="ai-step ai-problem" data-ai-problem tabindex="-1" ${problem?'':'hidden'}><div class="ai-step-head"><span class="ai-step-no warn" aria-hidden="true">3</span><strong>${repairable?'문제가 있어요 — AI에게 고쳐 달라고 하기':'붙여 넣은 내용을 확인해 주세요'}</strong></div><p class="launcher-error" role="alert">${escape(problem?.message||'')}</p>${repairable?`<p class="ai-help">아래 버튼으로 고쳐 달라는 문구를 복사해 <strong>같은 AI 대화</strong>에 보내세요. 새 답변을 2단계에 다시 붙여 넣으면 됩니다.</p>${tip}<div class="ai-row"><button type="button" class="btn primary" data-launch-action="ai-copy-repair">고쳐 달라는 문구 복사</button></div><p class="ai-note" role="status" aria-live="polite" ${ai.repairNote?'':'hidden'}>${escape(ai.repairNote||'')}</p><details class="ai-prompt-view" ${ai.showRepair?'open':''}><summary>문구 내용 보기</summary><textarea readonly rows="6" data-ai-repair aria-label="고쳐 달라는 문구">${escape(ai.repair)}</textarea></details>`:''}</li></ol></div>`;
  }
  function canUseBase(){return !isEmptyScenario();}
  function refreshLaunchers(focus){
    const dialog=byId('scenario-open-dialog');
    if(dialog.open)byId('scenario-open-content').innerHTML=launcherMarkup(true);
    if(homeMode)renderHome();else if(!state&&isEmptyScenario())byId('story-panel').innerHTML=launcherMarkup(false);
    updateLauncherFeedback();updateAIPromptControls();
    if(focus){const node=(dialog.open?dialog:byId('story-panel')).querySelector(focus);if(node){node.focus({preventScroll:true});node.scrollIntoView?.({block:'nearest',behavior:'smooth'});if(node.tagName==='TEXTAREA'&&node.readOnly)node.select();}}
  }
  async function copyText(text){
    try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}}catch{}
    try{
      const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      (document.querySelector('dialog[open]')||document.body).appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;
    }catch{return false;}
  }
  async function copyAIPrompt(){
    const sequence=aiMapSequence;
    if(ai.mapTemplateId&&!globalThis.MapTemplates?.get(ai.mapTemplateId)){
      if(!await loadAIMap())return;
      // Changing the selected map while it loads must not copy an old prompt.
      if(aiMapSequence!==sequence+1)return;
    }
    let base=null;
    if(ai.base&&canUseBase()){
      base=E.clone(scenario);
      if(JSON.stringify(base).length>150000){ai.promptNote='현재 시나리오가 너무 커서 AI 요청문에 함께 넣기 어렵습니다. ‘바탕으로 고치기’를 끄고 새로 만들거나, 고칠 부분만 따로 요청해 주세요.';ai.showPrompt=false;refreshLaunchers('[data-launch-action="ai-copy-prompt"]');return;}
    }
    ai.prompt=ScenarioAI.buildPrompt(aiPromptOptions());
    const ok=await copyText(ai.prompt);
    ai.showPrompt=!ok;
    ai.promptNote=ok?'요청문을 복사했습니다. AI 대화창에 붙여 넣어 보내고, 답변이 오면 전체를 복사해 2단계에 붙여 넣으세요.':'이 브라우저에서는 자동 복사가 막혀 있습니다. 아래 요청문을 모두 선택(Ctrl+A)해 복사해 주세요.';
    refreshLaunchers(ok?'[data-launch-action="ai-copy-prompt"]':'[data-ai-prompt]');
    if(ok)notify('AI 요청문을 복사했습니다.');
  }
  async function copyRepair(){
    if(!ai.repair)return;
    const ok=await copyText(ai.repair);
    ai.showRepair=!ok;
    ai.repairNote=ok?'복사했습니다. 같은 AI 대화에 붙여 넣어 보내세요.':'자동 복사가 막혀 있습니다. 아래 문구를 모두 선택해 복사해 주세요.';
    refreshLaunchers(ok?'[data-launch-action="ai-copy-repair"]':'[data-ai-repair]');
    if(ok)notify('고쳐 달라는 문구를 복사했습니다.');
  }
  async function importPasted(){
    ai.repairNote='';ai.showRepair=false;
    if(!ai.paste.trim()){ai.problem={kind:'blank',message:'붙여 넣은 내용이 없습니다. AI의 답변을 복사해 2단계 칸에 붙여 넣어 주세요.'};ai.repair='';refreshLaunchers('[data-ai-field="paste"]');return;}
    try{
      checkedText(ai.paste);
      const {value,cleaned}=ScenarioAI.extract(ai.paste);
      const fixes=ScenarioAI.normalize(value);
      const imported=await importScenario(value);if(!imported)return;
      ai.paste='';ai.problem=null;ai.repair='';
      const extra=[cleaned&&'불필요한 쉼표·주석 정리',fixes.length&&`빠진 항목 ${fixes.length}곳 기본값으로 채움`].filter(Boolean);
      status((state?(awaitingName?'붙여 넣은 시나리오를 불러왔습니다. 이름을 입력하고 시작하세요.':'붙여 넣은 시나리오를 불러왔습니다. 새로운 역사를 시작하세요.'):'붙여 넣은 내용을 편집 초안으로 열었습니다.')+(extra.length?` (자동 보정: ${extra.join(', ')})`:''));
      byId('story-panel').focus({preventScroll:true});
    }catch(error){
      if(error instanceof ScenarioAI.PasteError)ai.problem={kind:error.kind,detail:error.detail,message:error.message};
      else{
        const errors=String(error.message).split('\n').map(line=>line.trim()).filter(line=>line&&line!=='시나리오를 확인해 주세요.');
        ai.problem={kind:'validate',errors,message:`형식 검사에서 문제 ${errors.length}개를 찾았습니다. 현재 작업은 그대로 유지됩니다.\n`+errors.map(line=>'· '+line).join('\n')};
      }
      ai.repair=ScenarioAI.buildRepairPrompt(ai.problem);
      refreshLaunchers('[data-ai-problem]');
    }
  }
  function updateLauncherFeedback(){
    document.querySelectorAll('[data-launch-error]').forEach(node=>{node.textContent=launcherError;node.hidden=!launcherError;});
    document.querySelectorAll('[data-launch-progress]').forEach(node=>{node.textContent=launcherMessage;node.hidden=!launcherMessage;});
    document.querySelectorAll('[data-launch-action="retry-url"]').forEach(node=>{node.hidden=!failedScenarioUrl;node.disabled=launcherBusy;});
    document.querySelectorAll('[data-launch-action="retry-startup"]').forEach(node=>{node.hidden=!startupRetry;node.disabled=launcherBusy;});
    for(const action of ['resume-scenario','restart-scenario'])document.querySelectorAll(`[data-launch-action="${action}"]`).forEach(node=>{node.disabled=launcherBusy;});
    document.querySelectorAll('[data-scenario-dropzone]').forEach(node=>node.setAttribute('aria-busy',String(launcherBusy)));
  }
  function setLauncherFeedback(message='',error=''){
    launcherMessage=message;launcherError=error;updateLauncherFeedback();
  }
  function closeLauncher(){const dialog=byId('scenario-open-dialog');if(dialog.open)dialog.close();}
  function openLauncher(){
    const dialog=byId('scenario-open-dialog');byId('scenario-open-content').innerHTML=launcherMarkup(true);
    if(!dialog.open)dialog.showModal();updateLauncherFeedback();
    dialog.querySelector(launcherMode==='ai'?'[data-launch-action="mode-ai"]':'[data-launch-action="choose-file"]')?.focus({preventScroll:true});
  }
  function cancelPendingLoad(){
    loadSequence+=1;pendingUrlController?.abort();pendingUrlController=null;launcherBusy=false;
  }
  function deleteScenarioRecord(){
    const candidate=deferredStoredScenario||scenario;
    if(!deferredStoredScenario&&!scenario.map&&isEmptyScenario())return false;
    // A modal editor may own an unsaved draft or an independent map. Leave it
    // intact instead of letting a programmatic deletion bypass its close flow.
    if(byId('editor-dialog')?.open){notify('편집 중인 작업을 저장하고 편집기를 닫은 뒤 기록을 삭제하세요.');return false;}
    const title=String(candidate.title||'저장한 시나리오'),targetSignature=hash(candidate);
    if(!confirm(`「${title}」의 이 브라우저 기록을 삭제할까요?\n\n삭제: 이 시나리오의 원고 사본, 자동·직접 저장한 진행, 발견한 결말과 시작 화면 항목.\n유지: 다른 시나리오의 기록, 따로 저장한 지도, 내려받은 JSON 파일, 갤러리에 올린 원본과 이름 설정.\n\n다시 플레이하려면 JSON 파일이나 갤러리에서 시나리오를 불러와야 합니다. 삭제한 기록은 되돌릴 수 없습니다.`))return false;
    // Read only the keys owned by this exact manuscript. In particular, a
    // newer save from another story or another tab must never be swept away.
    const names=['scenario','autosave','save','collection:'+targetSignature,'sourceContext'];
    const snapshot=new Map(),attempted=[];
    const originalUrl=location.href,originalHistoryState=globalThis.history?.state;
    let cleanUrl,urlChanged=false;
    const parse=raw=>{try{return JSON.parse(raw);}catch{return null;}};
    const blank=E.createBlankScenario();
    try{
      for(const name of names){
        const key=baseKey+':'+name,raw=localStorage.getItem(key);
        if(raw===null)continue;
        const value=parse(raw);
        const matches=name==='scenario'?Boolean(value&&hash(value)===targetSignature&&JSON.stringify(value)===JSON.stringify(candidate)):
          name==='collection:'+targetSignature||value?.signature===targetSignature;
        if(matches)snapshot.set(key,raw);
      }
      const origin=localStorage.getItem('hc:galleryOrigin');
      if(origin!==null&&parse(origin)?.sig===targetSignature)snapshot.set('hc:galleryOrigin',origin);
      cleanUrl=new URL(originalUrl);
      for(const name of ['scenario','mapMaker','galleryImport'])cleanUrl.searchParams.delete(name);
      if(cleanUrl.href!==originalUrl){
        if(typeof globalThis.history?.replaceState!=='function')throw Error('시작 주소를 정리할 수 없습니다.');
        globalThis.history.replaceState(originalHistoryState,'',cleanUrl.href);urlChanged=true;
      }
      for(const [key,raw] of snapshot){
        if(localStorage.getItem(key)!==raw)throw Error('다른 탭에서 저장 내용이 바뀌었습니다.');
        attempted.push(key);localStorage.removeItem(key);
        if(localStorage.getItem(key)!==null)throw Error('브라우저가 기록 삭제를 허용하지 않았습니다.');
      }
    }catch(error){
      let rolledBack=true;
      for(const key of attempted.reverse())try{
        const currentRaw=localStorage.getItem(key);
        if(currentRaw===snapshot.get(key))continue;
        if(currentRaw!==null){rolledBack=false;continue;}
        localStorage.setItem(key,snapshot.get(key));
        if(localStorage.getItem(key)!==snapshot.get(key))rolledBack=false;
      }catch{rolledBack=false;}
      if(urlChanged)try{globalThis.history.replaceState(originalHistoryState,'',originalUrl);}catch{rolledBack=false;}
      storageOK=false;
      const message=rolledBack?'기록을 삭제하지 못했습니다. 원고와 진행은 그대로 유지했습니다. 브라우저 저장 설정을 확인해 주세요.':
        '기록 삭제 중 저장 공간에 접근하지 못해 일부 기록을 복구하지 못했을 수 있습니다. 현재 열린 원고는 유지했습니다. JSON으로 먼저 보관한 뒤 브라우저 저장 설정을 확인해 주세요.';
      setLauncherFeedback('',message);status(message,true);return false;
    }
    // Do this only after the storage transaction succeeds: canceling the
    // confirmation or a failed removal must leave an in-flight restore alone.
    cancelPendingLoad();globalThis.ScenarioEditor?.cancelPending?.();globalThis.MapMaker?.cancelPending?.();
    ++aiMapSequence;aiMapLoading=false;aiMapError='';ai.base=false;ai.prompt='';ai.showPrompt=false;
    failedScenarioUrl=null;deferredStoredScenario=null;startupRetry=false;startupRestore=true;
    scenario=blank;state=null;awaitingName=false;nameReturnState=null;compareMap=false;referenceCache=null;
    homeMode=true;launcherError='';launcherMessage='';closeLauncher();render();
    status(`「${title}」의 이 브라우저 기록을 삭제했습니다.`);notify('시나리오 기록을 삭제했습니다.');
    return true;
  }
  function checkedText(text){
    if(typeof text!=='string')throw Error('시나리오 파일의 내용을 텍스트로 읽을 수 없습니다.');
    if(text.length>MAX_SCENARIO_BYTES||new TextEncoder().encode(text).byteLength>MAX_SCENARIO_BYTES)throw Error('시나리오 파일은 최대 5 MB까지 불러올 수 있습니다.');
    return text.replace(/^\uFEFF/,'');
  }
  function parseScenarioText(text){
    const source=checkedText(text);let parsed;
    try{parsed=JSON.parse(source);}catch{throw Error('올바른 JSON 파일이 아닙니다. 파일 형식과 쉼표·따옴표를 확인해 주세요.');}
    return parsed;
  }
  function prepareScenario(next){
    const errors=E.validateScenario(next,{allowDraft:true}).errors;if(errors.length)throw Error(errors.join('\n'));
    checkedText(JSON.stringify(next));
    const copy=E.clone(next);
    return {scenario:copy,state:copy.draft===true?null:E.createState(copy,{playerName:copy.player?.defaultName||'집정관'})};
  }
  function ensureScenarioMap(next){
    const id=next?.map?.templateId,registry=globalThis.MapTemplates;
    if(typeof id!=='string'||!id||!registry?.ensure||registry.get(id))return null;
    return registry.ensure(id);
  }
  function prepareScenarioWithMap(next){
    // Freeze the requested manuscript before any asynchronous asset request.
    if(!next||typeof next!=='object')return prepareScenario(next);
    checkedText(JSON.stringify(next));
    const candidate=E.clone(next),loading=ensureScenarioMap(candidate);
    return loading?Promise.resolve(loading).then(()=>prepareScenario(candidate)):prepareScenario(candidate);
  }
  function importScenario(next){
    cancelPendingLoad();const sequence=loadSequence;
    const finish=prepared=>{
      if(sequence!==loadSequence)return null;
      if(byId('editor-dialog').open&&ScenarioEditor.close()===false)throw Error('시나리오 교체를 취소했습니다. 편집 중인 초안은 그대로 남아 있습니다.');
      failedScenarioUrl=null;setLauncherFeedback();
      commitScenario(prepared);closeLauncher();return E.clone(scenario);
    };
    const prepared=prepareScenarioWithMap(next);
    // Mapless and already loaded imports retain the original synchronous API.
    if(!prepared||typeof prepared.then!=='function')return finish(prepared);
    launcherBusy=true;setLauncherFeedback('시나리오에 필요한 지도만 불러오고 있습니다.');status('시나리오에 필요한 지도만 불러오고 있습니다.');
    return prepared.then(finish).catch(error=>{
      if(sequence!==loadSequence)return null;
      setLauncherFeedback('',error.message);status('지도를 불러오지 못했습니다. 현재 시나리오와 진행은 유지됩니다.',true);throw error;
    }).finally(()=>{if(sequence===loadSequence){launcherBusy=false;updateLauncherFeedback();}});
  }
  function importText(text){
    const data=parseScenarioText(text);
    if(globalThis.MapDocument?.isMap(data)){cancelPendingLoad();return Promise.resolve(MapMaker.importDocument(data)).then(result=>{closeLauncher();return result;});}
    return importScenario(data);
  }
  function newScenario(){
    importScenario(E.createBlankScenario());void runUI(()=>openScenarioEditor({page:'flowchart'}));return E.clone(scenario);
  }
  async function importFile(file){
    if(!file)return;
    cancelPendingLoad();const sequence=loadSequence;launcherBusy=true;failedScenarioUrl=null;setLauncherFeedback('파일을 읽고 검사하고 있습니다.');
    try{
      if(file.size>MAX_SCENARIO_BYTES)throw Error('시나리오 파일은 최대 5 MB까지 불러올 수 있습니다.');
      const text=await file.text();if(sequence!==loadSequence)return;
      const parsed=parseScenarioText(text);
      if(globalThis.MapDocument?.isMap(parsed)){
        await ensureScenarioMap(parsed);if(sequence!==loadSequence)return;
        await MapMaker.importDocument(parsed);if(sequence!==loadSequence)return;
        closeLauncher();setLauncherFeedback('지도를 지도 제작기로 열었습니다.');return;
      }
      const prepared=await prepareScenarioWithMap(parsed);if(sequence!==loadSequence)return;
      if(byId('editor-dialog').open&&ScenarioEditor.close()===false)throw Error('시나리오 교체를 취소했습니다.');
      commitScenario(prepared);closeLauncher();setLauncherFeedback('파일을 불러왔습니다.');
    }catch(error){if(sequence===loadSequence){setLauncherFeedback('',error.message);status('시나리오를 불러오지 못했습니다. 현재 작업은 유지됩니다.',true);}}
    finally{if(sequence===loadSequence){launcherBusy=false;updateLauncherFeedback();}}
  }
  async function responseText(response){
    const size=Number(response.headers?.get('content-length'));
    if(Number.isFinite(size)&&size>MAX_SCENARIO_BYTES)throw Error('시나리오 파일은 최대 5 MB까지 불러올 수 있습니다.');
    if(!response.body||typeof response.body.getReader!=='function')return checkedText(await response.text());
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{
      while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>MAX_SCENARIO_BYTES){await reader.cancel();throw Error('시나리오 파일은 최대 5 MB까지 불러올 수 있습니다.');}chunks.push(part.value);}
    }finally{reader.releaseLock?.();}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return checkedText(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){if(error.message.includes('5 MB'))throw error;throw Error('시나리오는 UTF-8로 저장한 JSON 파일이어야 합니다.');}
  }
  async function loadScenarioUrl(path){
    cancelPendingLoad();const sequence=loadSequence;failedScenarioUrl=path;launcherBusy=true;setLauncherFeedback('주소에서 시나리오를 불러오고 있습니다.');
    let timeout;
    try{
      const current=new URL(location.href);
      if(!['http:','https:'].includes(current.protocol))throw Error('주소로 불러오기는 웹 주소에서만 사용할 수 있습니다. JSON 파일 불러오기를 이용해 주세요.');
      const url=new URL(path,current);
      if(!['http:','https:'].includes(url.protocol)||url.origin!==current.origin||url.username||url.password)throw Error('현재 프로그램과 같은 사이트의 JSON 주소만 불러올 수 있습니다. 파일을 내려받아 직접 열어 주세요.');
      const controller=new AbortController();pendingUrlController=controller;timeout=setTimeout(()=>controller.abort(),20000);
      const response=await fetch(url.href,{credentials:'same-origin',redirect:'error',signal:controller.signal});
      if(!response.ok)throw Error(`파일을 불러올 수 없습니다. 서버 응답: ${response.status}`);
      if(response.url&&new URL(response.url,current).origin!==current.origin)throw Error('다른 사이트로 이동하는 시나리오 주소는 불러올 수 없습니다.');
      const text=await responseText(response);if(sequence!==loadSequence)return null;
      clearTimeout(timeout);pendingUrlController=null;
      const prepared=await prepareScenarioWithMap(parseScenarioText(text));if(sequence!==loadSequence)return null;
      if(byId('editor-dialog').open&&ScenarioEditor.close()===false)throw Error('시나리오 교체를 취소했습니다.');
      if(hash(prepared.scenario)!==signature())commitScenario(prepared);
      else saveSourceContext(storage.set('scenario',scenario));
      failedScenarioUrl=null;closeLauncher();setLauncherFeedback();status('주소의 시나리오를 불러왔습니다.');return E.clone(scenario);
    }catch(error){
      if(sequence!==loadSequence)return null;
      const message=error.name==='AbortError'?'주소에 연결하는 시간이 길어졌습니다. 다시 시도하거나 JSON 파일을 직접 열어 주세요.':error.message;
      setLauncherFeedback('',message);status('주소에서 불러오지 못했습니다. 현재 시나리오와 진행은 유지됩니다.',true);
      if(!isEmptyScenario())openLauncher();return null;
    }finally{clearTimeout(timeout);if(sequence===loadSequence){launcherBusy=false;pendingUrlController=null;updateLauncherFeedback();}}
  }
  function download(name,text,type='application/json'){
    const url=URL.createObjectURL(new Blob([text],{type:type+';charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function exportHTML(){
    try{
      let doc;
      if(byId('scenario-data')||byId('bootstrap-script'))doc=document.cloneNode(true);
      else{
        const response=await fetch('standalone.html',{credentials:'same-origin',redirect:'error'});if(!response.ok)throw Error('다운로드 파일을 읽을 수 없습니다.');
        doc=new DOMParser().parseFromString(await response.text(),'text/html');
        const parts=doc.getElementById('program-download-manifest');
        if(parts){
          if(!globalThis.ProgramDownload)throw Error('프로그램 내려받기 도구를 불러오지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.');
          const html=await ProgramDownload.reconstruct(JSON.parse(parts.textContent),response.url||new URL('standalone.html',location.href).href);
          doc=new DOMParser().parseFromString(html,'text/html');
        }
      }
      const blank=E.createBlankScenario(),embedded=doc.getElementById('scenario-data'),bootstrap=doc.getElementById('bootstrap-script');
      if(embedded)embedded.textContent=JSON.stringify(blank).replace(/</g,'\\u003c');
      else if(bootstrap)bootstrap.textContent='globalThis.DEFAULT_SCENARIO = GameEngine.createBlankScenario();';
      else throw Error('프로그램 내려받기 파일의 구성을 확인할 수 없습니다.');
      // Export only the bundled application, excluding browser-injected assets.
      const bundledScripts=new Set(['ai-script','engine-script','scenario-data','scenario-loader','bootstrap-script','flowchart-script','editor-script','app-script','map-templates-script','map-regions-script','map-view-script','map-document-script','map-maker-script']);
      doc.querySelectorAll('script').forEach(script=>{if(!bundledScripts.has(script.id))script.remove();});
      doc.querySelectorAll('link[rel="stylesheet"]').forEach(link=>link.remove());
      doc.querySelectorAll('style').forEach(style=>{if(!['game-styles','flowchart-styles','launcher-styles','map-view-styles','map-maker-styles','editor-v2-styles','standalone-styles'].includes(style.id))style.remove();});
      doc.querySelectorAll('dialog[open]').forEach(d=>d.removeAttribute('open'));
      doc.getElementById('editor-dialog').removeAttribute('data-editor-bound');
      doc.getElementById('editor-dialog').classList.remove('flowchart-mode','map-maker-mode');
      for(const id of ['editor-root','info-content','scenario-open-content','story-panel','stats-panel','flags-panel','turn-label','scenario-title','scenario-subtitle','scenario-description','risk-summary','toast','status-message','player-map','map-reference-tools','scenario-mode-label','timeline-panel','timeline-note','play-guide-content']){const node=doc.getElementById(id);if(node){node.innerHTML='';node.textContent='';}}
      for(const id of ['flags-count','ending-count']){const node=doc.getElementById(id);if(node)node.textContent=id==='flags-count'?'0':'0 / 0 →';}
      const saveStatus=doc.getElementById('save-status');if(saveStatus)saveStatus.textContent='';
      const timelineCount=doc.getElementById('timeline-count');if(timelineCount)timelineCount.textContent='0';
      doc.querySelectorAll('input').forEach(input=>{input.removeAttribute('value');input.value='';});
      doc.querySelectorAll('[data-web-only]').forEach(node=>node.remove());
      if(doc.getElementById('player-map-panel'))doc.getElementById('player-map-panel').hidden=true;
      doc.body.classList.remove('empty-workspace','has-player-map','is-home');doc.title='역사의 갈림길 · 시나리오 플레이어';
      doc.getElementById('toast').hidden=true;doc.getElementById('status-message').hidden=true;
      download('history-crossroads-player.html','<!doctype html>\n'+doc.documentElement.outerHTML,'text/html');
      notify('시나리오가 포함되지 않은 프로그램을 내려받았습니다. 원고는 JSON으로 별도 보관하세요.');
    }catch(error){status(error.message,true);}
  }
  function help(){
    info('이야기를 불러오고 직접 쓰세요',`<p>시나리오의 사건을 읽고 선택지를 누르면 수치와 선택 기록이 바뀝니다. 조건과 확률에 따라 다음 사건과 결말이 달라집니다.</p><ol><li><strong>시나리오 열기:</strong> JSON 파일을 선택하거나 불러오기 화면에 끌어다 놓으세요.</li><li><strong>직접 쓰기:</strong> 흐름도에서 사건과 돌발 사건을 추가하고, 카드에서 본문·선택지·조건·수치 변화를 고칩니다. 작성 중에는 ‘초안 저장’, 플레이할 준비가 되면 ‘적용하고 새 게임’을 누르세요.</li><li><strong>지도와 게임 방식:</strong> 편집기 기본 설정에서 연대기/치세를 고르고 지도 탭에서 지역과 시대 기본안을 고른 뒤, 지역을 눌러 시작 소유권을 수정합니다. 빠른 칠하기로 여러 지역을 연속해서 바꿀 수 있습니다. 선택지에 지역 변화와 기준 역사 표시를 붙일 수 있습니다. 치세에서는 분야별로 결정한 뒤 정산하면 다음 해로 진행합니다.</li><li><strong>지도만 만들기:</strong> 상단의 지도 만들기에서 사건 없이 지도를 제작하고 별도 JSON으로 보관합니다. 지도 갤러리에 공유하거나 이 지도로 시나리오 만들기로 새 이야기를 시작할 수 있습니다.</li><li><strong>AI로 만들기:</strong> ‘시나리오 열기’의 ‘AI로 만들기’ 탭에서 요청문을 복사해 ChatGPT·Claude 같은 AI에 보내고, 받은 답변을 붙여 넣으면 바로 플레이합니다. 문제가 있으면 AI에게 보낼 수정 요청 문구도 만들어 줍니다.</li><li data-community-only><strong>갤러리:</strong> 위쪽 ‘갤러리’에서 다른 사람의 시나리오를 플레이하고 좋아요를 누를 수 있습니다. 완성한 시나리오는 ‘갤러리에 올리기’로 공개할 수 있습니다(구글 로그인 필요).</li><li><strong>원고 보관:</strong> 시나리오 JSON을 내보내 보관하세요. ‘프로그램 내려받기’에는 원고가 포함되지 않습니다.</li><li><strong>진행 저장:</strong> 자동 저장으로 이어 하거나, ‘진행 저장’과 ‘불러오기’로 같은 내용의 시나리오에서 저장 지점으로 돌아갑니다.</li></ol><p class="notice">시나리오와 진행은 접속한 브라우저에 각각 저장되며 다른 접속자와 공유되지 않습니다. 브라우저 데이터를 지우기 전에는 원고를 JSON으로 내보내세요.</p><div class="toolbar"><button class="btn primary" id="download-html">프로그램 내려받기</button><button class="btn secondary" id="download-json">시나리오 JSON 내보내기</button><button class="btn secondary" id="new-scenario">빈 시나리오 새로 작성</button><button class="btn secondary" type="button" data-launch-action="open-ai">✦ AI로 시나리오 만들기</button><a class="btn secondary" href="gallery.html#upload" data-community-only>갤러리에 올리기</a></div>`);
    byId('download-html').onclick=exportHTML;
    byId('download-json').onclick=()=>download('scenario.json',JSON.stringify(scenario,null,2));
    byId('new-scenario').onclick=()=>{byId('info-dialog').close();newScenario();};
  }
  function applyScenario(next){
    cancelPendingLoad();
    return commitScenario(prepareScenario(next));
  }
  function commitScenario(prepared){
    leaveHome();
    deferredStoredScenario=null;startupRetry=false;
    scenario=prepared.scenario;state=prepared.state;compareMap=false;referenceCache=null;
    awaitingName=Boolean(state&&playerSettings().askName!==false);nameReturnState=null;
    const saved=storage.set('scenario',scenario);saveSourceContext(saved);if(awaitingName)storage.set('autosave',null);else saveAuto();
    render();status(saved?(state?(awaitingName?'시나리오를 적용했습니다. 이름을 입력하고 시작하세요.':'시나리오를 적용했습니다. 새로운 역사를 시작하세요.'):'작성 중인 초안을 저장했습니다. 흐름도에서 이어서 작성하세요.'):'브라우저 저장이 불가능하므로 JSON으로 내보내 보관하세요.');
  }
  byId('story-panel').addEventListener('submit',event=>{
    if(event.target.id!=='player-name-form')return;
    event.preventDefault();startWithName(byId('player-name-input').value);
  });
  byId('story-panel').addEventListener('click',event=>{
    const partChoice=event.target.closest('[data-part-choice]');if(partChoice&&!partChoice.disabled){playReign(partChoice.dataset.partEvent,Number(partChoice.dataset.partChoice));return;}
    const choice=event.target.closest('[data-choice]');if(choice&&!choice.disabled){play(Number(choice.dataset.choice));return;}
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='settle-reign')settleReign();
    if(action==='restart')restart(false);if(action==='journal')journal();if(action==='collection')collection();
    if(action==='edit-flow')void runUI(()=>openScenarioEditor({page:'flowchart'}));
    if(action==='edit-scenario')void runUI(()=>openScenarioEditor());
    if(action==='default-name')startWithName(playerSettings().defaultName);
    if(action==='cancel-name'&&nameReturnState){state=nameReturnState;nameReturnState=null;awaitingName=false;render();status('이전 진행으로 돌아왔습니다.');}
  });
  byId('restart-button').onclick=()=>restart();byId('journal-button').onclick=journal;byId('collection-button').onclick=collection;byId('help-button').onclick=help;
  byId('edit-button').onclick=()=>runUI(()=>openScenarioEditor());
  byId('flow-button').onclick=()=>runUI(()=>openScenarioEditor({page:'flowchart'}));
  byId('open-scenario-button').onclick=openLauncher;
  byId('map-maker-button').onclick=()=>runUI(()=>MapMaker.open()).then(result=>{if(result!==null)closeLauncher();});
  byId('scenario-import').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';void importFile(file);});
  function chooseScenarioFile(){const input=byId('scenario-import');input.value='';input.click();}
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-launch-action]')?.dataset.launchAction;
    if(event.target.closest('[data-map-compare]')){compareMap=!compareMap;renderMap();return;}
    if(!action)return;
    try{
      if(action==='demo-chronicle'||action==='demo-reign')void loadScenarioUrl('examples/'+(action==='demo-chronicle'?'chronicle-sejong.json':'regional-europe-demo.json')); 
      if(action==='demo-world')void loadScenarioUrl('examples/imjin-world.json');
      if(action==='choose-file')chooseScenarioFile();
      if(action==='resume-scenario'&&!launcherBusy)void runUI(()=>restoreDeferredScenario());
      if(action==='restart-scenario'&&!launcherBusy)void runUI(()=>startScenarioOver());
      if(action==='delete-scenario-record')deleteScenarioRecord();
      if(action==='new')newScenario();
      if(action==='setup-map')void runUI(()=>openScenarioEditor({page:'map'})).then(result=>{if(result!==null)closeLauncher();});
      if(action==='map-maker')void runUI(()=>MapMaker.open()).then(result=>{if(result!==null)closeLauncher();});
      if(action==='new-map')void runUI(()=>MapMaker.startNew()).then(result=>{if(result!==null)closeLauncher();});
      if(action==='copy-scenario-map')void runUI(async()=>{if(deferredStoredScenario&&!await restoreDeferredScenario())return null;if(scenario.map)return MapMaker.open(MapDocument.fromScenario(scenario));}).then(result=>{if(result!==null)closeLauncher();});
      if(action==='close')closeLauncher();
      if(action==='retry-url'&&failedScenarioUrl&&!launcherBusy)void loadScenarioUrl(failedScenarioUrl);
      if(action==='retry-startup'&&!launcherBusy)void restoreDeferredScenario(startupRestore);
      if(action==='mode-file'||action==='mode-ai'){launcherMode=action==='mode-ai'?'ai':'file';refreshLaunchers(`[data-launch-action="${action}"]`);}
      if(action==='ai-copy-prompt')void runUI(copyAIPrompt);
      if(action==='ai-copy-repair')void copyRepair();
      if(action==='ai-import')void importPasted();
      if(action==='ai-clear'){ai.paste='';ai.problem=null;ai.repair='';refreshLaunchers('[data-ai-field="paste"]');}
      if(action==='open-ai'){byId('info-dialog').close();launcherMode='ai';openLauncher();}
    }catch(error){setLauncherFeedback('',error.message);}
  });
  const aiFieldInput=event=>{
    const field=event.target.closest?.('[data-ai-field]');if(!field)return;
    const key=field.dataset.aiField;ai[key]=field.type==='checkbox'?field.checked:field.value;
    if(key==='mapRegion'){
      const registry=globalThis.MapTemplates,region=registry?.regions?.().find(r=>r.id===field.value);
      ai.mapTemplateId=region?registry.regionalId(region.id,region.defaultEra||registry.eras(region.id)[0].id):field.value==='legacy'?(registry.list().find(m=>!registry.selection?.(m.id))?.id||''):'';
    }
    if(key==='mapEra'){
      const registry=globalThis.MapTemplates,selected=registry?.selection?.(ai.mapTemplateId);
      if(selected)ai.mapTemplateId=registry.regionalId(selected.regionId,field.value);
    }
    if(key==='base'&&ai.base&&canUseBase()){
      ai.mode=scenario.mode||'chronicle';ai.mapTemplateId=scenario.map?.templateId||'';
      document.querySelectorAll('[data-ai-field="mode"]').forEach(node=>{node.value=ai.mode;});
      document.querySelectorAll('[data-ai-field="mapTemplateId"]').forEach(node=>{node.value=ai.mapTemplateId;});
    }
    if(key==='paste')return;
    ai.prompt='';ai.promptNote='';ai.showPrompt=document.querySelector('.ai-prompt-view[open] [data-ai-prompt]')!==null;
    if(['mapRegion','mapEra','base','mapTemplateId'].includes(key)){refreshLaunchers();void loadAIMap();return;}
    const preview=aiPromptPreview();
    document.querySelectorAll('[data-ai-prompt]').forEach(node=>{node.value=preview;});
    document.querySelectorAll('.ai-maker .ai-note').forEach(node=>{if(!node.closest('.ai-problem'))node.hidden=true;});
  };
  document.addEventListener('input',aiFieldInput);document.addEventListener('change',aiFieldInput);
  document.addEventListener('keydown',event=>{
    if(event.target.matches?.('[data-ai-field="paste"]')&&event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();importPasted();}
  });
  document.addEventListener('keydown',event=>{
    const zone=event.target.closest('[data-scenario-dropzone]');
    if(zone&&(event.key==='Enter'||event.key===' ')){event.preventDefault();chooseScenarioFile();}
  });
  document.addEventListener('dragover',event=>{
    const zone=event.target.closest('[data-scenario-dropzone]');
    if(zone||Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();
    if(zone){zone.classList.add('drag-over');if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}
  });
  document.addEventListener('dragleave',event=>event.target.closest('[data-scenario-dropzone]')?.classList.remove('drag-over'));
  document.addEventListener('drop',event=>{
    const zone=event.target.closest('[data-scenario-dropzone]');
    if(!zone&&!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
    event.preventDefault();document.querySelectorAll('.drag-over').forEach(node=>node.classList.remove('drag-over'));
    if(!zone){status('‘시나리오 열기’의 파일 영역에 JSON 파일을 놓아 주세요.');return;}
    const files=event.dataTransfer?.files;
    if(files?.length!==1){setLauncherFeedback('','JSON 파일을 한 번에 하나씩 놓아 주세요.');return;}
    void importFile(files[0]);
  });
  byId('save-button').onclick=()=>{if(!state||awaitingName)return;const ok=storage.set('save',envelope());render();notify(ok?'현재 진행을 저장했습니다.':'저장할 수 없습니다. 브라우저 저장 설정을 확인해 주세요.');};
  byId('load-button').onclick=()=>{
    const saved=storage.get('save');if(!saved||saved.signature!==signature()){notify('현재 시나리오와 호환되는 저장이 없습니다.');return;}
    if(!awaitingName&&state.turn&&!confirm('직접 저장한 지점으로 돌아갈까요?'))return;
    try{state=restoreSavedState(saved.state);awaitingName=false;nameReturnState=null;saveAuto();rememberEnding();render();status('저장한 진행을 불러왔습니다.');}catch(error){status('저장 불러오기 실패: '+error.message,true);}
  };
  document.addEventListener('keydown',event=>{
    if(homeMode||!state||awaitingName||event.altKey||event.ctrlKey||event.metaKey||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
    if(reignMode()&&!state.activeRandomEventId&&/^[1-9]$/.test(event.key)){
      const index=Number(event.key)-1,cards=E.getReignStatus(scenario,state).cards;
      const card=cards.find(c=>!state.reign.decisions[c.part.id]);
      if(card?.choices.find(c=>c.index===index)?.enabled){event.preventDefault();playReign(card.event.id,index);}return;
    }
    if(/^[1-9]$/.test(event.key)){const index=Number(event.key)-1,item=E.getChoices(scenario,state).find(c=>c.index===index);if(item?.enabled){event.preventDefault();play(index);}}
  });
  function initializeRuntime(prepared,restore=true){
    scenario=prepared.scenario;state=prepared.state;
    compareMap=false;referenceCache=null;awaitingName=Boolean(state&&playerSettings().askName!==false);nameReturnState=null;
    const auto=restore&&storage.get('autosave');
    if(state&&auto&&auto.signature===signature())try{state=restoreSavedState(auto.state);awaitingName=false;}catch{status('이전 자동 저장을 읽지 못해 새 회차를 시작합니다. 저장된 원본은 그대로 남아 있습니다.',true);}
    rememberEnding();render();
  }
  async function hydrateStored(candidate,sequence=loadSequence,restore=true){
    try{
      const id=candidate?.map?.templateId;
      if(id&&!globalThis.MapTemplates?.get(id)){
        launcherBusy=true;setLauncherFeedback('저장한 시나리오에 필요한 지도만 불러오고 있습니다.');status('저장한 시나리오의 지도를 불러오고 있습니다.');
      }
      const prepared=await prepareScenarioWithMap(candidate);if(sequence!==loadSequence)return null;
      deferredStoredScenario=null;startupRetry=false;
      // Continuing an old save after a different link failed must not leave
      // that failed link in the address or adopt it as the saved story's source.
      const savedContext=storage.get('sourceContext');
      if(new URL(location.href).searchParams.has('scenario')&&
        (savedContext?.context!==sourceContext()||savedContext.signature!==hash(candidate))){
        try{const url=new URL(location.href);url.searchParams.delete('scenario');globalThis.history?.replaceState(null,'',url.href);}catch{}
      }
      failedScenarioUrl=null;
      setLauncherFeedback();leaveHome();status('');initializeRuntime(prepared,restore);
      if(!restore&&state&&!awaitingName)saveAuto();
      return E.clone(scenario);
    }catch(error){
      if(sequence!==loadSequence)return null;
      startupRetry=true;startupRestore=restore;deferredStoredScenario=candidate;
      setLauncherFeedback('',error.message);render();status('저장한 시나리오를 열지 못했습니다. 원고와 진행은 보존했습니다. ‘저장한 시나리오 다시 열기’로 재시도하세요. '+error.message,true);
      return null;
    }finally{if(sequence===loadSequence){launcherBusy=false;updateLauncherFeedback();}}
  }
  function restoreDeferredScenario(restore=true){
    if(!deferredStoredScenario){leaveHome();render();return Promise.resolve(E.clone(scenario));}
    const candidate=deferredStoredScenario;cancelPendingLoad();startupRestore=restore;
    return hydrateStored(candidate,loadSequence,restore);
  }
  function startScenarioOver(){
    if(!deferredStoredScenario&&!isEmptyScenario())deferredStoredScenario=E.clone(scenario);
    return restoreDeferredScenario(false);
  }
  async function openScenarioEditor(settings){
    if(deferredStoredScenario&&!await restoreDeferredScenario())return null;
    return ScenarioEditor.open(scenario,applyScenario,settings);
  }
  // UI actions may become asynchronous when their selected map is not cached.
  function runUI(action){
    try{return Promise.resolve(action()).catch(error=>{setLauncherFeedback('',error.message);status(error.message,true);return null;});}
    catch(error){setLauncherFeedback('',error.message);status(error.message,true);return Promise.resolve(null);}
  }
  async function initializeApplication(){
    const scenarioPath=new URL(location.href).searchParams.get('scenario');
    const savedContext=storage.get('sourceContext');
    const sameSource=Boolean(custom&&savedContext?.context===sourceContext()&&savedContext.signature===hash(custom));
    // The landing screen needs only the saved manuscript's title. Never load
    // its map or replay its autosave before an explicit continue/restart action.
    if(custom)deferredStoredScenario=custom;
    initializeRuntime(prepareScenario(E.clone(DEFAULT_SCENARIO)),false);
    if(scenarioPath&&!requestedHome&&!sameSource){
      // A new scenario link is an explicit request; unrelated saved maps stay
      // deferred even when the requested link fails.
      return loadScenarioUrl(scenarioPath);
    }
    return E.clone(deferredStoredScenario||scenario);
  }
  // A mapless/loaded import is synchronous; an unloaded map import is awaitable.
  // Home exposes the saved manuscript while leaving its heavy map unhydrated.
  globalThis.HistoryCrossroads={getScenario:()=>E.clone(deferredStoredScenario||scenario),getState:()=>E.clone(state),importScenario,importText,newScenario,resumeScenario:restoreDeferredScenario,startScenarioOver,deleteScenarioRecord,ready:Promise.resolve(null)};
  globalThis.HistoryCrossroads.ready=initializeApplication();
  globalThis.MapMaker?.configure({onCreateScenario:next=>{
    cancelPendingLoad();failedScenarioUrl=null;
    const prepared=prepareScenario(next);
    // A reusable map starts a new draft only through this explicit action.
    const url=new URL(location.href);url.searchParams.delete('scenario');url.searchParams.delete('mapMaker');
    globalThis.history?.replaceState(null,'',url.href);
    commitScenario(prepared);closeLauncher();
    // Let the map editor finish its explicit create action before opening the
    // new scenario editor, so it does not ask to discard the just-saved map.
    void Promise.resolve().then(()=>runUI(()=>openScenarioEditor({page:'overview'})));
  }});
  globalThis.HistoryCrossroads.ready.then(async()=>{
    if(!globalThis.MapMaker)return;
    const url=new URL(location.href);if(url.searchParams.get('mapMaker')!=='1')return;
    const sequence=loadSequence;
    let pending;
    try{pending=JSON.parse(sessionStorage.getItem('hc:pendingMapImport')||'null');}catch{}
    try{
      const result=pending?.data?await MapMaker.importDocument(pending.data):await MapMaker.open();
      if(sequence!==loadSequence||result===false)return;
      try{sessionStorage.removeItem('hc:pendingMapImport');}catch{}
      url.searchParams.delete('mapMaker');globalThis.history?.replaceState(null,'',url.href);
    }catch(error){if(sequence===loadSequence)status('지도를 열지 못했습니다. 현재 시나리오는 유지됩니다: '+error.message,true);}
  }).catch(error=>status('초기 화면을 준비하지 못했습니다. 저장된 원고와 진행은 그대로 남아 있습니다: '+error.message,true));
})();
