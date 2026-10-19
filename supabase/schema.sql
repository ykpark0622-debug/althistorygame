-- ============================================================================
-- 역사의 갈림길 — 시나리오 갤러리 데이터베이스
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하도록 작성했습니다(이미 있는 것은 건너뛰거나 다시 만듭니다).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 운영 설정 (숫자를 바꾼 뒤 이 부분만 다시 실행해도 됩니다)
-- ---------------------------------------------------------------------------
-- 신고가 몇 건 쌓이면 자동으로 숨길지
create or replace function public.hc_report_threshold() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;
-- 한 사람이 10분 동안 올릴 수 있는 시나리오 수 / 한 사람이 올릴 수 있는 전체 수
create or replace function public.hc_upload_limits(out per_10_min integer, out total integer)
language sql immutable set search_path = '' as $$ select 5, 50 $$;

-- ---------------------------------------------------------------------------
-- 공통 도우미
-- ---------------------------------------------------------------------------
-- 구글 등으로 로그인한 '정식' 사용자인지 (익명 사용자는 false)
create or replace function public.is_registered() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- 관리자 목록. API로는 읽거나 쓸 수 없고, SQL Editor에서만 추가합니다.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 시나리오
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name   text not null check (char_length(btrim(author_name)) between 1 and 30),
  title         text not null check (char_length(btrim(title)) between 1 and 120),
  subtitle      text not null default '' check (char_length(subtitle) <= 200),
  summary       text not null default '' check (char_length(summary) <= 1000),
  tags          text[] not null default '{}' check (cardinality(tags) <= 5),
  data          jsonb not null
                constraint scenarios_data_shape check (
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
                )
                constraint scenarios_data_size check (octet_length(data::text) <= 1048576),
  event_count   integer not null default 0,
  ending_count  integer not null default 0,
  like_count    integer not null default 0,
  play_count    integer not null default 0,
  report_count  integer not null default 0,
  status        text not null default 'public' check (status in ('public', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

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

create index if not exists scenarios_popular_idx on public.scenarios (status, like_count desc, created_at desc);
create index if not exists scenarios_recent_idx  on public.scenarios (status, created_at desc);
create index if not exists scenarios_played_idx  on public.scenarios (status, play_count desc, created_at desc);
create index if not exists scenarios_author_idx  on public.scenarios (author_id, created_at desc);
create index if not exists scenarios_tags_idx    on public.scenarios using gin (tags);

-- 올리기 기록: 지운 시나리오도 횟수 제한에 포함되도록 따로 남깁니다. API로는 볼 수 없습니다.
create table if not exists public.upload_log (
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists upload_log_user_idx on public.upload_log (user_id, created_at desc);
alter table public.upload_log enable row level security;
revoke all on public.upload_log from anon, authenticated;

create or replace function public.hc_check_upload_rate(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare recent integer; overall integer; lim record;
begin
  if p_user is null then return; end if;
  select * into lim from public.hc_upload_limits();
  select count(*) into recent from public.upload_log where user_id = p_user and created_at > now() - interval '10 minutes';
  if recent >= lim.per_10_min then
    raise exception '잠시 후 다시 올려 주세요. 10분에 %개까지 올릴 수 있습니다.', lim.per_10_min using errcode = 'P0001';
  end if;
  select count(*) into overall from public.scenarios where author_id = p_user;
  if overall >= lim.total then
    raise exception '한 사람이 올릴 수 있는 시나리오는 %개까지입니다. 예전 시나리오를 지우고 올려 주세요.', lim.total using errcode = 'P0001';
  end if;
  insert into public.upload_log (user_id) values (p_user);
end $$;
revoke execute on function public.hc_check_upload_rate(uuid) from public, anon, authenticated;

-- 저장 직전: 작성자·숫자 칸을 서버가 직접 정하고, 태그를 정리하고, 올리기 횟수를 제한합니다.
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
    new.event_count := jsonb_array_length(new.data -> 'events');
    new.ending_count := jsonb_array_length(new.data -> 'endings');
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

alter table public.scenarios enable row level security;

drop policy if exists "공개 시나리오와 내 시나리오 보기" on public.scenarios;
create policy "공개 시나리오와 내 시나리오 보기" on public.scenarios for select to anon, authenticated
  using (status = 'public' or author_id = auth.uid() or public.is_admin());

drop policy if exists "로그인한 사용자만 올리기" on public.scenarios;
create policy "로그인한 사용자만 올리기" on public.scenarios for insert to authenticated
  with check (public.is_registered() and author_id = auth.uid());

drop policy if exists "내 시나리오만 고치기" on public.scenarios;
create policy "내 시나리오만 고치기" on public.scenarios for update to authenticated
  using (author_id = auth.uid() and public.is_registered())
  with check (author_id = auth.uid());

drop policy if exists "내 시나리오 또는 관리자만 지우기" on public.scenarios;
create policy "내 시나리오 또는 관리자만 지우기" on public.scenarios for delete to authenticated
  using ((author_id = auth.uid() and public.is_registered()) or public.is_admin());

-- 숫자 칸(좋아요·플레이·신고 수)과 공개 상태는 이용자가 직접 바꿀 수 없게 칸 단위로 권한을 줍니다.
revoke all on public.scenarios from anon, authenticated;
grant select on public.scenarios to anon, authenticated;
grant insert (author_name, title, subtitle, summary, tags, data) on public.scenarios to authenticated;
grant update (author_name, title, subtitle, summary, tags, data) on public.scenarios to authenticated;
grant delete on public.scenarios to authenticated;

-- ---------------------------------------------------------------------------
-- 좋아요 (로그인하지 않은 방문자도 '익명 로그인'으로 누를 수 있음)
-- ---------------------------------------------------------------------------
create table if not exists public.likes (
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (scenario_id, user_id)
);
create index if not exists likes_user_idx on public.likes (user_id, created_at desc);
alter table public.likes enable row level security;

drop policy if exists "내 좋아요 보기" on public.likes;
create policy "내 좋아요 보기" on public.likes for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "공개 시나리오에 좋아요" on public.likes;
create policy "공개 시나리오에 좋아요" on public.likes for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.scenarios s where s.id = scenario_id and s.status = 'public'));
drop policy if exists "내 좋아요 취소" on public.likes;
create policy "내 좋아요 취소" on public.likes for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.likes from anon, authenticated;
grant select, delete on public.likes to authenticated;
grant insert (scenario_id) on public.likes to authenticated;

create or replace function public.hc_likes_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.scenarios set like_count = like_count + 1 where id = new.scenario_id;
  else
    update public.scenarios set like_count = greatest(like_count - 1, 0) where id = old.scenario_id;
  end if;
  return null;
end $$;
drop trigger if exists hc_likes_count on public.likes;
create trigger hc_likes_count after insert or delete on public.likes
  for each row execute function public.hc_likes_count();

-- ---------------------------------------------------------------------------
-- 신고 (구글 로그인 사용자만, 시나리오당 한 번, 내 시나리오는 신고 불가)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null default '' check (char_length(reason) <= 300),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (scenario_id, user_id)
);
alter table public.reports enable row level security;

drop policy if exists "내 신고 또는 관리자 보기" on public.reports;
create policy "내 신고 또는 관리자 보기" on public.reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "로그인한 사용자만 신고" on public.reports;
create policy "로그인한 사용자만 신고" on public.reports for insert to authenticated
  with check (user_id = auth.uid() and public.is_registered()
    and exists (select 1 from public.scenarios s where s.id = scenario_id and s.author_id <> auth.uid()));

revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (scenario_id, reason) on public.reports to authenticated;

create or replace function public.hc_reports_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare open_reports integer;
begin
  select count(*) into open_reports from public.reports where scenario_id = new.scenario_id and not resolved;
  update public.scenarios
     set report_count = open_reports,
         status = case when open_reports >= public.hc_report_threshold() then 'hidden' else status end
   where id = new.scenario_id;
  return null;
end $$;
drop trigger if exists hc_reports_after_insert on public.reports;
create trigger hc_reports_after_insert after insert on public.reports
  for each row execute function public.hc_reports_after_insert();

-- 신고한 계정이 삭제되면 신고 수를 다시 셉니다.
create or replace function public.hc_reports_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.scenarios
     set report_count = (select count(*) from public.reports where scenario_id = old.scenario_id and not resolved)
   where id = old.scenario_id;
  return null;
end $$;
drop trigger if exists hc_reports_after_delete on public.reports;
create trigger hc_reports_after_delete after delete on public.reports
  for each row execute function public.hc_reports_after_delete();

-- 관리자가 다시 공개한 뒤 작성자가 내용을 바꾸면, 처리 완료된 신고를 지워 같은 사람들이 다시 신고할 수 있게 합니다.
create or replace function public.hc_scenarios_after_content_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.data is distinct from old.data or new.title is distinct from old.title
     or new.subtitle is distinct from old.subtitle or new.summary is distinct from old.summary
     or new.tags is distinct from old.tags then
    delete from public.reports where scenario_id = new.id and resolved;
  end if;
  return null;
end $$;
drop trigger if exists hc_scenarios_after_content_change on public.scenarios;
create trigger hc_scenarios_after_content_change after update on public.scenarios
  for each row execute function public.hc_scenarios_after_content_change();

-- ---------------------------------------------------------------------------
-- 함수(RPC)
-- ---------------------------------------------------------------------------
-- 플레이 수 올리기: 누구나 호출 가능, 공개 시나리오만
create or replace function public.increment_play(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.scenarios set play_count = play_count + 1 where id = p_id and status = 'public';
$$;

-- 관리자: 공개/숨김 바꾸기. 다시 공개하면 기존 신고는 처리 완료로 표시하고 신고 수를 0으로 돌립니다.
create or replace function public.admin_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다.' using errcode = '42501';
  end if;
  if p_status not in ('public', 'hidden') then
    raise exception '상태는 public 또는 hidden 이어야 합니다.' using errcode = '22023';
  end if;
  if p_status = 'public' then
    update public.reports set resolved = true where scenario_id = p_id;
    update public.scenarios set status = 'public', report_count = 0 where id = p_id;
  else
    update public.scenarios set status = 'hidden' where id = p_id;
  end if;
end $$;

revoke execute on function public.admin_set_status(uuid, text) from public, anon;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.increment_play(uuid) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_registered() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- (선택) 오래된 익명 사용자 정리 — 필요할 때 아래 주석을 풀어 SQL Editor에서 실행
-- ---------------------------------------------------------------------------
-- delete from auth.users u
--  where u.is_anonymous
--    and u.created_at < now() - interval '90 days'
--    and not exists (select 1 from public.likes l where l.user_id = u.id);
