# 세계 세부 지도 재생성

일반 배포에는 이 과정을 실행하지 않습니다. v2.4의 루트 `map-templates.js`는 작은 로더이며 도형은 `assets/maps/`에 나뉘어 있습니다. `node tools/build-map-assets.cjs` 또는 호환 진입점 `node build-maps.cjs`로 자산을 다시 만들고, `node build.cjs`로 오프라인 HTML을 만듭니다. 세계 도형은 `map-source/world-detailed.json` 사본이 있으면 사용하고, 없으면 `assets/maps/manifest.json`의 세계 기본 지도 자산에서 읽습니다. 배포본에는 중복 사본을 제외하고 동일한 도형 전체와 라이선스를 자산 폴더에 제공합니다. 자세한 구조는 [MAP-LOADING.md](../MAP-LOADING.md)를 참고하세요.

원자료부터 다시 만들 때만 Node와 별도 개발용 디렉터리에 `mapshaper@0.7.88`, `d3-geo@3.1.1`이 필요합니다. 다운로드 원본·도구·캐시는 사이트 배포 폴더 밖에 보관하세요. `MAP_BUILD_MODULES`에 해당 node_modules의 절대 경로를 지정할 수 있습니다.

## 고정 원본

- geoBoundaries 커밋: `5c25134028196d43ce97b5071934fd0cfc92f09f`.
- CGAZ: `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/5c25134028196d43ce97b5071934fd0cfc92f09f/releaseData/CGAZ/geoBoundariesCGAZ_ADM2.zip`.
- CGAZ zip SHA-256: `598f6c70893d60a35b96eb0dc31fd1c045e69177e4b8203407710306f6585de1`.
- 유럽 보강: 같은 커밋 `releaseData/gbOpen/FRA/ADM4`, `ESP/ADM3`, `DEU/ADM3`, `CHE/ADM3`의 `geoBoundaries-ISO-ADM-all.zip`.
- 원자료 메타데이터와 프로젝트 라이선스는 `map-source/licenses/`에 동봉합니다. 원자료의 조건을 유지하세요. 스위스는 ©swisstopo 출처 표시 및 [공식 이용 조건](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)을 확인했습니다.
- Natural Earth: `https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip`, `ne_10m_lakes.zip`, `ne_10m_rivers_lake_centerlines.zip`; 국가명·색·본토 이동 영역은 `https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip`.

## 전처리

압축을 풀고 mapshaper로 SHP → GeoJSON을 변환합니다. 공유 경계를 유지하는 weighted simplification, `keep-shapes`, 좌표 `precision=0.00001`을 사용했습니다.

```sh
mapshaper -i geoBoundariesCGAZ_ADM2.shp -simplify 3% keep-shapes -o format=geojson precision=0.00001 cgaz-adm2-simplified.geojson
```

유럽 보강 네 파일도 같은 3% 설정으로 `extra-FRA.geojson`, `extra-ESP.geojson`, `extra-DEU.geojson`, `extra-CHE.geojson`을 만듭니다. Natural Earth는 land/countries/rivers 10%, lakes 12%로 `ne-land.geojson`, `ne-countries.geojson`, `ne-rivers.geojson`, `ne-lakes.geojson`을 만듭니다.

```sh
node tools/build-detailed-map.cjs /absolute/path/to/cache
node build-maps.cjs
node tools/make-world-demo.cjs
node run-tests.cjs
```

모든 입력 GeoJSON을 하나의 cache 디렉터리에 둡니다. 세계는 정거원통도법(Equirectangular) 2160×1080 좌표로 변환하고 SVG 좌표는 0.1 단위로 반올림합니다. 경계 단순화와 구역 단위 대체 때문에 측량용 정밀 자료로 쓰지 않습니다.

## 재배포

원출처 목록과 라이선스 링크는 `MAP-SOURCES.md`, `map-source/licenses/world-detailed-provenance.json`에 있습니다. 도형 JSON과 출처 목록을 함께 제공하고, OSM 유래 가공 데이터베이스의 ODbL 및 CC BY-SA 도형의 동일조건을 유지합니다. 이 조건을 프로그램 엔진·창작 원고에 일괄 적용하지 않습니다.

기본 CGAZ는 49,349개 기록입니다. 남극·별도 분쟁 구역을 제외하고 유럽 네 나라를 세분하며 누락 국가는 Natural Earth로 보완한 결과 **61,940개 지역, 252개 국가·지역 표시 단위**입니다. 이 표시 단위 수는 주권국가 수가 아닙니다.
