'use strict';
// This final pass labels unresolved areas geographically. These labels are
// deliberately NOT assertions of historical state borders or vacant land.
function corrections(c){
 if(c.year>=1700||!/경계 미상/.test(c.chosenName))return null;
 const iso=c.modernOwner,x=c.lon,y=c.lat,owner=c.chosenName;
 const r=name=>({name,note:'Geographic grouping of unresolved local communities; no assertion of a single sovereign state.'});
 if(iso==='grc')return {name:c.year===1444?'Knights Hospitaller':'Ottoman Empire'};
 if(iso==='hrv')return {name:'Republic of Ragusa'};
 if(iso==='nld')return c.year===1648?{name:'Dutch Republic'}:{name:c.year===1444?'Duchy of Burgundy':'Spanish Netherlands',influence:c.year===1550?'Kingdom of Spain':undefined};
 if(iso==='gib')return {name:c.year===1444?'Kingdom of Granada':'Kingdom of Spain'};
 if(iso==='grl')return r('그린란드 이누이트 공동체');
 if(iso==='mne')return r('제타 지방 세력 · 경계 미상');
 if(iso==='ukr')return r('흑해 북안·자포리자 여러 세력');
 if(iso==='irq'||iso==='kwt')return r('메소포타미아·페르시아만 여러 세력');
 if(iso==='sau')return r('아라비아 내륙 부족·오아시스 세력');
 if(['dza','lby','mrt','esh','mar','tun','brt'].includes(iso))return r('사하라 부족·오아시스 공동체');
 if(iso==='rus')return r(x<60?'러시아 북방·스텝 여러 공동체':'시베리아·극동 여러 공동체');
 if(iso==='pol')return {name:'Kingdom of Poland'};
 if(c.year!==1550)return null;
 if(iso==='nga'&&x>=4.7&&x<=6.7&&y>=5.7&&y<=7.3)return r('Kingdom of Benin');
 if(iso==='chn')return r('여진 여러 부족');
 if(iso==='btn'||iso==='npl'||(iso==='ind'&&y>26))return r('히말라야 여러 소국·공동체');
 if(iso==='bgd')return {name:'Sur Empire'};
 if(iso==='ind'&&x>68&&x<73.2&&y>20.1&&y<24.8)return r('Gujarat Sultanate');
 if(iso==='ind')return r('라지푸트·중부 인도 지방 세력');
 if(iso==='pak'||iso==='afg'||iso==='tkm')return r('신드·발루치·힌두쿠시 지방 세력');
 if(iso==='idn'||iso==='tls')return r(x>=130?'뉴기니·말루쿠 여러 공동체':'누산타라 여러 술탄국·공동체');
 if(iso==='phl')return r('필리핀 제도 여러 바랑가이');
 if(iso==='mys'||iso==='sgp')return r('말레이 여러 술탄국·공동체');
 if(iso==='tha'||iso==='vnm')return r('인도차이나 여러 지방 세력');
 if(iso==='mdv')return {name:'Sultanate of the Maldives'};
 if(iso==='cpv')return {name:'Portuguese Empire'};
 if(iso==='omn')return r('오만 지방 세력');
 if(['mus','syc','atf','hmd','iot'].includes(iso))return r('인도양 섬들 · 정주·영유 관계 미상');
 if(['gum','mnp'].includes(iso))return r('차모로 공동체');
 if(['pga','scr','umi','nfk'].includes(iso))return r('태평양 섬·암초 · 관계 미상');
 if(iso==='usa')return r(x< -125?'알래스카·태평양 원주민 공동체':'북아메리카 원주민 공동체 · 경계 미상');
 // Avoid interpreting a modern administrative label as an early-modern polity.
 if(/일대 · 경계 미상/.test(owner))return r('여러 지방 공동체 · 경계 미상');
 return null;
}
corrections.names={'Gujarat Sultanate':'구자라트 술탄국','Kingdom of Benin':'베닌 왕국'};
module.exports=corrections;
