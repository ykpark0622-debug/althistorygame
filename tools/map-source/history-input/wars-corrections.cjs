'use strict';
// Build-time corrections to Cliopatria v0.2.1. Province geometry stays unchanged.
// The dates represented here are 1914-07-01 and 1939-08-01.
const fs = require('node:fs');
const path = require('node:path');
const refs = JSON.parse(fs.readFileSync(path.join(__dirname, 'wars-boundary-reference.geojson'), 'utf8')).features;
function ringContains(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function contains(geometry, x, y) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => ringContains(x, y, rings[0]) && !rings.slice(1).some(r => ringContains(x, y, r)));
}
const czech1938 = refs.find(f => f.properties.Name === 'Czechoslovakia').geometry;
const german1938 = refs.find(f => f.properties.Name === 'Nazi Germany').geometry;
const hungary1939 = refs.find(f => f.properties.Name === 'Hungarian Republic').geometry;
const aliases = {
  'Denmark-Norway': 'Kingdom of Denmark', 'Empire of Haiti': 'Republic of Haiti',
  'Kingdom of Monaco': 'Principality of Monaco', 'Argentine Confederation': 'Argentine Republic',
  'United Principalities of Moldavia and Wallachia': 'Kingdom of Romania',
  'First Hellenic Republic': 'Kingdom of Greece', 'Principality of Bulgaria': 'Kingdom of Bulgaria',
  'Kingdom of Great Britain': 'United Kingdom', 'Serbs': 'Kingdom of Serbia',
  'Hungarian Republic': 'Kingdom of Hungary', 'Kingdom of Lithuania': 'Republic of Lithuania',
  'Great Mongol State': 'Bogd Khanate of Mongolia', '(British Empire)': 'British Empire',
  '(French Third Republic)': 'French Third Republic', '(Netherlands)': 'Netherlands',
  '(Spanish Empire)': 'Kingdom of Spain', 'North Yemen': 'Mutawakkilite Kingdom of Yemen',
  'Estado Novo': 'Portuguese Republic', 'Éire': 'Ireland'
};
const fallback = {
  atg:'British Leeward Islands', bhs:'British Bahamas', bra:'Brazilian Republic', chl:'Republic of Chile',
  chn:'Republic of China', col:'Republic of Colombia', cpv:'Portuguese Cape Verde', dnk:'Kingdom of Denmark',
  esp:'Kingdom of Spain', fji:'British Fiji', gbr:'United Kingdom', gnb:'Portuguese Guinea',
  gnq:'Spanish Guinea', grc:'Kingdom of Greece', grd:'British Windward Islands', grl:'Greenland',
  hnd:'Honduras', idn:'Dutch East Indies', ind:'British Raj', jpn:'Empire of Japan',
  ken:'British East Africa', kna:'British Leeward Islands', kor:'Empire of Japan', prk:'Empire of Japan',
  kwt:'Sheikhdom of Kuwait', mco:'Principality of Monaco', mdv:'Sultanate of the Maldives',
  mex:'United Mexican States', mlt:'British Malta', mus:'British Mauritius', mwi:'Nyasaland',
  mys:'British Malaya', asm:'United States of America', blm:'French West Indies',
  cok:'New Zealand', cym:'British Cayman Islands', ggy:'United Kingdom', gib:'British Gibraltar',
  hmd:'British Colonial Empire', iot:'British Mauritius', jey:'United Kingdom', msr:'British Leeward Islands',
  nfk:'Commonwealth of Australia', niu:'New Zealand', pcn:'British Pitcairn Islands',
  pyf:'French Oceania', shn:'British Saint Helena', tca:'British Turks and Caicos Islands',
  umi:'United States of America', vgb:'British Leeward Islands', wlf:'French Wallis and Futuna',
  nic:'Republic of Nicaragua', nld:'Netherlands', nor:'Kingdom of Norway', nzl:'New Zealand',
  prt:'Portuguese Republic', sgp:'Straits Settlements', slb:'British Solomon Islands',
  slv:'Republic of El Salvador', stp:'Portuguese Sao Tome and Principe', swe:'Kingdom of Sweden',
  syc:'British Seychelles', tls:'Portuguese Timor', ton:'Kingdom of Tonga', tun:'French Protectorate of Tunisia',
  uga:'Uganda Protectorate', usa:'United States of America', vct:'British Windward Islands',
  ven:'Venezuela', vnm:'French Indochina', vut:'New Hebrides', aus:'Commonwealth of Australia'
};
const britishAfrica = {
  gha:'British Gold Coast', nga:'Colony and Protectorate of Nigeria', sle:'British Sierra Leone',
  gmb:'British Gambia', ken:'British East Africa', uga:'Uganda Protectorate', mwi:'Nyasaland',
  zmb:'Northern Rhodesia', zwe:'Southern Rhodesia', bwa:'Bechuanaland Protectorate',
  lso:'Basutoland', swz:'Swaziland Protectorate', sdn:'Anglo-Egyptian Sudan', ssd:'Anglo-Egyptian Sudan'
};
const westFrench = new Set(['mli','ner','sen','gin','civ','bfa','ben','mrt']);
const equatorialFrench = new Set(['tcd','caf','cog','gab']);
const names = {
  'Kingdom of Denmark':'덴마크 왕국', 'Principality of Monaco':'모나코 공국', 'Republic of Lithuania':'리투아니아 공화국',
  'British Leeward Islands':'영국령 리워드 제도', 'British Bahamas':'영국령 바하마',
  'Portuguese Cape Verde':'포르투갈령 카보베르데', 'British Fiji':'영국령 피지',
  'Portuguese Guinea':'포르투갈령 기니', 'Spanish Guinea':'스페인령 기니',
  'British Windward Islands':'영국령 윈드워드 제도', 'Sheikhdom of Kuwait':'쿠웨이트 셰이크국',
  'Sultanate of the Maldives':'몰디브 술탄국', 'British Malta':'영국령 몰타',
  'British Mauritius':'영국령 모리셔스', 'Nyasaland':'냐살랜드 보호령',
  'British Cayman Islands':'영국령 케이맨 제도', 'British Gibraltar':'영국령 지브롤터',
  'British Pitcairn Islands':'영국령 핏케언 제도', 'French Oceania':'프랑스령 오세아니아',
  'British Saint Helena':'영국령 세인트헬레나', 'British Turks and Caicos Islands':'영국령 터크스 케이커스 제도',
  'French Wallis and Futuna':'프랑스 보호령 왈리스 푸투나', 'Straits Settlements':'해협식민지',
  'British Solomon Islands':'영국령 솔로몬 제도', 'Portuguese Sao Tome and Principe':'포르투갈령 상투메 프린시페',
  'British Seychelles':'영국령 세이셸', 'Portuguese Timor':'포르투갈령 티모르',
  'Kingdom of Tonga':'통가 왕국', 'French Protectorate of Tunisia':'프랑스 보호령 튀니지',
  'Uganda Protectorate':'우간다 보호령', 'French West Indies':'프랑스령 서인도',
  'Colony and Protectorate of Nigeria':'나이지리아 식민지·보호령', 'British Sierra Leone':'영국령 시에라리온',
  'British Gambia':'영국령 감비아', 'Northern Rhodesia':'북로디지아 보호령',
  'Southern Rhodesia':'남로디지아', 'Bechuanaland Protectorate':'베추아날랜드 보호령',
  'Basutoland':'바수톨란드 보호령', 'Swaziland Protectorate':'스와질란드 보호령',
  'French Algeria':'프랑스령 알제리', 'French Protectorate of Morocco':'프랑스 보호령 모로코',
  'British Burma':'영국령 버마', 'British Somaliland':'영국령 소말릴란드',
  'German East Africa':'독일령 동아프리카', 'German South West Africa':'독일령 남서아프리카',
  'German Cameroon':'독일령 카메룬', 'German Togoland':'독일령 토고',
  'German Pacific Protectorates':'독일령 태평양 보호령', 'South Seas Mandate':'일본의 남양군도 위임통치령',
  'Anglo-Australian-New Zealand Nauru Mandate':'영국·호주·뉴질랜드 위임통치 나우루',
  'Territory of Papua':'오스트레일리아령 파푸아', 'Territory of New Guinea':'오스트레일리아 위임통치 뉴기니',
  'New Zealand Mandate of Western Samoa':'뉴질랜드 위임통치 서사모아',
  'Gilbert and Ellice Islands':'영국령 길버트·엘리스 제도', 'Danish West Indies':'덴마크령 서인도 제도',
  'Newfoundland (Commission Government)':'뉴펀들랜드 · 영국 위원회 통치',
  'Slovak Republic':'슬로바키아 공화국', 'Protectorate of Bohemia and Moravia':'보헤미아·모라비아 보호령',
  'Idrisid Emirate of Asir':'이드리스조 아시르 토후국', 'Kamaran under British administration':'영국 관리하 카마란섬',
  'Chinese Communist Party base areas':'중국 공산당 근거지', 'Mongol League Autonomous Government':'몽골연맹자치정부',
  'Moroccan Sultanate (Tangier special zone)':'모로코 술탄국 · 탕헤르 특별구역',
  'Xinjiang Provincial Government (Sheng Shicai)':'신장성 정부 · 성스차이'
};
function result(name, influence, occupation, note) {
  const out = {name};
  if(influence)out.influence=influence;
  if(occupation)out.occupation=occupation;
  if(note)out.note=note;
  return out;
}
function colonialInfluence(name) {
  if (/^British |^Straits Settlements$|^Nyasaland$|Rhodesia|^Bechuanaland|^Basutoland|^Swaziland|^Uganda Protectorate$|^Gilbert and Ellice/.test(name))return 'United Kingdom';
  if (/^French /.test(name)&&name!=='French Third Republic')return 'French Third Republic';
  if (/^Portuguese /.test(name)&&name!=='Portuguese Republic')return 'Portuguese Republic';
  if (/^Dutch /.test(name))return 'Netherlands';
  if (/^Spanish /.test(name))return 'Kingdom of Spain';
  if (/^German /.test(name)&&name!=='German Empire')return 'German Empire';
  return undefined;
}
function corrections(input) {
  const year = +input.year, x = +input.lon, y = +input.lat;
  if(year!==1914&&year!==1939)return null;
  const iso = String(input.modernOwner||input.iso||'').toLowerCase();
  const raw = input.chosenName||input.name||'', missing = !raw||/자료 공백|unknown|unassigned/i.test(raw);
  let name=aliases[raw]||raw, influence;
  // Historical sovereign/administrative names are not inferred from modern borders
  // when an actual source polygon supplies a different historical frontier.
  if (iso==='kor'||iso==='prk')return result('Empire of Japan');
  if (iso==='twn') {
    const mainTaiwan=(x>=120&&y<25.65)||(x>119&&x<120&&y>23&&y<24.1);
    return mainTaiwan?result('Empire of Japan'):result('Republic of China',undefined,year===1939&&x<119?'Empire of Japan':undefined,'Taiwan outlying islands handled separately from annexed Taiwan and Penghu.');
  }
  if (year===1939) {
    if(iso==='aut')return result('Nazi Germany');
    if(iso==='cze') {
      if(contains(german1938,x,y))return result('Nazi Germany');
      return result('Protectorate of Bohemia and Moravia','Nazi Germany','Nazi Germany','Czech core separated from the1938 German annexations.');
    }
    if(iso==='svk') {
      // The original1939 source incorrectly paints Slovakia as Germany.
      // Most of the southern strip follows the1939 Hungarian reference polygon.
      // Bratislava is explicitly restored because the source overgeneralizes it.
      const bratislavaCore=x>16.98&&x<17.35&&y>48.08&&y<48.36;
      if(!bratislavaCore&&contains(hungary1939,x,y))return result('Kingdom of Hungary');
      return result('Slovak Republic','Nazi Germany');
    }
    if(iso==='alb')return result('Albanian Kingdom','Kingdom of Italy','Kingdom of Italy');
    if(iso==='eth')return result('Ethiopian Empire',undefined,'Kingdom of Italy','Italian occupation does not imply universal recognition of annexation.');
    if(iso==='irl')return result('Ireland');
    if(iso==='chn'&&(name==='Empire of Japan'||name==='Manchukuo')) {
      const kwantung=x>120&&x<122.5&&y<39.8&&y>38.3;
      if(kwantung)return result('Empire of Japan',undefined,undefined,'Japanese Kwantung leased territory, approximated to the fixed province grid.');
      if(y>=40&&x>=115.5)return result('Manchukuo','Empire of Japan');
      if(y>=40.3&&x<115.5)return result('Republic of China','Mongol League Autonomous Government','Empire of Japan');
      return result('Republic of China',undefined,'Empire of Japan','Military occupation overlay rather than annexation of China.');
    }
    if(iso==='chn'&&name==='Communist Party of China'&&x<96)return result('Republic of China','Xinjiang Provincial Government (Sheng Shicai)',undefined,'Cliopatria1939 mislabels Xinjiang as the Chinese Communist Party; corrected to ROC sovereignty and Sheng Shicai provincial administration.');
    if(iso==='chn'&&x>=108&&x<=110&&y>=36&&y<=38&&name==='Republic of China')return result('Republic of China','Chinese Communist Party base areas',undefined,'Approximate Yan an core influence area; no claim to reconstruct the entire Shaan Gan Ning border.');
    if(iso==='chn'&&name==='Communist Party of China')return result('Republic of China',undefined,undefined,'Unverified party-sovereignty source label removed.');
    if(iso==='mmr')return result('British Burma','United Kingdom');
    if(iso==='mys'&&/^British|^Kingdom of Great/.test(raw))return result('British Malaya','United Kingdom');
  }
  if (iso==='can') {
    const newfoundland=(x>-59&&y>46&&y<54)||(x>-64&&y>=52&&y<60.5);
    return newfoundland?result(year===1914?'Dominion of Newfoundland':'Newfoundland (Commission Government)','United Kingdom'):result('Dominion of Canada','United Kingdom');
  }
  if(iso==='aus') {
    // Christmas and Cocos Islands were still administered with Singapore.
    if(x>90&&x<110&&y>-15&&y<-8)return result('Straits Settlements','United Kingdom');
    return result('Commonwealth of Australia','United Kingdom');
  }
  if(iso==='nzl'||iso==='cok'||iso==='niu')return result('Dominion of New Zealand','United Kingdom');
  if(iso==='zaf')return result('Union of South Africa','United Kingdom');
  if(iso==='egy')return year===1914?result('Khedivate of Egypt','Ottoman Empire','United Kingdom'):result('Kingdom of Egypt','United Kingdom');
  if(iso==='grl')return result('Greenland','Kingdom of Denmark');
  if(iso==='dnk')return result('Kingdom of Denmark');
  if(iso==='isl')return year===1914?result('Kingdom of Denmark'):result('Kingdom of Iceland','Kingdom of Denmark');
  if(iso==='hti')return result('Republic of Haiti');
  if(year===1914&&name==='Tangier International Zone')return result('Moroccan Sultanate (Tangier special zone)',undefined,undefined,'The formal international statute dates from1923; the1912 special zone is not labelled as the later administration.');
  if(/^German Africa$/.test(name)) {
    if(y<-15)return result('German South West Africa','German Empire');
    if(x>20)return result('German East Africa','German Empire');
    if(x<5)return result('German Togoland','German Empire');
    return result('German Cameroon','German Empire');
  }
  if(/^British Africa$|^British Gold Coast$/.test(name)&&britishAfrica[iso])return result(britishAfrica[iso],'United Kingdom');
  if(name==='French Africa') {
    if(iso==='dza')return result('French Algeria','French Third Republic');
    if(iso==='tun')return result('French Protectorate of Tunisia','French Third Republic');
    if(iso==='mar')return result('French Protectorate of Morocco','French Third Republic');
    if(westFrench.has(iso))return result('French West Africa','French Third Republic');
    if(equatorialFrench.has(iso))return result('French Equatorial Africa','French Third Republic');
    return result(name,'French Third Republic');
  }
  if(name==='Italian Africa')return result(year===1939&&x>30?'Italian East Africa':name,'Kingdom of Italy');
  if(year===1914&&iso==='mex')return result('United Mexican States');
  if(missing) {
    name=fallback[iso];
    if(iso==='rus')name=year===1914?'Russian Empire':'Union of Soviet Socialist Republics';
    if(iso==='deu')name=year===1914?'German Empire':'Nazi Germany';
    if(iso==='est')name=year===1914?'Russian Empire':'Estonia';
    if(iso==='fin'||iso==='ala')name=year===1914?'Russian Empire':'Republic of Finland';
    if(iso==='hrv')name=year===1914?'Austria-Hungary':(x<14.6&&y>44.5?'Kingdom of Italy':'Kingdom of Yugoslavia');
    if(iso==='irq')name=year===1914?'Ottoman Empire':'Kingdom of Iraq';
    if(iso==='tha')name=year===1914?'Kingdom of Siam':'Kingdom of Thailand';
    if(iso==='tur')name=year===1914?'Ottoman Empire':'Republic of Turkey';
    if(iso==='phl')name=year===1914?'Philippine Islands':'Commonwealth of the Philippines';
    if(iso==='pol')name=year===1914?'German Empire':'Second Polish Republic';
    if(iso==='mne')name=year===1914?'Kingdom of Montenegro':'Kingdom of Yugoslavia';
    if(iso==='sau')name=y<20&&x<44?'Idrisid Emirate of Asir':(year===1914?'Emirate of Nejd':'Kingdom of Saudi Arabia');
    if(iso==='yem')name=year===1914?'Ottoman Empire':'Kamaran under British administration';
    if(iso==='wsm')name=year===1914?'German Samoa':'New Zealand Mandate of Western Samoa';
    if(iso==='fsm'||iso==='mhl'||iso==='plw'||iso==='mnp')name=year===1914?'German Pacific Protectorates':'South Seas Mandate';
    if(iso==='nru')name=year===1914?'German Pacific Protectorates':'Anglo-Australian-New Zealand Nauru Mandate';
    if(iso==='kir'||iso==='tuv')name='Gilbert and Ellice Islands';
    if(iso==='png')name=y>-6.8?(year===1914?'German New Guinea':'Territory of New Guinea'):'Territory of Papua';
    if(iso==='usa'&&x>140&&x<147&&y>12&&y<22)name=year===1914?'German Pacific Protectorates':'South Seas Mandate';
    if(iso==='usa'&&x>-66&&x<-64&&y>17&&y<19)name=year===1914?'Danish West Indies':'United States of America';
    if(!name)return null;
    influence=colonialInfluence(name);
    if(name==='South Seas Mandate')influence='Empire of Japan';
    if(name==='New Zealand Mandate of Western Samoa')influence='Dominion of New Zealand';
    if(name==='Territory of Papua'||name==='Territory of New Guinea'||name==='Anglo-Australian-New Zealand Nauru Mandate')influence='Commonwealth of Australia';
    if(name==='Philippine Islands'||name==='Commonwealth of the Philippines')influence='United States of America';
    if(name==='Sheikhdom of Kuwait'||name==='Sultanate of the Maldives'||name==='Kingdom of Tonga')influence='United Kingdom';
    return result(name,influence,undefined,'Historical coastal/island assignment fills a cartographic source omission; fixed modern province geometry remains approximate.');
  }
  influence=colonialInfluence(name);
  if(name==='Belgian Congo')influence='Kingdom of Belgium';
  if(name==='Dutch East Indies')influence='Netherlands';
  if(name==='British Raj')influence='United Kingdom';
  if(aliases[raw]||influence)return result(name,influence);
  return null;
}
corrections.names=names;
corrections.aliases=aliases;
module.exports=corrections;
