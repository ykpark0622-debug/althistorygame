# 유럽 균형 지도: 출처와 재사용 조건

확인일: 2026-10-20. 이 문서는 새 유럽 균형 템플릿의 지도 데이터에 적용됩니다. 프로그램 코드나 이용자가 작성한 시나리오의 라이선스를 바꾸지 않습니다.

## 어떤 지도를 바꾸었나

프랑스의 코뮌, 독일의 작은 시·군, 스위스의 기초자치구역을 그대로 모두 표시하면 국가별 구역 수 차이가 지나치게 커집니다. 새 템플릿은 현대의 공개 행정 경계를 골라 쓰거나 인접 구역을 묶어 게임에서 다루기 쉬운 크기로 조정합니다. 이탈리아는 기존의 20개 레조네보다 세밀한 107개 도·광역시 경계를 사용합니다.

이 자료는 **현대 행정 경계를 바탕으로 만든 편집용 지도**입니다. 옛 국가명이나 시나리오의 시대를 적용하더라도 도형이 그 시대의 실제 경계로 바뀌는 것은 아닙니다. 병합된 지역은 게임용 묶음이며 공식 행정구역이나 역사적 프로빈스로 제시하지 않습니다. 국가별 원자료의 연도·정확도와 국경 표현이 서로 다를 수 있습니다.

기존 지도 ID와 도형은 유지합니다. 기존 시나리오의 지역 ID를 새 템플릿의 ID로 자동 교체하지 않습니다.

## 이번에 사용한 핵심 자료

| 범위 | 원자료와 시점 | 원자료 구역 수 | 원자료의 이용 조건 |
|---|---|---:|---|
| 이탈리아 | ISTAT, geoBoundaries gbOpen ITA ADM3, 2023 | 107 | Creative Commons Attribution 3.0 |
| 스위스 | Federal Office of Topography swisstopo, gbOpen CHE ADM1, 2022 | 26 | swisstopo 개방 지리정보 이용 조건, 출처 표시 |
| 프랑스 | IGN, CGAZ에 수록된 FRA ADM2, 2022 | 96 | Etalab Open License 2.0 |
| 독일 | BKG, gbOpen DEU ADM3, 2021 | 428 | Data licence Germany – attribution – version 2.0 |
| 스페인 | INE, CGAZ에 수록된 ESP ADM2, 2018 | 52 | National Institute of Statistics (INE) Data License |
| 그 밖의 지역 | 기존 CGAZ ADM2 및 Natural Earth 기반 자료 | 국가별 상이 | 아래의 기존 자료 조건을 그대로 유지 |

원자료 수와 최종 게임 구역 수는 다를 수 있습니다. 최종 수는 생성된 템플릿의 `provinces`와 빌드 보고서를 기준으로 합니다. 파일별 바이트 수, SHA-256, 다운로드 URL, 원자료 메타데이터는 [europe-balanced-sources.json](tools/map-source/licenses/europe-balanced-sources.json)에 기록했습니다. 신규 파일은 geoBoundaries 저장소의 고정 리비전 `9469f09`에서 받았습니다.

### 이탈리아

- 제공자: ISTAT, National Institute of Statistics. 배포·메타데이터: geoBoundaries gbOpen.
- [원자료 메타데이터 API](https://www.geoboundaries.org/api/current/gbOpen/ITA/ADM3/), [고정 원본 GeoJSON](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/ITA/ADM3/geoBoundaries-ITA-ADM3_simplified.geojson).
- 원자료 표기: `Creative Commons Attribution 3.0 License`. [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)은 출처와 라이선스를 표시하고 변경 사항을 알리는 조건으로 복제·가공·재배포와 상업적 사용을 허용합니다. 데이터에 추가적인 재사용 제한을 붙이지 않습니다.
- [ISTAT의 현재 일반 이용 조건](https://www.istat.it/note-legali/)은 CC BY 4.0을 안내하지만, 이 패키지는 사용한 2023년 자료에 명시된 CC BY 3.0 표기를 유지합니다.
- 출처 표기 예: **Italy administrative boundaries (2023): ISTAT, via geoBoundaries gbOpen; CC BY 3.0. Simplified, selected and converted for this game.**

### 스위스

- 제공자: Federal Office of Topography swisstopo. 배포·메타데이터: geoBoundaries gbOpen.
- [원자료 메타데이터 API](https://www.geoboundaries.org/api/current/gbOpen/CHE/ADM1/), [고정 원본 GeoJSON](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/CHE/ADM1/geoBoundaries-CHE-ADM1_simplified.geojson).
- [swisstopo 공식 개방 자료 FAQ](https://www.swisstopo.admin.ch/en/faq-free-geodata)에 따라 무료 자료의 상업적 이용·가공·배포가 허용되며 출처를 표시해야 합니다. 게임의 경우 중앙 출처 목록에 표기하는 방식도 안내되어 있습니다. 이 자료를 일률적으로 퍼블릭 도메인 또는 CC 라이선스라고 표기하지 않습니다.
- 출처 표기 예: **Switzerland cantonal boundaries (2022): © swisstopo, via geoBoundaries gbOpen. Derived, simplified and converted for this game.**

### 프랑스와 독일

- 프랑스: **Institut national de l'information géographique et forestière (IGN-F)**, ADMIN EXPRESS, 2022, geoBoundaries/CGAZ를 통해 사용. [FRA ADM2 메타데이터](https://www.geoboundaries.org/api/current/gbOpen/FRA/ADM2/), [IGN 자료](https://geoservices.ign.fr/adminexpress), [프랑스 정부의 Open License 설명](https://ia.numerique.gouv.fr/licence-ouverte-open-licence/). Etalab Open License 2.0은 출처를 표시하는 조건으로 복제·재배포·가공과 상업적 이용을 허용합니다. 사용한 자료의 시점과 게임용 변경 사실을 함께 기록합니다.
- 독일: **Federal Agency for Cartography and Geodesy (BKG)**, 2021, geoBoundaries gbOpen DEU ADM3. [메타데이터](https://www.geoboundaries.org/api/current/gbOpen/DEU/ADM3/), [dl-de/by-2-0 원문](https://www.govdata.de/dl-de/by-2-0). 제공자, 데이터 링크와 라이선스 링크를 표시하고 가공·병합 사실을 밝힙니다. 원자료 428개 구역을 게임용으로 묶은 결과를 공식 행정 경계로 부르지 않습니다.

### 스페인

- 제공자: **Instituto Nacional de Estadística (INE)**. 2018년 도 단위 52개 구역, geoBoundaries/CGAZ를 통해 사용. [ESP ADM2 메타데이터](https://www.geoboundaries.org/api/current/gbOpen/ESP/ADM2/)는 원제공자를 INE, 이용 조건을 `National Institute of Statistics (INE) Data License`로 기록합니다.
- [INE 공식 이용 조건](https://www.ine.es/ss/Satellite?L=0&c=Page&cid=1254735849170&p=1254735849170&pagename=Ayuda/INELayout)의 `Reutilización de la información contenida en este sitio web` 절에 따라 INE 자체 원자료는 상업·비상업 목적으로 재사용할 수 있습니다. 정보의 의미를 왜곡하지 않고, 원출처와 원자료에 포함된 최종 갱신 시점을 표시하며, INE가 게임을 승인·후원하는 것으로 표현하지 않습니다. INE 사이트의 제삼자 자료에까지 같은 허가가 적용된다고 해석하지 않습니다.
- 출처 표기: **Spain provinces (2018): Elaboración propia con datos extraídos del sitio web del INE: www.ine.es; via geoBoundaries/CGAZ. Simplified and converted into editable game regions.**

## 기존 자료에서 이어지는 조건

이탈리아·스위스를 새 단계로 바꾼 부분을 제외한 기존 자료의 출처와 의무는 [MAP-SOURCES.md](MAP-SOURCES.md), [geoBoundariesOpen-meta.csv](tools/map-source/licenses/geoBoundariesOpen-meta.csv), [world-detailed-provenance.json](tools/map-source/licenses/world-detailed-provenance.json)에 유지합니다. 일부 국가는 별도의 CC BY-SA 또는 ODbL 조건을 갖고 있습니다. geoBoundaries 프로젝트의 일반 CC BY 안내가 개별 원자료의 조건을 없애지는 않습니다.

- 육지·호수·강과 대체 국가 경계: **Natural Earth 1:10m**, public domain. [이용 조건](https://www.naturalearthdata.com/about/terms-of-use/).
- geoBoundaries: Runfola, D. et al. (2020), *geoBoundaries: A global database of political administrative boundaries*. PLoS ONE 15(4): e0231866. [논문](https://doi.org/10.1371/journal.pone.0231866).
- CGAZ 고정 원본: [geoBoundaries 리비전 5c25134028196d43ce97b5071934fd0cfc92f09f](https://github.com/wmgeolab/geoBoundaries/tree/5c25134028196d43ce97b5071934fd0cfc92f09f/releaseData/CGAZ). 기존 원본 ZIP SHA-256은 `598f6c70893d60a35b96eb0dc31fd1c045e69177e4b8203407710306f6585de1`입니다.
- OpenStreetMap 유래 자료: **© OpenStreetMap contributors**, [저작권·출처 안내](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). 해당 자료에서 유래한 가공 데이터베이스에는 원래의 재공유 조건이 유지됩니다. 벡터 데이터는 생성된 템플릿 JSON으로 제공하며 프로그램 코드의 라이선스로 재사용을 제한하지 않습니다.
- CC BY-SA 원자료에서 유래한 수정 도형은 해당 동일조건 공유 라이선스를 유지합니다. 배포 시 이 문서만 떼어 내지 말고 기존 `MAP-SOURCES.md` 및 국가별 메타데이터도 함께 제공하세요.

## 변경 사실과 배포

이번 게임용 작업은 원자료 선택, 구역 병합·단순화, 좌표 변환, 표시명과 게임 ID 부여입니다. 원자료 제공자가 이 게임을 보증하거나 후원하는 것처럼 표시하지 않습니다. 공식 국경이나 행정구역 판정용 자료로 사용하지 않습니다.

새 지도 도형은 `assets/maps/manifest.json`의 해당 템플릿 항목이 가리키는 파일로 배포합니다. 분할 텍스트 형식일 경우 그 항목의 모든 `parts`를 조합하면 JSON 원문이 됩니다. 출처 문서와 메타데이터를 해당 배포물에 함께 두어, 지도를 재사용하는 사람도 원자료 조건을 확인할 수 있게 합니다.
