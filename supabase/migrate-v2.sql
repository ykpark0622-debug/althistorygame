-- 기존 갤러리만 V2로 올리는 추가 마이그레이션입니다. 새 설치는 schema.sql을 실행하세요.
-- 기존 시나리오·계정·좋아요·신고·업로드 제한·RLS와 권한을 그대로 둡니다.
-- 재실행할 수 있습니다. 실제 DB에서 실행하기 전에 백업을 보관하세요.
begin;
do $$ begin
  if to_regclass('public.scenarios') is null then
    raise exception '기존 갤러리 표가 없습니다. 새 설치는 schema.sql을 사용하세요.';
  end if;
end $$;

-- (이전 버전으로 만든 표에도 같은 검사가 걸리도록 다시 붙입니다)
alter table public.scenarios drop constraint if exists scenarios_data_shape;
alter table public.scenarios add constraint scenarios_data_shape check (
  coalesce(jsonb_typeof(data) = 'object', false)
  and coalesce(data ->> 'schemaVersion' in ('1', '2'), false)
  and coalesce(jsonb_typeof(data -> 'events') = 'array', false)
  and coalesce(jsonb_typeof(data -> 'endings') = 'array', false)
  and coalesce(jsonb_typeof(data -> 'stats') = 'array', false)
  and coalesce((data ->> 'schemaVersion' = '1' or (
    coalesce(data ->> 'mode', 'chronicle') in ('chronicle', 'reign')
    and (not (data ? 'map') or (jsonb_typeof(data -> 'map') = 'object'
      and jsonb_typeof(data #> '{map,templateId}') = 'string'
      and length(data #>> '{map,templateId}') > 0))
    and (coalesce(data ->> 'mode', 'chronicle') <> 'reign' or (
      jsonb_typeof(data -> 'reign') = 'object'
      and jsonb_typeof(data #> '{reign,parts}') = 'array'
      and jsonb_typeof(data #> '{reign,turns}') = 'array'
    ))
  )), false)
) not valid;

-- V2 목록의 표시 정보. 목록마다 본문 JSON을 내려받지 않도록 서버가 계산합니다.
alter table public.scenarios add column if not exists schema_version integer not null default 1;
alter table public.scenarios add column if not exists mode text not null default 'chronicle';
alter table public.scenarios add column if not exists map_template_id text;
alter table public.scenarios drop constraint if exists scenarios_schema_version_meta;
alter table public.scenarios add constraint scenarios_schema_version_meta check (schema_version in (1, 2));
alter table public.scenarios drop constraint if exists scenarios_mode_meta;
alter table public.scenarios add constraint scenarios_mode_meta check (mode in ('chronicle', 'reign'));

create or replace function public.hc_scenarios_metadata_v2() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.schema_version := case when new.data ->> 'schemaVersion' = '2' then 2 else 1 end;
  new.mode := case when new.schema_version = 2 then coalesce(new.data ->> 'mode', 'chronicle') else 'chronicle' end;
  new.map_template_id := case when new.schema_version = 2 then new.data #>> '{map,templateId}' else null end;
  return new;
end $$;
drop trigger if exists hc_scenarios_metadata_v2 on public.scenarios;
create trigger hc_scenarios_metadata_v2 before insert or update of data on public.scenarios
  for each row execute function public.hc_scenarios_metadata_v2();

-- 기존 정상 원고의 표시 정보만 보충합니다. 원고와 작성·수정 시각은 바꾸지 않습니다.
update public.scenarios set data = data
where coalesce(jsonb_typeof(data) = 'object', false)
  and coalesce(data ->> 'schemaVersion' in ('1', '2'), false)
  and coalesce(jsonb_typeof(data -> 'events') = 'array', false)
  and coalesce(jsonb_typeof(data -> 'endings') = 'array', false)
  and coalesce(jsonb_typeof(data -> 'stats') = 'array', false)
  and coalesce((data ->> 'schemaVersion' = '1' or (
    coalesce(data ->> 'mode', 'chronicle') in ('chronicle', 'reign')
    and (not (data ? 'map') or (jsonb_typeof(data -> 'map') = 'object'
      and jsonb_typeof(data #> '{map,templateId}') = 'string'
      and length(data #>> '{map,templateId}') > 0))
    and (coalesce(data ->> 'mode', 'chronicle') <> 'reign' or (
      jsonb_typeof(data -> 'reign') = 'object'
      and jsonb_typeof(data #> '{reign,parts}') = 'array'
      and jsonb_typeof(data #> '{reign,turns}') = 'array'
    ))
  )), false);


notify pgrst, 'reload schema';
commit;
