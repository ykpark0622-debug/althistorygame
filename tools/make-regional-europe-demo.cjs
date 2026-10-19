'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const scenario=JSON.parse(fs.readFileSync(path.join(root,'examples/world-detailed-demo.json'),'utf8'));
scenario.id='regional_europe_demo_v22';scenario.title='국경의 갈림길';
scenario.subtitle='유럽과 지중해 · 현대 기본안 · 세 분야의 선택으로 남기는 세 해의 기록';
scenario.map.templateId='regional_europe_med_modern';
scenario.description='유럽과 지중해로 자른 현대 행정구역 지도에서 치세 모드의 선택·수치·정산·지도 변화를 체험하는 가상 예제입니다. 실제 연도의 전쟁이나 국제 관계를 재현하지 않습니다. 편집기의 지도·초기 영토에서 지도 범위와 시대 기본안을 바꿀 수 있습니다.';
fs.writeFileSync(path.join(root,'examples/regional-europe-demo.json'),JSON.stringify(scenario,null,2)+'\n');
console.log('Created regional Europe reign example.');
