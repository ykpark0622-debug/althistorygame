-- V2.3 지도 공유 추가. 기존 계정·원고·좋아요·신고·RLS·권한을 유지합니다.
-- 기존 설치: SQL Editor에서 이 파일 전체를 한 번 실행하세요. 재실행할 수 있습니다.
-- 새 설치: schema.sql만 실행하세요. 별도 지도 표나 Storage 버킷은 필요 없습니다.
begin;
do $$ begin
  if to_regclass('public.scenarios') is null then
    raise exception '기존 갤러리 표가 없습니다. 새 설치는 supabase/schema.sql을 사용하세요.';
  end if;
end $$;

-- Map documents are checked separately from playable scenario documents.
-- Only compact template references and editable data are shared; no SVG/HTML is executed.
create or replace function public.hc_gallery_data_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare layer_name text; layer jsonb; entry record; country jsonb;
begin
  if coalesce(jsonb_typeof(doc), '') <> 'object' then return false; end if;
  if doc ->> 'type' = 'map' then
    if not coalesce(doc -> 'schemaVersion' = '1'::jsonb, false)
      or coalesce(jsonb_typeof(doc -> 'id'), '') <> 'string' or length(btrim(doc ->> 'id')) = 0
      or coalesce(jsonb_typeof(doc -> 'title'), '') <> 'string' or length(btrim(doc ->> 'title')) not between 1 and 200
      or coalesce(jsonb_typeof(doc -> 'description'), '') <> 'string'
      or coalesce(jsonb_typeof(doc -> 'map'), '') <> 'object'
      or coalesce(jsonb_typeof(doc #> '{map,templateId}'), '') <> 'string' or length(btrim(doc #>> '{map,templateId}')) = 0
      or coalesce(jsonb_typeof(doc #> '{map,playerCountry}'), '') <> 'string'
      or coalesce(jsonb_typeof(doc #> '{map,countries}'), '') <> 'array'
      or coalesce(jsonb_typeof(doc #> '{map,initial}'), '') <> 'object' then return false; end if;
    if jsonb_array_length(doc #> '{map,countries}') > 1000 then return false; end if;
    for country in select value from jsonb_array_elements(doc #> '{map,countries}') loop
      if coalesce(jsonb_typeof(country), '') <> 'object'
        or coalesce(jsonb_typeof(country -> 'id'), '') <> 'string' or length(btrim(country ->> 'id')) = 0
        or coalesce(jsonb_typeof(country -> 'name'), '') <> 'string' or length(btrim(country ->> 'name')) = 0
        or coalesce(jsonb_typeof(country -> 'color'), '') <> 'string'
        or not coalesce(country ->> 'color' ~ '^#[0-9a-fA-F]{6}$', false) then return false; end if;
    end loop;
    foreach layer_name in array array['owners','occupation','influence','markers'] loop
      layer := doc #> array['map','initial',layer_name];
      if coalesce(jsonb_typeof(layer), '') <> 'object' then return false; end if;
      for entry in select key, value from jsonb_each(layer) loop
        if length(entry.key) = 0 then return false; end if;
        if jsonb_typeof(entry.value) <> 'string' then
          if layer_name = 'owners' or jsonb_typeof(entry.value) <> 'null' then return false; end if;
        end if;
      end loop;
    end loop;
    return true;
  end if;
  return coalesce(
    doc ->> 'schemaVersion' in ('1', '2')
    and jsonb_typeof(doc -> 'events') = 'array'
    and jsonb_typeof(doc -> 'endings') = 'array'
    and jsonb_typeof(doc -> 'stats') = 'array'
    and (doc ->> 'schemaVersion' = '1' or (
      coalesce(doc ->> 'mode', 'chronicle') in ('chronicle', 'reign')
      and (not (doc ? 'map') or (jsonb_typeof(doc -> 'map') = 'object'
        and jsonb_typeof(doc #> '{map,templateId}') = 'string'
        and length(doc #>> '{map,templateId}') > 0))
      and (coalesce(doc ->> 'mode', 'chronicle') <> 'reign' or (
        jsonb_typeof(doc -> 'reign') = 'object'
        and jsonb_typeof(doc #> '{reign,parts}') = 'array'
        and jsonb_typeof(doc #> '{reign,turns}') = 'array'))
    )), false);
end $$;

-- Derived metadata is never client-writable; every write derives it from the JSON.
alter table public.scenarios add column if not exists content_kind text not null default 'scenario';
alter table public.scenarios add column if not exists schema_version integer not null default 1;
alter table public.scenarios add column if not exists mode text not null default 'chronicle';
alter table public.scenarios add column if not exists map_template_id text;
alter table public.scenarios drop constraint if exists scenarios_content_kind_meta;
alter table public.scenarios add constraint scenarios_content_kind_meta check (content_kind in ('scenario', 'map'));
alter table public.scenarios drop constraint if exists scenarios_schema_version_meta;
alter table public.scenarios add constraint scenarios_schema_version_meta check (schema_version in (1, 2));
alter table public.scenarios drop constraint if exists scenarios_mode_meta;
alter table public.scenarios add constraint scenarios_mode_meta check (mode in ('chronicle', 'reign', 'map'));
create or replace function public.hc_scenarios_metadata_v2() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.content_kind := case when new.data ->> 'type' = 'map' then 'map' else 'scenario' end;
  new.schema_version := case when new.data ->> 'schemaVersion' = '2' then 2 else 1 end;
  new.mode := case when new.content_kind = 'map' then 'map'
    when new.schema_version = 2 then coalesce(new.data ->> 'mode', 'chronicle') else 'chronicle' end;
  new.map_template_id := case when new.content_kind = 'map' or new.schema_version = 2 then new.data #>> '{map,templateId}' else null end;
  return new;
end $$;
drop trigger if exists hc_scenarios_metadata_v2 on public.scenarios;
create trigger hc_scenarios_metadata_v2 before insert or update on public.scenarios
  for each row execute function public.hc_scenarios_metadata_v2();

alter table public.scenarios drop constraint if exists scenarios_data_shape;
alter table public.scenarios add constraint scenarios_data_shape
  check (public.hc_gallery_data_valid(data)) not valid;

create or replace function public.hc_scenarios_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  clean text[];
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.author_id := auth.uid(); end if;
    new.like_count := 0; new.play_count := 0; new.report_count := 0;
    new.status := 'public'; new.created_at := now(); new.updated_at := now();
    perform public.hc_check_upload_rate(auth.uid());
  end if;

  if tg_op = 'INSERT' or new.tags is distinct from old.tags then
    select coalesce(array_agg(t order by first_seen), '{}') into clean from (
      select btrim(x) as t, min(ord) as first_seen
        from unnest(new.tags) with ordinality as u(x, ord)
       where btrim(x) <> ''
       group by btrim(x)
    ) s;
    if exists (select 1 from unnest(clean) t where char_length(t) > 20) then
      raise exception '태그는 20자 이내로 적어 주세요.' using errcode = 'P0001';
    end if;
    if exists (select 1 from unnest(clean) t where t ~ '[,{}()"\\#]') then
      raise exception '태그에는 쉼표·괄호·따옴표·# 기호를 쓸 수 없습니다.' using errcode = 'P0001';
    end if;
    new.tags := clean;
  end if;

  if tg_op = 'INSERT' or new.data is distinct from old.data then
    if new.data ->> 'type' = 'map' then
      new.event_count := 0; new.ending_count := 0;
    else
      new.event_count := jsonb_array_length(new.data -> 'events');
      new.ending_count := jsonb_array_length(new.data -> 'endings');
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.data is distinct from old.data or new.title is distinct from old.title
      or new.subtitle is distinct from old.subtitle or new.summary is distinct from old.summary
      or new.tags is distinct from old.tags or new.author_name is distinct from old.author_name) then
    new.updated_at := now();
  end if;
  new.title := btrim(new.title);
  new.author_name := btrim(new.author_name);
  return new;
end $$;

drop trigger if exists hc_scenarios_before_write on public.scenarios;
create trigger hc_scenarios_before_write before insert or update on public.scenarios
  for each row execute function public.hc_scenarios_before_write();


-- Existing documents and creation/update timestamps remain unchanged.
update public.scenarios set data = data where public.hc_gallery_data_valid(data);

create index if not exists scenarios_kind_popular_idx on public.scenarios (content_kind, status, like_count desc, created_at desc);
create index if not exists scenarios_kind_recent_idx on public.scenarios (content_kind, status, created_at desc);
create index if not exists scenarios_kind_author_idx on public.scenarios (content_kind, author_id, created_at desc);

create or replace function public.increment_play(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.scenarios set play_count = play_count + 1
   where id = p_id and status = 'public' and content_kind = 'scenario';
$$;

notify pgrst, 'reload schema';
commit;
