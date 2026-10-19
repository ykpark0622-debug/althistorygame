# 세계 균형 지도: 출처와 이용 조건

`world-balanced`는 현대 행정 경계를 시나리오 제작에 알맞게 묶은 편집용 지도입니다. 역사적 국경이나 특정 시대의 영유권을 나타내지 않습니다. 국가·속령·원자료 소유 단위를 합쳐 252개 소유 단위, 5,939개 게임 구역을 제공합니다. 이는 252개 독립국이라는 뜻이 아닙니다.

기존 세계 세부 지도 61,940개 구역에서 구역 수를 약 90% 줄였습니다. 중국 200, 인도 160, 미국 180, 러시아 160, 브라질 140, 캐나다 76, 호주 60, 일본 80, 대한민국 60, 북한 35, 인도네시아 100개 구역입니다. 캐나다는 이용 가능한 원자료가 76개이므로 이를 유지했습니다. 프랑스 96, 독일 108, 스위스 26, 이탈리아 107, 스페인 52개로 앞서 제공한 유럽 균형 지도와 같은 밀도를 유지합니다. 새 지도의 구역 ID는 `worldb_`로 시작하며 기존 지도와 시나리오 ID를 바꾸지 않습니다.

## 경계와 가공 방법

- 기존 공개 CGAZ 행정 경계를 사용하고, 독일은 BKG 기반 428개 구역을 108개로 병합했습니다.
- 이탈리아는 ISTAT 2023년 도·광역시 107개, 스위스는 swisstopo 2022년 칸톤 26개 자료를 재사용했습니다.
- 구역 병합은 국가 안에서 수행하며 해안선·섬을 구역 수를 줄이는 목적으로 삭제하지 않았습니다. 묶은 구역 이름은 대표 지역명에 `일대`를 붙입니다. 실제 행정구역 이름과 범위가 그대로 일치하지 않을 수 있습니다.
- 기존 Natural Earth 육지·호수·하천 표시를 재사용합니다. 원자료의 자료 시점·해안선 차이와 일부 경계 불일치는 남아 있습니다.
- 세계 좌표는 정거원통도법 2160×1080입니다. 날짜 변경선에 닿는 도형은 지도 좌우 가장자리에서 나누어 표시합니다.
- 자료가 없거나 원자료 이용 조건이 선별 기준에 맞지 않는 지역은 기존 프로그램과 같이 Natural Earth 국가 단위 도형을 사용합니다. 남극은 육지 바탕에 표시되며 편집 가능한 행정 구역은 아닙니다.
- `tools/build-balanced-world.cjs`가 빌드 스크립트이며, 입력 파일 해시·국가별 구역 수·면적 변화 검사는 `tools/map-source/licenses/world-balanced-build.json`에 기록합니다.

## 원출처와 적용 조건

이 파일은 지도 데이터에 적용되며 관련 없는 프로그램 코드나 시나리오의 라이선스를 바꾸지 않습니다. **무료 프로그램이라고 해서 지도 원자료의 조건이 없어지는 것은 아닙니다.** 기존 원자료의 출처 표시와 동일조건 공유 의무를 그대로 유지합니다.

- Natural Earth 1:10m: 퍼블릭 도메인. [이용 조건](https://www.naturalearthdata.com/about/terms-of-use/)
- geoBoundaries: Runfola, D. et al. (2020), *geoBoundaries: A global database of political administrative boundaries*, PLoS ONE 15(4): e0231866. [논문](https://doi.org/10.1371/journal.pone.0231866)
- CGAZ 및 각 국가의 원출처·연도·라이선스: `MAP-SOURCES.md`, `tools/map-source/licenses/geoBoundariesOpen-meta.csv`, `tools/map-source/licenses/world-detailed-provenance.json`을 함께 보관하세요. 자료별 CC BY, CC BY-SA, ODbL, 정부 공개 라이선스 등이 각각 적용되므로 전체를 퍼블릭 도메인 또는 단일 CC BY 자료로 표시하면 안 됩니다.
- OpenStreetMap 유래 자료: © OpenStreetMap contributors. [출처와 이용 조건](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). 해당 가공 데이터베이스는 원자료의 동일조건 공유 의무를 유지합니다.
- 이탈리아: ISTAT, 2023년 경계, geoBoundaries gbOpen 배포본. 데이터에 명시된 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)을 유지합니다. 선택·단순화·변환된 가공 데이터입니다.
- 스위스: © swisstopo, 2022년 칸톤 경계, geoBoundaries gbOpen 배포본. 출처 표시 조건으로 이용·배포할 수 있는 [swisstopo 무료 지리정보 조건](https://www.swisstopo.admin.ch/en/faq-free-geodata)이 적용됩니다. 퍼블릭 도메인 자료가 아닙니다.
- 프랑스: IGN ADMIN EXPRESS, 2022년 도 경계, Etalab Open License 2.0.
- 독일: BKG, 2021년 경계, [Data licence Germany – attribution – version 2.0](https://www.govdata.de/dl-de/by-2-0). 병합·단순화·좌표 변환한 자료이며 기관의 보증이나 승인을 의미하지 않습니다.
- 스페인: INE, 2018년 도 경계, INE Data License. Elaboración propia con datos extraídos del sitio web del INE: www.ine.es. Datos de límites administrativos: 2018. Modificados para este juego; sin patrocinio ni aprobación del INE.

이탈리아·스위스 자료의 고정 원본 주소와 해시, 유럽 주요 국가의 상세 출처는 `BALANCED-MAP-SOURCES.md`, `tools/map-source/licenses/europe-balanced-sources.json` 및 `tools/map-source/licenses/world-balanced-sources.json`을 확인하세요. 지도 데이터를 재배포할 때 해당 문서와 국가별 출처 자료를 함께 제공하세요. 국가별 출처·라이선스는 지도 JSON의 `credits`에도 포함됩니다.
