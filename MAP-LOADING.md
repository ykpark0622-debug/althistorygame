# 지도 파일 구조

- `map-templates.js`: 약 38KB의 지도 목록·로더. 지역·시대·지역 수를 도형 없이 제공합니다.
- `map-regions.js`: 기존 진입점을 유지하는 작은 호환 파일.
- `assets/maps/*.해시.json`: 작은 지형·시대 파일 또는 분할된 파일의 조각 목록입니다. 6개 범위와 기존 지도 ID를 유지합니다.
- `assets/maps/*.해시.txt`: 최대 1MiB의 UTF-8 텍스트 조각입니다. 로더가 순서대로 합쳐 원래 JSON을 복원하고 크기·해시·지도 형식을 확인합니다. 직접 편집하거나 확장자를 바꾸지 않습니다.
- `assets/maps/manifest.json`, `SIZES.json`: 파일 목록·해시·크기·비교 측정치. 앱의 로더 목록은 생성 시 `map-templates.js`에 들어갑니다.
- `tools/build-map-assets.cjs`: 포함된 가공 데이터로 자산을 재생성합니다. 원본 세계 JSON 사본이 없으면 배포된 세계 자산을 입력으로 사용합니다.
- `tools/map-source/regional-presets.cjs`: 기존 지역 자르기·시대 배치 계산 코드. 재생성과 단일 HTML에 사용합니다.

## 웹 API

```js
MapTemplates.list();                       // 도형을 받지 않는 목록
MapTemplates.get(templateId);              // 브라우저: 준비된 지도 또는 null
await MapTemplates.ensure(templateId);     // 필요한 지형+시대만 준비, 중복 요청 합침
await MapTemplates.ensureScenario(data);   // data.map.templateId 준비
MapTemplates.isLoaded(templateId);
```

엔진·지도 문서의 검증 함수는 동기 함수를 유지합니다. 브라우저에서 새 시나리오·지도 파일을 검증하거나 상태를 만들기 **전에** `ensure`를 기다립니다. Node.js에서는 `get`이 로컬 자산을 필요할 때 읽으므로 기존 검사·생성 도구가 작동합니다.

`HistoryCrossroads.importScenario()`는 지도 없음/이미 준비된 지도에서는 기존 동기 동작을 유지하고, 처음 불러오는 지도에서는 Promise를 반환합니다. 연동 코드는 `await`를 사용하면 두 경우 모두 처리합니다. `MapMaker.open/startNew/importDocument/getStored`는 Promise를 반환합니다.

초기 화면에서는 저장 원고의 제목·내용만 유지하고 무거운 지도를 미리 복원하지 않습니다. 이때 `getState()`는 null일 수 있고, `resumeScenario()` 또는 이어서 하기에서 지도를 준비한 뒤 검증된 진행을 복원합니다. 저장된 원고와 자동 저장 값은 그대로 유지됩니다.

## 오류·캐시

등록된 동일 출처 자산만 요청합니다. 잘못된 지도 ID·응답·JSON은 오류로 처리하며, 로딩 실패나 뒤늦게 도착한 요청이 현재 원고·진행·수정 내용을 덮어쓰지 않습니다. 실패한 요청은 다시 시도할 수 있습니다. 파일명이 해시를 포함하므로 내용이 바뀌면 새 URL을 사용합니다. 지도 하나당 최대 3개의 조각을 병렬로 받습니다. 조각이 누락되거나 손상되면 완성되지 않은 지도를 적용하지 않습니다.

브라우저 요청 검사는 `tests/lazy-map-network-browser.cjs`, 비동기 앱 복원·경합은 `tests/app-lazy-loading.cjs`, 편집기 경합은 `tests/lazy-editor-browser.cjs`를 참고하세요. 내려받은 단일 HTML은 한 번의 세계 도형과 지역 계산 코드를 포함해 지도 자산 네트워크 요청 없이 동작합니다.

## 웹 업로드와 프로그램 내려받기

GitHub 웹 업로드용 ZIP은 필요한 조각만 포함하며, 이전의 큰 지도 JSON 사본은 넣지 않습니다. 번호별 업로드 ZIP은 각 묶음의 합계 크기와 파일 수를 제한하고 실행 파일을 마지막에 교체합니다. 자세한 순서는 `UPDATE-V2.4.1.md`에 있습니다.

웹에 배포하는 `standalone.html`은 작은 다운로드 진입 페이지입니다. `program-download.js`가 `assets/program`의 조각을 합쳐 해시를 확인하고, 온전한 오프라인 HTML을 만듭니다. 사이트의 프로그램 내려받기도 같은 경로를 사용합니다. 기존의 전체 HTML 응답과 오프라인에서의 내보내기도 계속 지원합니다. 프로그램 내려받기를 누르기 전에는 이 조각들을 받지 않습니다.
