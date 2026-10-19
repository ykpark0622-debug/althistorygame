# v2.3 — 지도 제작기와 지도 갤러리

사건·선택지 없이 지도만 만들고, 별도 JSON으로 저장하고, 갤러리에서 공유할 수 있습니다. 기존 시나리오·게임 진행·지도 편집 기능과 호환됩니다.

## 기존 사이트 업데이트 순서

1. 기존 GitHub 파일과 중요한 시나리오·지도 JSON을 별도로 보관하세요. 현재 사이트의 `config.js` 설정도 유지합니다.
2. Supabase 프로젝트의 **SQL Editor → New query**에서 `supabase/migrate-v2.3-maps.sql`의 전체 내용을 붙여 넣고 **Run**을 누릅니다. 기존 V1·V2 갤러리 모두 이 변경 파일만 사용합니다. 적용 후에는 오래된 `migrate-v2.sql`을 다시 실행하지 마세요.
3. 오류 없이 끝나면 아래 확인 SQL을 실행합니다. 결과에 `content_kind` 한 줄이 있으면 새 구분 컬럼이 준비된 것입니다.

   ```sql
   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'scenarios'
     and column_name = 'content_kind';
   ```

4. 배포 ZIP의 **내용물**을 기존 GitHub 저장소의 같은 위치에 올리고 교체 후 커밋합니다. ZIP 자체나 바깥 폴더째 올리는 방식이 아니라 `index.html`, `app.js` 등이 원래 위치에 오게 합니다. 기존 Supabase 주소와 공개 키가 든 `config.js`를 유지하세요.
5. Vercel의 최신 Production 배포가 **Ready**인지 확인하고 사이트를 강력 새로고침합니다. 상단에 **지도 만들기**, 갤러리에 **시나리오 / 지도** 구분이 보여야 합니다.
6. 지도 제작 → 지역·시대 선택 → 영토 변경 → 지도 저장 → JSON 내보내기를 확인합니다. 갤러리에서 지도 업로드 후 지도 편집하기와 JSON 받기도 확인하세요. 기존 시나리오 목록·플레이·좋아요도 확인합니다.

새 설치는 변경 SQL을 따로 적용하지 않고 갱신된 `supabase/schema.sql`을 사용합니다. 이번 변경 SQL은 기존 시나리오 행을 삭제하거나 시나리오 JSON을 다시 쓰지 않습니다. 실제 공개 사이트·Supabase에 이 배포본을 자동 반영하지는 않았습니다.

## 사용법

[MAP-MAKER.md](MAP-MAKER.md)를 참고하세요. 지도는 브라우저의 별도 저장 공간과 JSON 파일에 보관됩니다. 프로그램을 내려받을 때 개인 지도·원고·플레이 진행은 포함하지 않습니다.
