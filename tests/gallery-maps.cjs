'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(dir, 'gallery.js'), 'utf8');
let passed = 0;
function test(name, run) { run(); console.log('ok ' + name); passed++; }
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const functions = extract('  function checkScenario(data)', '  // ---------------------------------------------------------------- setup');
const sample = { type: 'map', schemaVersion: 1, id: 'sample_map', title: '지도', description: '', map: {templateId: 'test'} };
const scenario = {schemaVersion: 1, title: '이야기', events: [{}], endings: [{}], stats: []};
function scope(kind) {
  const state = {kind};
  const context = {state, M: {isMap: data => data?.type === 'map', validate: data => ({errors: data.invalid ? ['잘못된 지역'] : []})}, E: {validateScenario: data => ({errors: data.type === 'map' ? ['사건 필요'] : []})}, window: {MapTemplates: {get: id => id === "test" ? {} : null, list: () => [{id:'test',name:'시험 지도'}]}}, localStorage: {getItem: () => JSON.stringify(kind === 'map' ? sample : scenario)}, TextEncoder, MAX_BYTES: 1024 * 1024, WORKING_KEY: 'scenario', esc: String};
  vm.runInNewContext(functions + '\nthis.api={checkContent,workingScenario,featureBadges};', context);
  return context;
}
test('map upload validation is independent from playable scenarios and enforces 1 MB', () => {
  const context = scope('map');
  assert.equal(context.api.checkContent(sample), '');
  assert.match(context.api.checkContent(scenario), /지도 전용/);
  assert.match(context.api.checkContent({...sample, invalid: true}), /잘못된 지역/);
  assert.match(context.api.checkContent({...sample, description:'a'.repeat(1024 * 1024)}), /1 MB/);
  const story = scope('scenario');
  assert.equal(story.api.checkContent(scenario), '');
  assert.match(story.api.checkContent(sample), /지도 JSON/);
});
test('working maps use a separate storage key and have map badges without game modes', () => {
  const context = scope('map'); let key;
  context.localStorage.getItem = name => { key=name; return JSON.stringify(sample); };
  assert.equal(context.api.workingScenario().data.id, sample.id);
  assert.equal(key, 'hc:workingMap:v1');
  context.isMap = item => item?.type === 'map' || item?.content_kind === 'map';
  const badges = context.api.featureBadges(sample);
  assert.match(badges, /시험 지도/); assert.doesNotMatch(badges, /연대기|치세/);
});
async function filters() {
  const loadSource = extract('  function applyFilters(query)', '  async function loadLiked(ids)');
  const records = Array.from({length: 60}, (_,index) => ({id:String(index),title:'작품',like_count:index,created_at:index,play_count:60-index,content_kind:index%2?'map':'scenario',status:'public',author_id:'me',likedBy:'me'}));
  const state = {kind:'map',user:{id:'me'},tab:'liked',sort:'popular',q:'',tag:'',items:[],total:0,seq:0};
  const calls=[];
  const context={state, PAGE:24,META:'id,content_kind',SORTS:{popular:[['like_count',false]],recent:[['created_at',false]]},sanitizeSearch:String,noun:()=>state.kind==='map'?'지도':'시나리오',renderList(){},loadLiked:async()=>{},loadReports:async()=>{},friendlyError:String,registered:()=>true,client:{from(table){
    assert.equal(table,'scenarios');let rows=records.slice(),from=0,to=999,orders=[];const filters=[];
    const query={select(){return query;},eq(field,value){filters.push([field,value]);rows=rows.filter(r=>(field==='likes.user_id'?r.likedBy:r[field])===value);return query;},or(){return query;},order(field,opts){orders.push([field,opts.ascending]);return query;},range(a,b){from=a;to=b+1;return query;},then(resolve){calls.push(filters);rows.sort((a,b)=>{for(const [field,asc]of orders)if(a[field]!==b[field])return(a[field]>b[field]?1:-1)*(asc?1:-1);return 0;});return Promise.resolve({data:rows.slice(from,to),count:rows.length,error:null}).then(resolve);}};return query;
  }}};
  vm.runInNewContext(loadSource+'\nthis.load=load;',context);
  await context.load(true);assert.equal(state.total,30);assert.equal(state.items[0].id,'59');assert.equal(state.items.length,24);assert.ok(state.items.every(item=>item.content_kind==='map'));
  await context.load(false);assert.equal(state.items.length,30);
  for(const tab of ['all','mine','admin']){state.tab=tab;await context.load(true);assert.ok(state.items.every(item=>item.content_kind==='map'));}
  state.kind='scenario';state.tab='all';await context.load(true);assert.equal(state.total,30);assert.equal(state.items[0].id,'58');
  assert.ok(calls.every(filter=>filter.some(([field])=>field==='content_kind')));
  passed++;console.log('ok map/scenario server filtering precedes pagination for liked/all/mine/admin');
}
test('map row actions and pending imports cannot select scenario documents', () => {
  assert.match(source, /select\('id,title,data,content_kind'\)\.eq\('content_kind', state\.kind\)/);
  assert.match(source, /select\('title,data'\)\.eq\('content_kind', state\.kind\)/);
  assert.match(source, /select\(META\)\.eq\('content_kind', state\.kind\)\.eq\('id', id\)\.maybeSingle/);
  assert.match(source, /sessionStorage\.setItem\('hc:pendingMapImport'/);
  assert.match(source, /location\.href = 'index\.html\?mapMaker=1'/);
  assert.match(source, /payload\.data = state\.kind === 'map' \? M\.normalize/);
});
test('additive map migration keeps authentication, grants, moderation and existing records', () => {
  const migration=fs.readFileSync(path.join(dir,'supabase/migrate-v2.3-maps.sql'),'utf8');
  assert.match(migration,/^begin;$/m);assert.match(migration,/^commit;$/m);
  assert.match(migration,/add column if not exists content_kind text not null default 'scenario'/);
  assert.match(migration,/new\.content_kind := case when new\.data ->> 'type' = 'map'/);
  assert.match(migration,/new\.event_count := 0; new\.ending_count := 0/);
  assert.match(migration,/content_kind = 'scenario'/);
  assert.match(migration,/perform public\.hc_check_upload_rate\(auth\.uid\(\)\)/);
  assert.doesNotMatch(migration,/(?:drop\s+table|delete\s+from|create\s+policy|drop\s+policy|revoke\s+|grant\s+)/i);
  assert.match(migration,/jsonb_typeof\(doc #> '\{map,countries\}'\)/);
  assert.match(migration,/foreach layer_name in array array\['owners','occupation','influence','markers'\]/);
  const fresh=fs.readFileSync(path.join(dir,'supabase/schema.sql'),'utf8');
  for(const functionName of ['hc_gallery_data_valid','hc_scenarios_metadata_v2','hc_scenarios_before_write','increment_play']){
    const body=text=>text.slice(text.indexOf('create or replace function public.'+functionName),text.indexOf('end $$;',text.indexOf('create or replace function public.'+functionName))+7);
    if(functionName!=='increment_play')assert.equal(body(migration),body(fresh));
  }
});
async function galleryNavigation() {
  const playSource=extract('  let playSequence = 0;', '  async function downloadJSON(id)');
  const id='88888888-8888-4888-8888-888888888888';
  for(const kind of ['scenario','map']){
    const data=kind==='map'?sample:scenario,session=new Map(),local=new Map(),calls=[],location={href:'https://example.test/gallery.html'},state={kind};
    const context={state,location,PENDING_KEY:'hc:pendingImport',noun:()=>kind==='map'?'지도':'시나리오',toast(){},friendlyError:String,ensureContent:async value=>assert.equal(value,data),checkContent:()=>'',M:{normalize:value=>value},E:{validateScenario:()=>({errors:[]})},sessionStorage:{setItem:(key,value)=>session.set(key,String(value))},localStorage:{getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,String(value))},Date,encodeURIComponent,client:{from(table){assert.equal(table,'scenarios');const query={select(){return query;},eq(field,value){calls.push([field,value]);return query;},single:async()=>({data:{id,title:'선택한 작품',data,content_kind:kind},error:null})};return query;},rpc:async(name,args)=>{calls.push([name,args]);return{error:null};}}};
    vm.runInNewContext(playSource+'\nthis.playAction=play;',context);await context.playAction(id);
    const target=new URL(location.href,'https://example.test/');assert.equal(target.pathname,'/index.html');
    assert.ok(calls.some(([field,value])=>field==='content_kind'&&value===kind));
    if(kind==='scenario'){
      assert.equal(target.searchParams.get('galleryImport'),id);assert.equal(target.searchParams.has('home'),false);assert.equal(target.searchParams.has('mapMaker'),false);
      assert.equal(JSON.parse(session.get('hc:pendingImport')).id,id);assert.equal(session.has('hc:pendingMapImport'),false);assert.ok(calls.some(([name])=>name==='increment_play'));
    }else{
      assert.equal(target.searchParams.get('mapMaker'),'1');assert.equal(target.searchParams.has('galleryImport'),false);assert.equal(JSON.parse(session.get('hc:pendingMapImport')).id,id);assert.equal(session.has('hc:pendingImport'),false);assert.equal(calls.some(([name])=>name==='increment_play'),false);
    }
  }
  passed++;console.log('ok executed gallery play actions mark explicit scenario handoffs and preserve map navigation');
  const renderSource=extract('  function renderKind()', '  function toast(message)');
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{querySelector:()=>({hidden:false}),setAttribute(){}});return nodes.get(id);};
  const context={state:{kind:'scenario'},$:node,noun:()=>context.state.kind==='map'?'지도':'시나리오',document:{title:''}};
  vm.runInNewContext(renderSource+'\nthis.render=renderKind;',context);context.render();assert.equal(node('maker-link').href,'index.html?home=1');context.state.kind='map';context.render();assert.equal(node('maker-link').href,'index.html?mapMaker=1');
  const html=fs.readFileSync(path.join(dir,'gallery.html'),'utf8');assert.match(html,/<a\b[^>]*id="maker-link"[^>]*href="index\.html\?home=1"/);assert.match(html,/<a\b[^>]*class="brand"[^>]*href="index\.html\?home=1"/);
  passed++;console.log('ok executed gallery kind switching sends scenario maker and static home links to the passive landing page');
}
filters().then(galleryNavigation).then(()=>console.log('Passed '+passed+' map gallery checks. Database SQL inspected, not executed.')).catch(error=>{console.error(error);process.exitCode=1;});
