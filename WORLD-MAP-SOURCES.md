# 세계 균형 지도: 원자료와 이용 조건

세계 균형 지도는 기존 Natural Earth와 geoBoundaries gbOpen 자료에서 국가별 행정단계를 선택하고, 인접 행정구역을 같은 국가 안에서 합친 게임용 데이터입니다. 기존 지도는 그대로 보관하고 새로운 `world-balanced` ID를 사용합니다. 현대 행정 경계에 기초하며 역사적 국경 복원본이 아닙니다.

- 지형·국가 단위 대체 경계: Natural Earth 1:10m, public domain. https://www.naturalearthdata.com/about/terms-of-use/
- 행정 경계: geoBoundaries CGAZ ADM2 및 일부 gbOpen 개별 국가 자료. 원자료의 고정 버전·국가별 제공자·라이선스는 [MAP-SOURCES.md](MAP-SOURCES.md), `tools/map-source/licenses/geoBoundariesOpen-meta.csv`, `world-detailed-provenance.json`을 보관합니다.
- 프랑스·독일·스위스·이탈리아·스페인의 단계 선택 및 자료 이용 조건은 [BALANCED-MAP-SOURCES.md](BALANCED-MAP-SOURCES.md), `tools/map-source/licenses/europe-balanced-sources.json`에 있습니다. ISTAT via gbOpen CC BY 3.0, ©swisstopo, IGN Etalab Open License 2.0, BKG dl-de/by-2-0, INE 원자료의 재사용 조건을 유지합니다.
- 가공: 국가별 공개 원자료 선별, 경계 단순화, 인접 구역 병합, 게임 좌표로 변환, 구역 이름과 고정 ID 생성. 인접 구역을 합친 결과는 공식 행정구역이나 역사적 프로빈스로 제시하지 않습니다.
- 원자료별 출처·라이선스는 새 템플릿의 `credits`에도 포함됩니다. 최종 구역 수, 원본 파일 SHA-256, 국가별 병합 전후 수·면적 검사는 `tools/map-source/licenses/world-balanced-build.json`을 참고하세요.

geoBoundaries 원자료가 모두 같은 라이선스인 것은 아닙니다. © OpenStreetMap contributors, ODbL 1.0 또는 CC BY-SA 등 개별 원자료 조건이 적용되는 가공 도형에는 해당 조건을 유지합니다. 출처·라이선스 링크·변경 사실과 필요한 동일조건 공유 의무를 보존하세요. 프로그램 코드나 창작 시나리오의 조건과 구분합니다.

이 템플릿은 같은 국가의 도형만 병합하며 국가 간 경계의 불일치나 원자료별 조사 연도 차이를 해결한 정밀 지리 데이터는 아닙니다. 분쟁지역의 표현은 원자료를 따릅니다. ©swisstopo 등 중앙 출처 표기를 포함해 원출처와 조건 문서를 지도 데이터와 함께 배포하세요.
