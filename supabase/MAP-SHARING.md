# 지도 공유용 데이터베이스 업데이트

기존 시나리오 갤러리에 지도 전용 JSON을 함께 저장합니다. 기존 시나리오, 계정, 좋아요, 신고, 관리자 설정은 유지됩니다.

## 기존 사이트

1. 기존 파일과 `config.js`의 Supabase 공개 설정을 별도로 보관합니다.
2. Supabase 대시보드에서 해당 프로젝트의 **SQL Editor → New query**를 엽니다.
3. `supabase/migrate-v2.3-maps.sql`의 전체 내용을 붙여 넣고 **Run**을 누릅니다. 전체 파일을 실행해야 마지막 `commit;`까지 적용됩니다. SQL 실행 후 프로그램 파일을 V2.3으로 교체하고 기존 `config.js` 설정을 유지합니다.
4. 아래 확인 SQL을 실행합니다. 세 행이 나오면 새 메타데이터 열이 준비된 것입니다.

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scenarios'
  and column_name in ('content_kind', 'mode', 'map_template_id')
order by column_name;
```

5. 갤러리에서 **둘러볼 작품 → 지도**를 고릅니다. 지도 만들기에서 저장한 지도를 구글 로그인 후 올립니다. 공개하면 다른 이용자가 편집하거나 JSON을 받을 수 있습니다.

이전 V1 사이트에서도 V2.3 마이그레이션이 `schema_version`, `mode`, `map_template_id`를 추가합니다. 별도로 V2 마이그레이션을 다시 실행할 필요가 없습니다. V2.3 적용 후 오래된 `migrate-v2.sql`을 실행하면 지도용 제약과 트리거가 이전 정의로 돌아가므로 사용하지 마세요.

## 새 설치

`supabase/schema.sql`을 실행합니다. 지도 공유 정의가 포함되어 있으므로 별도의 지도 마이그레이션은 필요 없습니다. 로그인 설정과 관리자 등록은 기존 `SETUP.md`를 따릅니다.

## 저장 방식과 제한

- 기존 `public.scenarios` 표를 사용하며 `content_kind`가 `scenario` 또는 `map`으로 구분합니다. 새 표나 Storage 버킷을 만들지 않습니다.
- `content_kind`, `schema_version`, `mode`, `map_template_id`는 서버가 JSON에서 계산합니다. 이용자에게 이 열을 직접 변경하는 권한을 부여하지 않습니다.
- 지도 JSON은 `type: "map"`, `schemaVersion: 1`이며 지역·시대 템플릿 ID, 국가 이름·색, 시작 소유권·점령·영향권·표식의 변경분을 담습니다. 지도 경계 SVG는 사이트에 포함된 템플릿을 사용합니다.
- 지도는 사건·선택지·엔딩 없이 공유합니다. 지도 문서의 사건·엔딩 수는 0이고 플레이 수를 올리지 않습니다. 지도와 시나리오 목록은 서버에서 필터한 뒤 정렬·페이지를 나눕니다.
- 기존과 같은 1 MB 업로드 제한, 구글 로그인, 좋아요·신고·숨김·삭제 규칙이 적용됩니다. 업로드 제한은 시나리오와 지도를 합해 10분당 5개, 계정당 50개입니다.
- 로컬 지도 편집은 데이터베이스 없이 동작합니다. 웹 갤러리에 게시하려면 이 SQL 업데이트와 Supabase 설정이 필요합니다.

## 확인 범위

포함된 테스트는 JSON 구분, 서버 필터·정렬·페이지, 지도 미리보기, 가짜 백엔드에 대한 업로드, 잘못된 파일 차단, 지도 편집기로 넘기기와 마이그레이션 안내를 검사합니다. 실제 운영 Supabase에 SQL을 실행하거나 테스트 게시물을 공개하지 않았습니다. 운영 환경의 구글 로그인과 SQL 적용 결과는 사이트에서 확인해야 합니다.
