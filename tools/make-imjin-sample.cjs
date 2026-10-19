'use strict';
// Scenario content only. Geometry and game rules remain in the existing engine.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const atlas=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/world-detailed.json'),'utf8'));
const lon=p=>p.cx/6-180,lat=p=>90-p.cy/6;
const korea=atlas.provinces.filter(p=>['kor','prk'].includes(p.owner));
const japan=atlas.provinces.filter(p=>p.owner==='jpn');
const find=(owner,name,predicate=()=>true)=>{
 const p=atlas.provinces.find(p=>p.owner===owner&&p.name===name&&predicate(p));
 if(!p)throw Error('Missing map region: '+owner+'/'+name);return p;
};
const seoul=find('kor','Jongno-gu'),busan=find('kor','Busanjin-gu');
const dongnae=find('kor','Dongnae-gu'),pyongyang=find('prk','Pyongyang');
const uiju=find('prk','Uiju'),yeosu=find('kor','Yeosu-si');
const tongyeong=find('kor','Tongyeong-si'),jinju=find('kor','Jinju-si');
const chungju=find('kor','Chungju-si'),mokpo=find('kor','Mokpo-si');
const tsushima=find('jpn','Tsushima',p=>lon(p)<131),fukuoka=find('jpn','Fukuoka');
const beijing=find('chn','Beijingshi'),liaodong=find('chn','Dalianshi');
const southTwo=korea.filter(p=>p.owner==='kor'&&((lon(p)<127.8&&lat(p)<36.10)||(lon(p)>=127.8&&lat(p)<36.95)));
const southFour=korea.filter(p=>p.owner==='kor'&&lat(p)<37.9);
const kyushu=japan.filter(p=>lon(p)>=129.4&&lon(p)<132.1&&lat(p)>=30.9&&lat(p)<34.05);
const ports=korea.filter(p=>p.owner==='kor'&&lon(p)>128.7&&lat(p)<35.55&&lat(p)>34.8);
const southCoast=korea.filter(p=>p.owner==='kor'&&lat(p)>34.5&&lat(p)<35.3&&lon(p)>127.1);
const own=(regions,to)=>regions.map(p=>({prov:p.id,to,occupation:null,influence:null,marker:null}));
const occupy=(regions,by='jpn')=>regions.map(p=>({prov:p.id,occupation:by}));
const clear=regions=>regions.map(p=>({prov:p.id,occupation:null,influence:null}));
const mark=(p,marker)=>({prov:p.id,marker});
const flag=(key,value=true)=>({kind:'flag',key,op:'eq',value});
const stat=(key,op,value)=>({kind:'stat',key,op,value});
const choice=(text,effects,result,options={})=>({text,effects,result,when:[],...options});
const scene=(id,date,title,speaker,body,next,choices,options={})=>({id,date,title,speaker,body,next,choices,when:[],...options});
const victoryMap=[...clear(korea),mark(seoul,'한성 · 전후 복구'),mark(busan,'부산 · 일본군 철수')];
const owners={};
for(const p of korea)owners[p.id]='kor';
// The sample deliberately avoids colouring the full modern Chinese boundary as Ming territory.
for(const p of atlas.provinces.filter(p=>p.owner==='chn'))owners[p.id]='reference';
owners[beijing.id]=owners[liaodong.id]='ming';
for(const p of japan){
 if(lat(p)>=41.4)owners[p.id]='reference';
 else if(lat(p)<30.5&&lon(p)<132)owners[p.id]='ryukyu';
}
const definitions=[
 ['prepared','전쟁 전 대대적 준비'],['mobile_defense','길목 방어와 파발 정비'],
 ['local_command','광해군의 분조'],['fleet_ready','작전 가능한 수군'],
 ['voice','강화교섭에 조선의 입장 제시'],['logistics','둔전·수운 복구'],
 ['counter_plan','전후 해상 원정 준비'],['fleet_kept','1597년 함대 보전'],
 ['fleet_lost','1597년 수군 지휘 실패'],['war_started','임진왜란 발발'],
 ['late_war','1597년 이후'],['war_won','일본군의 한반도 철수'],
 ['japan_rule','조선 왕실의 항복'],['full_terms','일본 요구 전면 수락'],
 ['partition','남부 두 도 할양'],['ascension','대마도·규슈 지배'],
 ['relief','군량 수송망 정비']
];
const wartime=[flag('war_started'),flag('war_won',false),flag('japan_rule',false),flag('full_terms',false),flag('partition',false)];
const scenario={
 schemaVersion:2,id:'imjin_crossroads_world_v1',mode:'chronicle',
 title:'임진년의 갈림길',subtitle:'1591–1598 · 조선의 국왕이 되어 전쟁과 외교의 선택을 내리세요',
 description:'실존 인물과 전쟁의 큰 흐름을 바탕으로 한 약 10분 분량의 대체역사 예제입니다. 수치·확률·대사·인과관계는 게임용 창작이며, 기준 표시는 실제 역사의 큰 방향만 뜻합니다. 지도는 현대 행정구역을 재사용합니다. 남북 지역을 조선으로 묶었고, 명은 북경·요동의 외교 거점만 표시합니다. 주변 세계는 현대 참고 지도이며, 점령 빗금과 남부 할양·해외 원정의 경계도 역사적 행정구역을 정확히 재현하지 않습니다.',
 player:{askName:true,label:'조선 국왕의 이름',defaultName:'선조',placeholder:'기본 이름은 선조입니다'},
 start:'envoys_1591',
 stats:[
  {id:'treasury',name:'재정',min:0,max:100,initial:70,color:'#a18537'},
  {id:'morale',name:'민심',min:0,max:100,initial:62,color:'#4c8063'},
  {id:'military',name:'군사',min:0,max:100,initial:42,color:'#ad5947'},
  {id:'diplomacy',name:'외교',min:0,max:100,initial:50,color:'#456c9e'}
 ],
 flags:definitions.map(([id,name])=>({id,name,initial:false})),
 map:{templateId:'world-detailed',playerCountry:'kor',countries:[
  {id:'kor',name:'조선',color:'#63886f',focusBounds:[1826.2,282,1864.2,334.2]},
  {id:'jpn',name:'도요토미 정권',color:'#bd7568'},
  {id:'ming',name:'명 · 외교 거점',color:'#bba157',focusBounds:[1772,284,1814,312]},
  {id:'reference',name:'시나리오 범위 밖',color:'#bfc3b7',focusBounds:[1521,218,1888,418]},
  {id:'ryukyu',name:'류큐',color:'#7fa9aa',focusBounds:[1834,363,1867,403]}
 ],initial:{owners,occupation:{},influence:{},markers:{
  [seoul.id]:'한성 · 조선 조정',[busan.id]:'부산 · 바다의 관문',
  [pyongyang.id]:'평양',[uiju.id]:'의주 · 압록강의 길',
  [yeosu.id]:'전라좌수영 · 이순신',[tsushima.id]:'쓰시마(대마도)',
  [beijing.id]:'북경 · 명 조정',[liaodong.id]:'요동 · 원군과 군량의 통로'
 }}},
 events:[
  scene('envoys_1591','1591년 봄','같은 사신, 다른 보고','황윤길 · 김성일 · 유성룡',
   '일본에 다녀온 통신사가 돌아왔습니다. 황윤길은 침략의 징후를 경고하고, 김성일은 같은 판단을 내리지 않습니다. 남부의 성곽은 이미 보강 중이지만, 일본 전체의 군대가 바다를 건널 경우까지 감당할 준비는 부족합니다. 유성룡은 병선과 군량을 먼저 살피자고 아룁니다. {name} 전하, 지금 어느 정도의 부담을 감수하시겠습니까?',
   'landing_1592',[
    choice('성곽을 보수하고 이순신에게 수군 정비를 맡긴다',{treasury:-8,military:8},'남부의 수비와 전라좌수영을 보강했습니다. 이듬해 봄, 부산에 대규모 일본군이 상륙했다는 장계가 도착합니다.',{historical:true,setFlags:{fleet_ready:true,war_started:true},territory:occupy(ports)}),
    choice('군역 부담을 감수하고 육해군·군량을 대대적으로 준비한다',{treasury:-18,military:20,morale:-5},'준비가 충실할수록 침략 이후 다른 대응이 열립니다. 그러나 이듬해의 상륙 자체를 막지는 못했습니다.',{setFlags:{prepared:true,fleet_ready:true,war_started:true},territory:occupy(ports)}),
    choice('대규모 증강을 미루고 쓰시마를 통한 교섭에 힘쓴다',{treasury:8,diplomacy:8,military:-5},'교섭 통로는 남았지만 병력의 준비는 부족합니다. 1592년 봄, 고니시 유키나가의 선봉이 바다를 건넙니다.',{setFlags:{war_started:true},territory:occupy(ports)})
   ]),
  scene('landing_1592','1592년 봄','부산에서 올라온 급보','신립 · 이일',
   '부산진의 정발과 동래의 송상현이 무너졌습니다. 고니시 유키나가와 가토 기요마사의 군대가 북상합니다. 남부의 병력을 모을 시간이 부족하고, 어느 길목에 군량을 보낼지부터 결정해야 합니다. 지도에서 일본색 빗금은 점령을 뜻하며, 아직 조선의 영유권을 넘긴 것은 아닙니다.',
   'prepared_pass',[
    choice('산악 길목을 지키며 군량·파발을 연결한다',{treasury:-6,military:6,morale:-3},'부대를 한곳에 몰아넣기보다 길목과 연락망을 지킵니다. 전쟁 전에 대대적으로 준비했다면 추가 방어 장면이 열립니다.',{setFlags:{mobile_defense:true},territory:[...occupy([chungju]),mark(chungju,'충주 · 방어와 파발의 분기점')]}),
    choice('신립에게 주력을 모아 충주에서 결전을 맡긴다',{treasury:-5,military:-12,morale:-8},'탄금대의 패보가 조정에 도착합니다. 남은 병력으로 수도와 왕실을 지킬 길을 다시 찾아야 합니다.',{historical:true,territory:[...occupy([chungju]),mark(chungju,'충주 · 탄금대 패전')]}),
    choice('지방관에게 자체 조달을 명하고 국고를 보전한다',{treasury:8,military:-8,morale:-14},'국고의 지출은 줄었지만 지방의 지휘와 군량 조달이 흔들립니다.',{territory:[...occupy([chungju]),mark(chungju,'군량과 연락 단절')]})
   ]),
  scene('prepared_pass','1592년 봄 · 준비가 연 분기','며칠의 여유','유성룡',
   '전쟁 전에 쌓아 둔 군량과 파발망 덕분에 흩어진 부대가 길목에 다시 모였습니다. 침략군을 완전히 저지하지는 못했지만, 조정은 피난과 민간인 대피를 정리할 며칠을 얻었습니다. 준비의 성과를 어디에 쓰시겠습니까?',
   'court_1592',[
    choice('백성과 관청 문서를 먼저 피난시킨다',{treasury:-2,military:5,morale:4},'군사적 승리 대신 피난의 질서와 기록을 지켰습니다. 이제 왕실의 행선지를 결정합니다.',{territory:[...clear([chungju]),mark(chungju,'지연전 · 피난 시간 확보')]}),
    choice('예비 병력을 보존하며 조정을 먼저 이동시킨다',{treasury:5,military:4,morale:-4},'예비 병력과 국고는 지켰으나 피난길의 혼란이 백성에게 남았습니다.',{territory:clear([chungju])})
   ],{when:[flag('prepared'),flag('mobile_defense')]}),
  scene('court_1592','1592년 여름','왕은 어디에 있어야 하는가','광해군 · 이항복',
   '한성을 지킬 전선이 흔들립니다. 왕이 머무는 곳에 조정의 명령과 군량이 따라가지만, 모두가 왕을 따라 북쪽으로 가면 지방은 누가 수습합니까? 이항복은 왕실의 안전을, 세자 광해군은 남아 있는 백성과 병사를 모을 별도의 조정을 생각합니다.',
   'palace_crisis',[
    choice('의주로 이동하고 광해군에게 분조를 맡긴다',{treasury:-4,military:3,morale:-5,diplomacy:8},'왕은 북쪽에서 명의 원군을 청하고, 세자는 지방의 모병과 군량 확보를 맡습니다. 한성과 평양의 일본군 점령은 지도에 빗금으로 남습니다.',{historical:true,setFlags:{local_command:true},territory:[...occupy([seoul,pyongyang]),mark(uiju,'의주 · 조선 국왕의 조정')]}),
    choice('한성에 남아 근왕군이 모일 때까지 버틴다',{treasury:-4,military:-15,morale:-12},'왕이 남았다는 소식과 함께 일본군이 도성 가까이 왔다는 장계가 올라옵니다. 항복 또는 뒤늦은 탈출을 결정해야 합니다.',{next:'palace_crisis',territory:occupy([seoul])}),
    choice('명의 보호에 왕실을 맡기려 하며 국경 이동을 준비한다',{treasury:5,military:-5,morale:-20,diplomacy:10},'왕실의 월경은 상대의 허락이 필요한 일입니다. 명의 보호를 기다리는 동안 지방 수습은 뒤로 밀립니다. 이 선택은 역사와 다른 가정입니다.',{next:'navy_1592',territory:[...occupy([seoul,pyongyang]),mark(uiju,'왕실의 월경 허가 요청')]})
   ]),
  scene('palace_crisis','1592년 여름 · 왕실 위기','도성으로 다가오는 군대','이항복',
   '늦은 피난은 더 큰 대가를 부릅니다. 근왕군의 도착은 확실하지 않고, 왕실을 포로로 잡으려는 일본군이 길을 좁혀 옵니다. 이 장면은 국왕이 한성에 남았을 때의 가상 분기입니다.',
   'navy_1592',[
    choice('호위 병력을 소모해 북쪽으로 탈출한다',{military:-10,morale:-8,treasury:-4},'왕실은 빠져나왔지만 지방 수습을 맡길 여유를 잃었습니다.',{territory:[...occupy([seoul,pyongyang]),mark(uiju,'뒤늦게 도착한 피난 조정')]}),
    choice('왕실의 안전을 조건으로 항복한다',{morale:-35,military:-30,diplomacy:-25},'조선의 왕권이 무너졌습니다. 일본의 여러 다이묘가 한반도의 통치를 분담합니다. 이것은 가상의 완전 패배 결말입니다.',{next:'END',setFlags:{japan_rule:true},territory:own(korea,'jpn')})
   ],{when:[flag('local_command',false)]}),
  scene('navy_1592','1592년 여름–가을','바다와 들판의 군량','이순신 · 곽재우 · 휴정',
   '전라좌수사 이순신의 함대가 해전의 성과를 보내옵니다. 육지에서는 곽재우의 의병과 휴정의 승병도 움직입니다. 하지만 병선도 의병도 밥을 먹어야 싸울 수 있습니다. 조정이 무엇을 지원하느냐에 따라 전쟁은 한성의 함락만으로 끝나지 않을 수 있습니다.',
   'ming_1593',[
    choice('수군과 의병에 군량을 나누고 현지 지휘를 존중한다',{treasury:-10,military:12,morale:8},'함대는 남해를, 의병은 육상의 보급로를 압박합니다. 일본군의 진격 속도와 별개로 항전의 기반을 남겼습니다.',{historical:true,setFlags:{fleet_ready:true,relief:true},territory:[mark(yeosu,'전라좌수영 · 수군 지원'),mark(tongyeong,'한산도 방면 · 해상 보급로 견제'),mark(jinju,'진주 · 관군과 의병의 방어')]}),
    choice('국고를 아끼고 명의 원군 요청에 역량을 집중한다',{treasury:6,diplomacy:10,military:-5},'외교 통로를 넓혔지만 현지 군대는 부족한 군량으로 버텨야 합니다.',{territory:[mark(uiju,'원군 청원에 집중')]}),
    choice('수군의 인력과 군량을 육상 방어로 돌린다',{treasury:8,military:-15,morale:-5},'당장의 병력은 모았지만 함대의 작전 능력이 줄었습니다. 높은 군사 수치만으로 해상 원정을 준비할 수는 없습니다.',{setFlags:{fleet_ready:false},territory:[mark(yeosu,'수군 인력과 군량 전용')]})
   ]),
  scene('ming_1593','1593년','원군을 부르는 값','이여송 · 유성룡',
   '명의 이여송이 대규모 병력을 이끌고 왔습니다. 평양을 되찾을 기회가 생겼지만, 원군의 군량과 말의 먹이도 조선의 논밭과 길에서 나옵니다. 구원을 받는 것과 전쟁의 목적을 함께 정하는 것은 서로 다른 일입니다. 한성 수복까지 이어질 협력을 어떻게 만들겠습니까?',
   'talks_1593',[
    choice('보급을 부담하고 명군과 공동 작전을 벌인다',{treasury:-12,military:10,diplomacy:12},'조명 연합군의 반격과 일본군의 후퇴로 평양과 한성이 다시 조선의 통제에 들어옵니다. 다만 남부 해안의 일본군은 남았습니다.',{historical:true,territory:[...clear([pyongyang,seoul,chungju]),mark(pyongyang,'평양 수복 · 조명 연합 작전'),mark(seoul,'한성 수복')]}),
    choice('공동 작전에 참여하며 협상에도 조선의 사절을 요구한다',{treasury:-10,military:8,diplomacy:18},'전장의 협력에 더해 외교적 발언권을 확보하려 시도합니다. 수복은 공동 작전의 결과이며, 조선의 협상 참여까지 보장된 실제 역사라는 뜻은 아닙니다.',{setFlags:{voice:true},territory:[...clear([pyongyang,seoul,chungju]),mark(liaodong,'조선 사절의 협의 통로'),mark(pyongyang,'평양 수복 · 공동 작전')]}),
    choice('원군 의존을 줄이고 자체 병력으로 수복에 나선다',{treasury:8,military:-8,diplomacy:-15,morale:4},'충분히 준비한 병력으로 수복에 나섰습니다. 명과의 관계는 손상되지만 조선군의 지휘권을 유지합니다. 이 작전은 가상 분기입니다.',{when:[stat('military','gte',65)],territory:[...clear([pyongyang,seoul,chungju]),mark(pyongyang,'조선군 독자 수복 · 가상 분기')]})
   ]),
  scene('talks_1593','1593–1594년','조선 없는 강화는 가능한가','심유경 · 고니시 유키나가',
   '심유경과 고니시 유키나가가 강화교섭을 이어갑니다. 명은 철수와 책봉으로 전쟁을 끝내려 하고, 도요토미 히데요시는 영토와 왕자 인질 등을 요구합니다. 조선이 목소리를 내려 해도 두 강국의 결정을 바꾸기는 쉽지 않습니다. 일본군은 여전히 남부 해안에 있습니다.',
   'rebuild_1594',[
    choice('할양과 인질에 반대하며 전면 철수를 요구한다',{treasury:-3,diplomacy:7,morale:4},'조선은 자국의 배제를 인정하지 않습니다. 양측의 큰 입장 차는 좁혀지지 않고, 조선은 이어질 몇 해 동안 재침을 대비할 기회를 얻습니다.',{historical:true,setFlags:{voice:true},territory:[mark(busan,'철수 요구 · 일본군 잔류')]}),
    choice('명의 교섭에 맡기고 당장의 전쟁 비용을 줄인다',{treasury:8,diplomacy:-10,morale:-4},'조선이 교섭에서 물러나자 명·일 사이에 새로운 제안이 오갑니다. 다음 장면은 실제로 체결되지 않은 분할 협약을 가정합니다.',{setFlags:{voice:false},next:'excluded_talks'}),
    choice('조선도 일본의 요구를 받아들이는 전면 타협을 청한다',{treasury:15,morale:-20,diplomacy:-10},'명의 조정까지 할지·왕자 인질 등 일본 측 요구의 수용으로 돌아섰다는 가정입니다. 이는 실제의 책봉 교섭과 다른 대체역사입니다.',{next:'END',setFlags:{full_terms:true},territory:[...own(southFour,'jpn'),mark(seoul,'조선 북부의 조정 · 일본 요구 수락')]})
   ]),
  scene('excluded_talks','1594년 · 가상 교섭','남쪽 두 도의 값','심유경 · 고니시 유키나가',
   '조선의 반대가 약해지자, 명과 일본의 교섭자들이 남쪽 두 도를 일본의 지배 아래 두는 타협안을 올립니다. 경상도와 전라도를 잃으면 조선은 곡창과 수군 기반을 함께 잃습니다. 이 협약은 실제로 체결된 역사가 아니라, 조선을 배제한 협상이 끝까지 진행되었다는 가정입니다.',
   'rebuild_1594',[
    choice('늦었더라도 거부하고 다시 전쟁 준비를 한다',{treasury:-5,diplomacy:-6,morale:6},'할양은 막았지만 외교적 마찰과 재침의 부담은 조선에 남았습니다.',{setFlags:{voice:true}}),
    choice('북부의 왕통을 남기는 조건으로 협약을 묵인한다',{treasury:12,morale:-22,military:-15},'명·일의 협약 아래 남부 두 도가 일본의 통치에 들어갑니다. 남은 조선은 훨씬 좁은 국토에서 살아남아야 합니다.',{next:'END',setFlags:{partition:true},territory:own(southTwo,'jpn')})
   ]),
  scene('rebuild_1594','1594–1596년 · 교섭기의 내정','군대만 다시 세울 것인가','유성룡',
   '협상이 이어지는 동안 유성룡은 군제와 군량 조달을 정비하자고 아룁니다. 훈련도감과 지방의 군사 편제를 손보아도, 돌아갈 논밭을 잃은 백성은 병사와 세금의 원천이 될 수 없습니다. 남부 해안의 왜성이 사라지지 않은 채 몇 해가 흘러갑니다.',
   'strategy_1596',[
    choice('군사 훈련과 피란민 구휼을 함께 시행한다',{treasury:-6,military:10,morale:12},'군대를 다시 훈련하고 백성이 돌아올 기반을 마련합니다. 전쟁의 피해를 모두 되돌릴 수는 없습니다.',{historical:true,territory:[mark(seoul,'훈련도감 · 군사 재편'),mark(jinju,'피란민 구휼과 귀농 지원')]}),
    choice('둔전과 수운을 복구해 장기 군량과 세입을 만든다',{treasury:18,military:2,morale:3},'즉각적인 대군 증강보다 농지와 수송망을 복구했습니다. 이 보급 기반은 이후의 해상 원정에도 필요합니다.',{setFlags:{logistics:true},territory:[mark(mokpo,'둔전·수운 복구'),mark(yeosu,'해상 군량 수송망')]}),
    choice('강제 징발을 늘려 국고와 병력을 먼저 채운다',{treasury:25,military:5,morale:-20},'군량과 은은 모였지만 백성이 견딜 수 있는 한계를 시험합니다. 낮은 민심은 돌발 청원과 군역 이탈로 돌아올 수 있습니다.',{territory:[mark(jinju,'과중한 군량 징발')]})
   ]),
  scene('strategy_1596','1596년 말','끝나지 않은 전쟁','권율 · 유성룡',
   '명 책봉사를 수행한 황신이 일본에서 돌아옵니다. 책봉 교섭으로 평화가 오리라는 기대가 무너집니다. 권율은 성과 군량을 점검하고, 유성룡은 또다시 나라를 비울 피난이 없도록 준비하자고 합니다. 조선이 지켜야 할 것은 어디까지입니까?',
   'command_1597',[
    choice('육지의 방어와 남해 수군의 공조에 집중한다',{treasury:-4,military:8,morale:2},'다시 올 침략을 막는 것을 우선으로 삼았습니다.',{historical:true}),
    choice('방어를 준비하며 전후 대마도 원정도 구상한다',{treasury:-5,military:5},'원정은 아직 계획일 뿐입니다. 수운 복구, 함대 보전, 충분한 재정과 외교력이 모두 있어야 마지막에 실행 선택지가 열립니다.',{when:[flag('fleet_ready'),stat('military','gte',65)],setFlags:{counter_plan:true},territory:[mark(tsushima,'전후 원정 검토 · 아직 일본의 지배')]}),
    choice('성곽 공사를 줄이고 전쟁 이후의 복구비를 남긴다',{treasury:10,military:-5,morale:5},'남은 백성과 재정을 우선했습니다. 재침을 막는 데 쓸 여력은 줄어듭니다.')
   ]),
  scene('command_1597','1597년','믿을 장계, 지킬 함대','이순신 · 원균',
   '적의 상륙 정보와 출전 명령을 둘러싸고 조정의 의심이 커집니다. 실제 역사에서 이순신은 파직되었고, 원균이 지휘한 함대는 칠천량에서 큰 피해를 입었습니다. {name} 전하가 지휘권을 어떻게 다루느냐에 따라 이번에는 다른 바다가 남을 수도 있습니다.',
   'naval_recovery',[
    choice('정보를 재확인하고 이순신에게 작전 재량을 준다',{treasury:-4,military:6,morale:2},'파직을 피한 함대가 전력을 유지합니다. 이것은 실제 역사와 달라지는 큰 분기입니다.',{setFlags:{fleet_ready:true,fleet_kept:true,late_war:true},territory:[...occupy(southCoast),mark(yeosu,'함대 보전 · 지휘관 재량 유지')]}),
    choice('이순신을 파직한다. 패전 뒤 다시 불러들인다',{treasury:-12,military:-20,morale:-10},'칠천량의 패전 뒤 남은 배와 병사를 모아야 합니다. 이제 이순신을 복귀시켜 수군을 다시 세울 차례입니다.',{historical:true,setFlags:{fleet_ready:false,fleet_lost:true,late_war:true},territory:[...occupy(southCoast),mark(yeosu,'칠천량 이후 · 함대 재건 필요')]}),
    choice('지휘관을 바꾸고 확실하지 않은 정보로 강제 출전시킨다',{treasury:-4,military:-28,morale:-14},'작전의 조건을 확인하지 않은 출전으로 함대가 큰 피해를 입었습니다.',{setFlags:{fleet_ready:false,fleet_lost:true,late_war:true},territory:[...occupy(southCoast),mark(yeosu,'무리한 출전 · 함대 손실')]})
   ]),
  scene('naval_recovery','1597년 가을','남은 배를 모으다','이순신',
   '수군의 주력이 무너져도 바다를 포기하면 남부의 군량 수송까지 끊어집니다. 복귀한 이순신은 남은 전선과 병사를 모읍니다. 명량의 좁은 물길은 기회이지만, 왕의 명령 한 줄만으로 배와 군량이 생기지는 않습니다.',
   'late_war_1598',[
    choice('잔존 함대에 병력과 군량을 모아 명량에서 맞선다',{treasury:-6,military:14,morale:8},'명량의 승리로 해상의 항전이 이어집니다. 그러나 잃어버린 함대와 시간은 곧바로 복구되지 않아 해외 원정의 조건은 충족하지 못합니다.',{historical:true,setFlags:{fleet_ready:true},territory:[mark(mokpo,'명량 방면 · 해상 방어 회복')]}),
    choice('수군의 남은 자원을 육지로 돌리고 바다를 비운다',{treasury:6,military:-8,morale:-8},'육지의 지출을 줄인 대신 남해의 주도권을 포기했습니다. 종전의 조건은 외교에 더 크게 달렸습니다.',{setFlags:{fleet_ready:false},territory:[mark(mokpo,'수군 해산 · 해상 보급 위기')]})
   ],{when:[flag('fleet_lost')]}),
  scene('late_war_1598','1597년 겨울–1598년','왜성을 무너뜨리는 비용','권율 · 진린 · 유성룡',
   '명군이 다시 증원되고, 진린의 수군도 조선 수군과 협력합니다. 일본군은 울산·사천·순천 등의 왜성에 버팁니다. 성 하나를 공격하는 데도 식량과 인명이 들어갑니다. 적을 몰아내려는 뜻과 백성이 더는 버티기 어렵다는 보고가 한꺼번에 올라옵니다.',
   'withdrawal_1598',[
    choice('조명 연합군의 공세로 해안 거점들을 압박한다',{treasury:-10,military:-6,diplomacy:5,morale:-6},'왜성을 둘러싼 공방은 길어집니다. 공동 공세는 이어지지만 그 대가 역시 쌓입니다.',{historical:true,territory:[mark(jinju,'사천 방면 공세 · 조명 연합 작전')]}),
    choice('봉쇄와 방어를 유지하며 경작지부터 회복한다',{treasury:10,military:3,morale:5,diplomacy:3},'공격 속도를 줄이는 대신 보급과 민생을 회복했습니다. 일본의 철군까지 성립해야 전쟁은 끝납니다.',{territory:[mark(jinju,'방어·봉쇄와 경작지 회복')]}),
    choice('남부 두 도를 포기하는 가상 종전안을 받아들인다',{treasury:10,morale:-25,military:-10},'전쟁을 멈추는 대가로 조선의 곡창과 해안을 넘깁니다. 명·일의 분할 협약이 현실이 되는 가상 결말입니다.',{next:'END',setFlags:{partition:true},territory:own(southTwo,'jpn')})
   ]),
  scene('withdrawal_1598','1598년 가을–겨울','돌아가는 배, 남겨질 나라','이순신 · 진린 · 유성룡',
   '도요토미 히데요시가 죽고 일본군에 철수 명령이 내려졌습니다. 그러나 바다의 길은 아직 막혀 있고, 포로와 군량, 적의 안전한 철수를 둘러싼 교섭도 이어집니다. {name} 전하, 마지막 전투의 승리와 전쟁 뒤의 조선 가운데 무엇을 남기시겠습니까?',
   'END',[
    choice('노량에서 철수 함대를 막고 끝까지 싸운다',{treasury:-7,military:-7,morale:-5},'노량의 전투 뒤 일본군은 한반도에서 철수합니다. 그러나 이순신도 돌아오지 못했습니다. 왕조는 살아남았고, 백성과 나라에 남은 피해를 헤아려야 합니다.',{historical:true,setFlags:{war_won:true},territory:[...victoryMap,mark(tongyeong,'노량해전 · 이순신 전사')]}),
    choice('철수와 포로 송환을 교섭하고 국내 복구를 우선한다',{treasury:5,diplomacy:5,morale:8},'조선도 참여한 교섭을 통해 철수가 이루어졌다는 대체 경로입니다. 지도에서 점령 빗금이 지워지고, 남은 국력에 따라 전후의 모습이 갈립니다.',{setFlags:{war_won:true},territory:victoryMap}),
    choice('철수 이후를 대비한 대마도 원정 회의를 연다',{},'함대·수운·원정 준비와 충분한 국력이 함께 갖추어졌습니다. 일본군 철수 뒤, 역사에 없던 다음 시대의 결정을 논의합니다.',{next:'overseas_council',when:[flag('counter_plan'),flag('logistics'),flag('fleet_ready'),flag('fleet_kept'),stat('military','gte',80),stat('treasury','gte',35),stat('morale','gte',50),stat('diplomacy','gte',60)],setFlags:{war_won:true},territory:victoryMap})
   ]),
  scene('overseas_council','1599년 이후 · 극단적 대체역사','바다를 건넌 뒤의 책임','유성룡 · 이항복',
   '한반도를 되찾는 전쟁과 바다 건너의 땅을 통치하는 일은 다릅니다. 쓰시마의 소 요시토시와 교섭할 수도, 군사 거점을 둘 수도 있습니다. 규슈까지 지배하려면 수년에 걸친 원정과 일본 내부의 분열, 지속적인 보급이 더 필요합니다. 다음 선택은 그런 조건까지 성립했다는 과감한 가정 아래의 후일담입니다.',
   'END',[
    choice('대마도 무장해제와 교역 협정으로 바다를 안정시킨다',{treasury:-8,military:-3,diplomacy:8,morale:4},'대마도를 병합하지 않고 교역과 무장해제의 약속을 얻었습니다. 조선은 전쟁 전보다 강한 해상 발언권을 갖습니다.',{territory:[{prov:tsushima.id,influence:'kor',marker:'무장해제·교역 협정 · 가상'}]}),
    choice('여러 해의 원정을 감수하고 대마도와 규슈 지배를 추진한다',{treasury:-32,military:-18,morale:-15,diplomacy:-20},'규슈의 분열 세력과 협약하고 수년에 걸친 원정 끝에 지배권을 확립했다는 가상 후일담입니다. 대마도와 규슈의 색이 바뀌지만 점령지의 반발과 보급 부담은 새 시대의 과제로 남습니다.',{setFlags:{ascension:true},territory:[...own([tsushima,...kyushu],'kor'),mark(tsushima,'조선의 대마도 거점 · 가상'),mark(fukuoka,'규슈 지배 · 수년에 걸친 가상 원정')]}),
    choice('원정을 취소하고 백성이 돌아갈 땅을 복구한다',{treasury:5,morale:10},'군사적 우위를 국경 밖의 영토보다 전후의 회복에 사용했습니다.')
   ]),
  scene('refugee_petition','돌발 · 가상 사건','피란민의 빈 솥','지방관의 장계',
   '굶주린 피란민이 관아 앞에 모였습니다. 전쟁을 이기려는 왕의 뜻과 당장 살아야 하는 백성의 형편이 부딪힙니다. 민심이 45 이하일 때 일반 선택 후 35% 확률로 한 번 발생하는 가상 사건입니다. 대응 뒤에는 원래 진행하던 장면으로 돌아갑니다.',
   'RETURN',[
    choice('군량 일부를 풀고 지방관의 징발을 조사한다',{treasury:-7,morale:13},'구휼로 민심을 회복했으나 군량 부담이 늘었습니다.',{territory:[mark(jinju,'피란민 구휼 · 돌발 사건')]}),
    choice('의병과 고을이 함께 분배하도록 맡긴다',{military:-4,morale:7},'군의 몫 일부를 백성에게 나누고 지방에서 구휼을 이어갑니다.'),
    choice('집회를 해산하고 군량 징발을 계속한다',{treasury:5,morale:-9,military:-2},'군량은 지켰지만 도망하는 백성과 군졸이 늘었습니다.')
   ]),
  scene('grain_delay','돌발 · 가상 사건','진창에 멈춘 군량','수송 담당 관리',
   '군량을 실은 수레가 진창에 멈췄습니다. 빈 국고 때문에 운송 인부도 떠나려 합니다. 재정이 25 이하일 때 일반 선택 후 30% 확률로 한 번 발생합니다. 실제 특정 장계나 역사적 발생 확률을 재현한 사건은 아닙니다.',
   'RETURN',[
    choice('은을 더 내어 운송 인부와 가축을 확보한다',{treasury:-6,military:4},'추가 지출로 운송을 재개했습니다.'),
    choice('병력을 수송 호위와 복구에 돌린다',{military:-4,morale:2},'군의 작전 여력 일부로 수송로를 살렸습니다.'),
    choice('군량을 현지에서 다시 징발한다',{treasury:4,morale:-9},'국고는 아꼈지만 백성에게 비용을 전가했습니다.')
   ]),
  scene('desertion','돌발 · 가상 사건','돌아오지 않은 군역','지방 군관',
   '오랜 징발에 지친 군졸들이 고향으로 달아났습니다. 가족이 굶는다는 소문이 병영을 흔듭니다. 1597년 이후 민심이 35 이하이면 일반 선택 후 40% 확률로 한 번 발생합니다.',
   'RETURN',[
    choice('가족을 구휼하고 복귀 기한을 주어 병사를 모은다',{treasury:-6,morale:10,military:3},'군역의 원인을 함께 살피며 병사를 다시 모읍니다.'),
    choice('추가 징집으로 빈자리를 메운다',{military:5,morale:-10},'장부의 병력은 늘었지만 백성의 원망도 깊어집니다.')
   ])
 ],
 randomEvents:[
  {id:'refugees',title:'낮은 민심 · 피란민 청원',eventId:'refugee_petition',chance:35,priority:30,once:true,cooldown:0,when:[...wartime,stat('morale','lte',45)]},
  {id:'grain',title:'낮은 재정 · 군량 수송 차질',eventId:'grain_delay',chance:30,priority:20,once:true,cooldown:0,when:[...wartime,stat('treasury','lte',25)]},
  {id:'deserters',title:'장기전 · 군역 이탈',eventId:'desertion',chance:40,priority:40,once:true,cooldown:0,when:[...wartime,flag('late_war'),stat('morale','lte',35)]}
 ],
 endings:[
  {id:'japan_victory',title:'일본의 완전한 승리',kind:'bad',priority:100,immediate:false,when:[flag('japan_rule')],body:'조선은 패배했습니다. {name}의 왕실은 항복했고, 당신은 망국의 군주로 남았습니다. 일본의 여러 다이묘가 조선의 고을을 나누어 통치합니다. 지도에 남은 붉은색은 일시적 점령이 아니라 왕조가 무너진 뒤의 지배권입니다. 이 결말은 역사에 없었던 가정입니다.'},
  {id:'full_terms',title:'대명일본화평조건의 수락',kind:'bad',priority:95,immediate:false,when:[flag('full_terms')],body:'명은 도요토미 측의 요구를 전면 수용하는 쪽으로 돌아섰습니다. 조선 남부의 할양과 왕자 인질 등이 평화의 조건이 되었습니다. 전쟁은 멈추었으나 그 평화의 값은 조선이 치릅니다. 실제 역사에서 성립하지 않은 협정이며, 지도에는 남부 네 도에 해당하는 범위를 단순화해 표시했습니다.'},
  {id:'partition',title:'명과 일본의 협약',kind:'bad',priority:90,immediate:false,when:[flag('partition')],body:'조선을 배제한 두 나라의 타협으로 경상도와 전라도가 일본의 지배에 들어갑니다. {name}의 조정은 북쪽에 남았지만 곡창과 남해의 군사 기반을 잃었습니다. 살아남은 왕조가 잃어버린 백성을 다시 돌아볼 수 있을지는 이제 다음 시대의 문제입니다. 남부 두 도의 분할은 가상 역사이며 현대 지역 도형으로 근사했습니다.'},
  {id:'ascension',title:'조선의 승천',kind:'good',priority:85,immediate:false,when:[flag('ascension')],body:'조선은 침략을 물리친 뒤 바다를 건넜습니다. 보전한 함대와 군량 수송망, 일본 내부의 분열을 바탕으로 수년에 걸친 원정 끝에 대마도와 규슈 일대의 지배권까지 세웠습니다. {name}의 나라는 동아시아의 새로운 해상 세력이 됩니다. 그러나 해외 영토의 보급과 통치 비용은 끝나지 않았습니다. 이 결말은 게임을 위한 극단적인 대체역사이며 현실에서 일어나지 않았습니다.'},
  {id:'recovery',title:'다시 일어서는 조선',kind:'good',priority:50,immediate:false,when:[flag('war_won'),stat('treasury','gte',30),stat('morale','gte',55)],body:'일본군은 물러갔고 조선은 나라를 지켰습니다. 피해가 사라진 것은 아니지만, 백성을 돌볼 재정과 돌아올 고을의 신뢰가 남았습니다. {name}의 승리는 국경을 넓힌 데 있지 않습니다. 다음 해에도 농사를 짓고 왕조가 책임을 이어갈 기반을 남긴 데 있습니다.'},
  {id:'pyrrhic',title:'피로스의 승리',kind:'mixed',priority:0,immediate:false,when:[],body:'조선은 간신히 승리했습니다. 일본군은 떠났지만 비어 버린 국고와 훼손된 마을, 돌아오지 못한 사람들은 승전 소식만으로 되살아나지 않습니다. {name}은 나라를 지켰습니다. 그러나 잃은 것이 너무나도 많습니다. 이제부터의 통치가 승리의 의미를 다시 정할 것입니다.'}
 ],defaultEnding:'pyrrhic'
};
// V2.2: the story selects a cropped East Asian map and its era as a unit.
// Historical defaults live in the template. The manuscript stores only its edits.
scenario.id='imjin_crossroads_regional_v22';
scenario.subtitle='1591–1598 · 동아시아 1592년 기본안 · 조선의 국왕이 되어 선택하세요';
scenario.description='실존 인물과 전쟁의 큰 흐름을 바탕으로 한 약 10분 분량의 대체역사 예제입니다. 수치·확률·대사·인과관계는 게임용 창작입니다. 동아시아 범위와 1592년 무렵의 시대 기본안을 사용하며, 지도의 소유국은 현대 행정구역 위에 근사한 편집용 초안입니다. 기본안과 선택에 따른 점령·할양·해외 원정의 경계는 실제 역사적 경계와 다릅니다. 편집기의 지도·초기 영토에서 지역과 시대를 고르고 직접 수정할 수 있습니다.';
scenario.map={templateId:'regional_eastasia_1592',playerCountry:'joseon',countries:[
 {id:'joseon',name:'조선',color:'#63886f'},{id:'japan',name:'도요토미 정권',color:'#bd7568'}
],initial:{owners:{},occupation:{},influence:{},markers:scenario.map.initial.markers}};
for(const event of scenario.events)for(const option of event.choices)for(const effect of option.territory||[])
 for(const field of ['to','occupation','influence'])if(effect[field]==='kor')effect[field]='joseon';else if(effect[field]==='jpn')effect[field]='japan';
const output=path.join(root,'examples/imjin-world.json');
fs.writeFileSync(output,JSON.stringify(scenario,null,2)+'\n','utf8');
console.log(JSON.stringify({output,events:scenario.events.length,randomEvents:scenario.randomEvents.length,endings:scenario.endings.length,koreanRegions:korea.length,southTwoApprox:southTwo.length,kyushuApprox:kyushu.length,bytes:fs.statSync(output).size},null,2));
