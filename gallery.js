/* 시나리오 갤러리: Supabase에 시나리오를 올리고, 둘러보고, 좋아요·신고·관리합니다.
   모든 화면 글자는 escape 처리하며, 권한은 데이터베이스의 보안 규칙(RLS)이 최종 판단합니다. */
(function () {
  'use strict';
  const cfg = window.HC_COMMUNITY || {};
  const E = window.GameEngine;
  const M = window.MapDocument;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WORKING_KEY = 'history-crossroads:web:v1:scenario';
  const PENDING_KEY = 'hc:pendingImport';
  const AFTER_LOGIN_KEY = 'hc:afterLogin';
  const NAME_KEY = 'hc:authorName';
  const PAGE = 24;
  const MAX_BYTES = 1024 * 1024;
  const META = 'content_kind,id,author_id,author_name,title,subtitle,summary,tags,event_count,ending_count,like_count,play_count,report_count,status,created_at,updated_at,schema_version,mode,map_template_id';
  const SORTS = {
    popular: [['like_count', false], ['created_at', false]],
    recent: [['created_at', false]],
    played: [['play_count', false], ['created_at', false]]
  };
  const state = { kind: new URLSearchParams(location.search).get('kind') === 'map' ? 'map' : 'scenario', user: null, isAdmin: false, tab: 'all', sort: 'popular', q: '', tag: '', items: [], total: 0, liked: new Set(), loading: false, seq: 0 };
  let toastTimer;
  const noun = () => state.kind === 'map' ? '지도' : '시나리오';
  const isMap = item => item?.content_kind === 'map' || item?.type === 'map';
  function renderKind() {
    const map = state.kind === 'map';
    $('kind-select').value = state.kind;
    $('gallery-title').textContent = noun() + ' 갤러리';
    $('gallery-lead').textContent = map ? '지역과 시대, 영토와 국가를 편집한 지도를 나누세요. 마음에 드는 지도는 내 작업 공간에서 편집하고 시나리오의 바탕으로 사용할 수 있습니다.' : '연대기 이야기부터 지도와 연차별 결정을 담은 치세 시나리오까지 골라 플레이하세요. 내 이야기도 직접 올려 나눌 수 있습니다.';
    $('upload-button').textContent = '↑ 내 ' + noun() + ' 올리기';
    $('maker-link').href = map ? 'index.html?mapMaker=1' : 'index.html';
    $('maker-link').textContent = map ? '지도 만들기' : '만들기 · 플레이';
    $('sort-select').querySelector('[value="played"]').hidden = map;
    $('detail-dialog').setAttribute('aria-label', noun() + ' 자세히 보기');
    $('upload-dialog').setAttribute('aria-label', noun() + ' 올리기');
    document.title = noun() + ' 갤러리 · 역사의 갈림길';
  }

  function toast(message) { const node = $('toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3800); }
  const registered = () => Boolean(state.user && !state.user.is_anonymous);
  const displayName = user => { const m = (user && user.user_metadata) || {}; return String(m.full_name || m.name || (user && user.email ? user.email.split('@')[0] : '') || '').slice(0, 30); };
  function friendlyError(error) {
    if (!error) return '알 수 없는 오류가 났습니다.';
    const msg = String(error.message || error);
    if (/content_kind/.test(msg) && /column|schema cache/i.test(msg)) return '지도 공유를 위한 갤러리 업데이트가 필요합니다. 관리자는 supabase/migrate-v2.3-maps.sql을 적용해 주세요.';
    if (/schema_version|map_template_id/.test(msg) && /column|schema cache/i.test(msg)) return '갤러리 데이터베이스의 V2 업데이트가 필요합니다. 관리자는 supabase/migrate-v2.sql을 적용해 주세요.';
    if (error.code === '23505') return '이미 처리된 요청입니다.';
    if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) return '권한이 없습니다. 로그인 상태를 확인해 주세요.';
    if (error.code === '23514') return '저장할 수 없는 내용입니다. 시나리오·지도 형식과 크기(1 MB 이하)를 확인해 주세요.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
    if (/Anonymous sign-ins are disabled/i.test(msg)) return '익명 좋아요가 꺼져 있습니다. 구글로 로그인해 주세요.';
    return msg;
  }
  function when(iso) {
    const date = new Date(iso), diff = (Date.now() - date.getTime()) / 1000;
    if (!Number.isFinite(diff)) return '';
    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 86400 * 14) return `${Math.floor(diff / 86400)}일 전`;
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }
  function parseTags(text) {
    return Array.from(new Set(String(text || '').split(/[,#\n]/).map(t => t.replace(/[{}()"\\]/g, '').trim()).filter(Boolean))).slice(0, 5);
  }
  function checkScenario(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return '시나리오 JSON 객체가 아닙니다.';
    if (data.draft === true) return '아직 작성 중인 초안입니다. 편집기에서 ‘적용하고 새 게임’까지 마친 시나리오만 올릴 수 있습니다.';
    if (data.map?.templateId && !window.MapTemplates?.get(data.map.templateId)) return '선택한 지도 파일을 준비하는 중입니다. 잠시 후 다시 시도해 주세요.';
    const result = E.validateScenario(data);
    if (result.errors.length) return '시나리오 검사에서 문제가 있습니다.\n' + result.errors.slice(0, 8).map(e => '· ' + e).join('\n');
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_BYTES) return '갤러리에는 1 MB 이하의 시나리오만 올릴 수 있습니다.';
    return '';
  }
  function featureBadges(item) {
    if (isMap(item)) {
      const templateId = item.map_template_id || item.map?.templateId;
      const template = window.MapTemplates?.list().find(value => value.id === templateId);
      return `<span class="map-only-badge">지도</span>${templateId ? `<span class="map-badge">${esc(template?.name || templateId)}</span>` : ''}`;
    }
    const version = Number(item.schema_version || item.schemaVersion) === 2 ? 2 : 1;
    const mode = version === 2 && item.mode === 'reign' ? '치세' : '연대기';
    const templateId = version === 2 ? item.map_template_id || item.map?.templateId : null;
    const template = templateId && window.MapTemplates ? window.MapTemplates.list().find(item=>item.id===templateId) : null;
    return `<span class="format-badge">V${version}</span><span class="mode-badge">${mode}</span>${templateId ? `<span class="map-badge">지도 · ${esc(template ? template.name : templateId)}</span>` : ''}`;
  }
  function workingScenario() {
    try {
      const data = JSON.parse(localStorage.getItem(state.kind === 'map' ? (M?.STORAGE_KEY || 'hc:workingMap:v1') : WORKING_KEY));
      if (state.kind === 'map') return data ? { data, problem: checkContent(data) } : { data: null, problem: '이 브라우저에서 작업 중인 지도가 없습니다. 지도 만들기에서 저장하거나 지도 JSON을 골라 주세요.' };
      if (!data) return { data: null, problem: '이 브라우저에서 작업 중인 시나리오가 없습니다. 만들기 화면에서 시나리오를 열거나, JSON 파일을 선택해 주세요.' };
      if (Array.isArray(data.events) && !data.events.length && data.draft) return { data: null, problem: '작업 중인 시나리오가 비어 있습니다.' };
      return { data, problem: checkScenario(data) };
    } catch { return { data: null, problem: '작업 중인 시나리오를 읽을 수 없습니다.' }; }
  }
  function checkContent(data) {
    if (state.kind !== 'map') {
      if (M?.isMap(data)) return '지도 JSON입니다. 갤러리의 ‘지도’ 목록에서 올려 주세요.';
      return checkScenario(data);
    }
    if (!M?.isMap(data)) return '지도 전용 JSON이 아닙니다. 지도 만들기에서 내보낸 JSON을 선택해 주세요.';
    if (data.map?.templateId && !window.MapTemplates?.get(data.map.templateId)) return '선택한 지도 파일을 준비하는 중입니다. 잠시 후 다시 시도해 주세요.';
    const checked = M.validate(data);
    if (checked.errors.length) return '지도 검사에서 문제가 있습니다.\n' + checked.errors.slice(0, 8).map(e => '· ' + e).join('\n');
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_BYTES) return '갤러리에는 1 MB 이하의 지도만 올릴 수 있습니다.';
    return '';
  }
  async function ensureContent(data) {
    const id = data?.map?.templateId;
    if (id && !window.MapTemplates?.get(id)) {
      if (!window.MapTemplates?.ensure) throw new Error('지도 로더를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      await window.MapTemplates.ensure(id);
    }
  }

  // ---------------------------------------------------------------- setup
  renderKind();
  if (!cfg.supabaseUrl || !cfg.supabaseKey || !window.supabase) {
    const notice = $('setup-notice');
    notice.hidden = false;
    notice.innerHTML = '<h2>갤러리 설정이 필요합니다</h2><p>사이트 관리자가 <code>config.js</code>에 Supabase 주소와 공개 키를 넣으면 갤러리가 열립니다. 그 전에도 <a href="index.html">만들기 · 플레이</a>는 그대로 쓸 수 있습니다.</p>';
    $('upload-button').hidden = true;
    return;
  }
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.HCCommunity = { client };
  $('gallery-app').hidden = false;

  // ---------------------------------------------------------------- auth
  function renderAuth() {
    const area = $('auth-area');
    if (registered()) {
      area.innerHTML = `<span class="auth-name" title="${esc(state.user.email || '')}">${esc(displayName(state.user) || '로그인됨')}</span><button class="btn subtle" type="button" data-act="logout">로그아웃</button>`;
    } else {
      area.innerHTML = '<button class="btn secondary google-button" type="button" data-act="login"><span class="g-logo" aria-hidden="true">G</span> 구글로 로그인</button>';
    }
    document.querySelector('[data-tab="admin"]').hidden = !state.isAdmin;
  }
  async function refreshAdmin() {
    state.isAdmin = false;
    if (registered()) { const { data } = await client.rpc('is_admin'); state.isAdmin = data === true; }
    renderAuth();
  }
  function cleanRedirect() {
    const url = new URL(location.href);
    ['error', 'error_code', 'error_description', 'code', 'state'].forEach(k => url.searchParams.delete(k));
    url.hash = '';
    return url.href;
  }
  async function login(next) {
    if (next) sessionStorage.setItem(AFTER_LOGIN_KEY, next);
    const options = { redirectTo: cleanRedirect() };
    if (state.user && state.user.is_anonymous) {
      // 익명으로 누른 좋아요를 유지한 채 구글 계정으로 바꿉니다. 실패하면 일반 로그인으로 넘어갑니다.
      const { error } = await client.auth.linkIdentity({ provider: 'google', options });
      if (!error) return;
    }
    const { error } = await client.auth.signInWithOAuth({ provider: 'google', options });
    if (error) toast('로그인을 시작하지 못했습니다: ' + friendlyError(error));
  }
  async function ensureSession() {
    if (state.user) return state.user;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) { toast(friendlyError(error)); return null; }
    state.user = data.user;
    return state.user;
  }

  // ---------------------------------------------------------------- list
  function sanitizeSearch(text) { return String(text || '').replace(/[,()*%\\:"'.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
  function applyFilters(query) {
    query = query.eq('content_kind', state.kind);
    if (state.q) { const s = sanitizeSearch(state.q); if (s) query = query.or(`title.ilike.*${s}*,summary.ilike.*${s}*,author_name.ilike.*${s}*`); }
    if (state.tag) query = query.contains('tags', [state.tag]);
    return query;
  }
  async function load(reset) {
    const seq = ++state.seq;
    if (reset) { state.items = []; state.total = 0; }
    state.loading = true; renderList();
    try {
      let rows = [], total = 0;
      const from = state.items.length, to = from + PAGE - 1;
      if (state.tab === 'liked') {
        if (!state.user) { state.loading = false; renderList(`아직 좋아요한 ${noun()}가 없습니다.`); return; }
        // Sort and filter the whole visible liked set before pagination, not one page of likes.
        let query = applyFilters(client.from('scenarios').select(META + ',likes!inner(user_id)', { count: 'exact' }).eq('likes.user_id', state.user.id));
        SORTS[state.sort].forEach(([col, ascending]) => { query = query.order(col, { ascending }); });
        const res = await query.range(from, to);
        if (res.error) throw res.error;
        rows = res.data; total = res.count || 0;
      } else if (state.tab === 'mine' && !registered()) {
        state.loading = false; renderList('', 'login'); return;
      } else {
        let query = client.from('scenarios').select(META, { count: 'exact' });
        if (state.tab === 'all') query = query.eq('status', 'public');
        if (state.tab === 'mine') query = query.eq('author_id', state.user.id);
        if (state.tab === 'admin') query = query.or('status.eq.hidden,report_count.gt.0');
        query = applyFilters(query);
        const order = state.tab === 'admin' ? [['report_count', false], ['created_at', false]] : (state.tab === 'mine' ? SORTS.recent : SORTS[state.sort]);
        order.forEach(([col, asc]) => { query = query.order(col, { ascending: asc }); });
        const res = await query.range(from, to);
        if (res.error) throw res.error;
        rows = res.data; total = res.count || 0;
      }
      if (seq !== state.seq) return;
      state.items = state.items.concat(rows); state.total = total;
      await loadLiked(rows.map(r => r.id));
      if (state.tab === 'admin') await loadReports(rows.map(r => r.id));
      state.loading = false; renderList();
    } catch (error) {
      if (seq !== state.seq) return;
      state.loading = false; renderList(friendlyError(error), 'error');
    }
  }
  async function loadLiked(ids) {
    if (!state.user || !ids.length) return;
    const { data } = await client.from('likes').select('scenario_id').in('scenario_id', ids);
    (data || []).forEach(row => state.liked.add(row.scenario_id));
  }
  const reportsBy = new Map();
  async function loadReports(ids) {
    if (!ids.length) return;
    const { data } = await client.from('reports').select('scenario_id,reason,resolved,created_at').in('scenario_id', ids).order('created_at', { ascending: false });
    (data || []).forEach(r => { if (!reportsBy.has(r.scenario_id)) reportsBy.set(r.scenario_id, []); reportsBy.get(r.scenario_id).push(r); });
  }

  function tagChips(tags, interactive = true) {
    return (tags || []).map(t => interactive ? `<button type="button" class="tag-chip" data-act="tag" data-tag="${esc(t)}">#${esc(t)}</button>` : `<span class="tag-chip">#${esc(t)}</span>`).join('');
  }
  function likeButton(item) {
    const on = state.liked.has(item.id);
    return `<button type="button" class="like-button${on ? ' on' : ''}" data-act="like" data-id="${item.id}" aria-pressed="${on}" aria-label="좋아요 ${item.like_count}개${on ? ', 내가 누름' : ''}"><span aria-hidden="true">${on ? '♥' : '♡'}</span> ${item.like_count}</button>`;
  }
  function cardMarkup(item) {
    const hidden = item.status === 'hidden';
    const owner = state.user && item.author_id === state.user.id;
    let extra = '';
    if (state.tab === 'mine' && owner) {
      extra = `<div class="card-manage"><button type="button" class="btn subtle" data-act="edit" data-id="${item.id}">정보 수정</button><button type="button" class="btn subtle" data-act="replace" data-id="${item.id}">내용 교체</button><button type="button" class="btn subtle danger-text" data-act="delete" data-id="${item.id}">삭제</button></div>`;
    }
    if (state.tab === 'admin') {
      const reports = reportsBy.get(item.id) || [];
      extra = `<div class="card-admin"><p class="admin-reports">${reports.length ? reports.slice(0, 5).map(r => `<span class="${r.resolved ? 'resolved' : ''}">· ${esc(r.reason || '사유 없음')}${r.resolved ? ' (처리됨)' : ''}</span>`).join('') : '신고 내용 없음'}</p><div class="card-manage">${hidden ? `<button type="button" class="btn subtle" data-act="restore" data-id="${item.id}">다시 공개</button>` : `<button type="button" class="btn subtle" data-act="hide" data-id="${item.id}">숨기기</button>`}<button type="button" class="btn subtle danger-text" data-act="delete" data-id="${item.id}">삭제</button></div></div>`;
    }
    return `<article class="g-card${hidden ? ' is-hidden' : ''}">
      ${hidden ? `<p class="hidden-badge">숨김 · 신고 ${item.report_count}건${state.tab === 'mine' ? ' — 관리자 확인 전까지 다른 사람에게 보이지 않습니다' : ''}</p>` : ''}
      <button type="button" class="card-open" data-act="open" data-id="${item.id}">
        <span class="card-title">${esc(item.title)}</span>
        ${item.subtitle ? `<span class="card-sub">${esc(item.subtitle)}</span>` : ''}
        ${item.summary ? `<span class="card-summary">${esc(item.summary)}</span>` : ''}
      </button>
      <div class="card-tags">${tagChips(item.tags)}</div>
      <div class="scenario-format-badges">${featureBadges(item)}</div>
      <p class="card-meta"><span>${esc(item.author_name)}</span><span>${esc(when(item.created_at))}</span>${isMap(item) ? '<span>편집 가능한 지도 JSON</span>' : `<span>사건 ${item.event_count} · 엔딩 ${item.ending_count}</span>`}</p>
      <div class="card-actions">${hidden ? `<span class="like-static">♥ ${item.like_count}</span>` : likeButton(item)}${isMap(item) ? '' : `<span class="play-count" aria-label="플레이 ${item.play_count}회">▶ ${item.play_count}</span>`}<button type="button" class="btn primary play-button" data-act="play" data-id="${item.id}">${isMap(item) ? '지도 편집하기' : '플레이'}</button></div>
      ${extra}
    </article>`;
  }
  function renderList(message = '', kind = '') {
    const grid = $('card-grid'), status = $('list-status');
    document.querySelectorAll('.gallery-tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab)));
    $('sort-select').disabled = state.tab !== 'all' && state.tab !== 'liked';
    const filter = $('active-filter');
    filter.hidden = !state.tag && !state.q;
    filter.innerHTML = `${state.tag ? `태그 <strong>#${esc(state.tag)}</strong>` : ''}${state.tag && state.q ? ' · ' : ''}${state.q ? `검색어 <strong>${esc(state.q)}</strong>` : ''} <button type="button" class="text-button" data-act="clear-filter">필터 지우기 ×</button>`;
    if (kind === 'login') {
      grid.innerHTML = `<div class="empty-state"><h2>내가 올린 ${noun()}를 보려면 로그인하세요</h2><p>올리거나 고치려면 구글 계정으로 로그인해야 합니다. 둘러보기·열기·좋아요는 로그인 없이 됩니다.</p><button type="button" class="btn primary" data-act="login">구글로 로그인</button></div>`;
      status.textContent = ''; $('more-button').hidden = true; return;
    }
    if (kind === 'error') {
      grid.innerHTML = `<div class="empty-state error"><h2>목록을 불러오지 못했습니다</h2><p>${esc(message)}</p><button type="button" class="btn secondary" data-act="reload">다시 시도</button></div>`;
      status.textContent = ''; $('more-button').hidden = true; return;
    }
    if (!state.items.length && !state.loading) {
      const empty = message || (state.q || state.tag ? `조건에 맞는 ${noun()}가 없습니다.` : state.tab === 'mine' ? `아직 올린 ${noun()}가 없습니다.` : state.tab === 'liked' ? `아직 좋아요한 ${noun()}가 없습니다.` : state.tab === 'admin' ? `신고되거나 숨겨진 ${noun()}가 없습니다.` : `아직 올라온 ${noun()}가 없습니다. 첫 번째 ${noun()}를 올려 보세요!`);
      grid.innerHTML = `<div class="empty-state"><p>${esc(empty)}</p>${state.tab === 'all' || state.tab === 'mine' ? `<button type="button" class="btn primary" data-act="upload">내 ${noun()} 올리기</button>` : ''}</div>`;
    } else grid.innerHTML = state.items.map(cardMarkup).join('');
    status.textContent = state.loading ? '불러오는 중…' : (state.items.length ? (state.tab === 'liked' ? `좋아요한 ${noun()} ${state.items.length.toLocaleString()}개` : `${state.total.toLocaleString()}개 중 ${state.items.length.toLocaleString()}개`) : '');
    $('more-button').hidden = state.loading || state.items.length >= state.total;
  }
  function updateItem(id, patch) {
    state.items.forEach(item => { if (item.id === id) Object.assign(item, patch); });
    if (detailItem && detailItem.id === id) Object.assign(detailItem, patch);
  }

  // ---------------------------------------------------------------- actions
  async function toggleLike(id) {
    const user = await ensureSession(); if (!user) return;
    const item = state.items.find(i => i.id === id) || (detailItem && detailItem.id === id ? detailItem : null);
    const was = state.liked.has(id);
    if (was) state.liked.delete(id); else state.liked.add(id);
    if (item) updateItem(id, { like_count: Math.max(0, item.like_count + (was ? -1 : 1)) });
    rerender();
    const res = was ? await client.from('likes').delete().eq('scenario_id', id) : await client.from('likes').insert({ scenario_id: id });
    if (res.error && !(res.error.code === '23505' && !was)) {
      if (was) state.liked.add(id); else state.liked.delete(id);
      if (item) updateItem(id, { like_count: Math.max(0, item.like_count + (was ? 1 : -1)) });
      rerender(); toast('좋아요를 저장하지 못했습니다: ' + friendlyError(res.error));
    }
  }
  let playSequence = 0;
  async function play(id) {
    const kind = state.kind, request = ++playSequence;
    toast(`${noun()}를 불러오는 중입니다…`);
    const { data, error } = await client.from('scenarios').select('id,title,data,content_kind').eq('content_kind', state.kind).eq('id', id).single();
    if (error) { toast('불러오지 못했습니다: ' + friendlyError(error)); return; }
    if (state.kind !== kind || request !== playSequence) return;
    try { await ensureContent(data.data); }
    catch (loadError) { toast('지도를 불러오지 못했습니다. 다시 눌러 시도해 주세요. ' + friendlyError(loadError)); return; }
    if (state.kind !== kind || request !== playSequence) return;
    if (data.content_kind === 'map') {
      const problem = checkContent(data.data);
      if (problem) { toast(problem); return; }
      try { sessionStorage.setItem('hc:pendingMapImport', JSON.stringify({ id: data.id, title: data.title, data: M.normalize(data.data) })); }
      catch { toast('브라우저 저장 공간이 부족해 지도를 열 수 없습니다.'); return; }
      location.href = 'index.html?mapMaker=1'; return;
    }
    const problem = E.validateScenario(data.data).errors;
    if (problem.length) { toast('이 시나리오는 현재 프로그램에서 열 수 없습니다.'); return; }
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: data.id, title: data.title, data: data.data })); }
    catch { toast('브라우저 저장 공간이 부족해 열 수 없습니다.'); return; }
    const today = new Date().toISOString().slice(0, 10), playedKey = 'hc:played:' + id;
    let counted = null; try { counted = localStorage.getItem(playedKey); } catch {}
    if (counted !== today) { await client.rpc('increment_play', { p_id: id }); try { localStorage.setItem(playedKey, today); } catch {} }
    location.href = 'index.html';
  }
  async function downloadJSON(id) {
    const { data, error } = await client.from('scenarios').select('title,data').eq('content_kind', state.kind).eq('id', id).single();
    if (error) { toast(friendlyError(error)); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = (data.title || 'scenario').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copyLink(id) {
    const url = new URL('gallery.html', location.href); url.search = '?kind=' + state.kind + '&id=' + id;
    try { await navigator.clipboard.writeText(url.href); toast('링크를 복사했습니다.'); }
    catch { prompt('이 링크를 복사하세요', url.href); }
  }
  async function removeScenario(id) {
    const item = state.items.find(i => i.id === id) || detailItem;
    if (!confirm(`「${item ? item.title : '이 ' + noun()}」을(를) 갤러리에서 지울까요? 좋아요와 기록도 함께 사라지며 되돌릴 수 없습니다.`)) return;
    const { data, error } = await client.from('scenarios').delete().eq('content_kind', state.kind).eq('id', id).select('id');
    if (error || !data.length) { toast('지우지 못했습니다: ' + friendlyError(error || '권한이 없습니다.')); return; }
    state.items = state.items.filter(i => i.id !== id); state.total = Math.max(0, state.total - 1);
    if ($('detail-dialog').open) $('detail-dialog').close();
    renderList(); toast('삭제했습니다.');
  }
  async function setStatus(id, status) {
    const { error } = await client.rpc('admin_set_status', { p_id: id, p_status: status });
    if (error) { toast(friendlyError(error)); return; }
    toast(status === 'public' ? '다시 공개했습니다.' : '숨겼습니다.');
    reportsBy.clear(); load(true);
  }

  // ---------------------------------------------------------------- detail
  let detailItem = null;
  let detailSequence = 0;
  async function openDetail(id, fromLink = false) {
    const request = ++detailSequence, kind = state.kind;
    let item = state.items.find(i => i.id === id);
    if (!item) {
      const { data, error } = await client.from('scenarios').select(META).eq('content_kind', state.kind).eq('id', id).maybeSingle();
      if (error || !data) { toast(fromLink ? '링크의 ' + noun() + '를 찾을 수 없습니다. 지워졌거나 숨겨졌을 수 있습니다.' : friendlyError(error)); return; }
      item = data; await loadLiked([id]);
    }
    if (request !== detailSequence || kind !== state.kind) return;
    detailItem = item; renderDetail();
    const dialog = $('detail-dialog'); if (!dialog.open) dialog.showModal();
    const url = new URL(location.href); url.searchParams.set('id', id); url.searchParams.set('kind', state.kind); history.replaceState(null, '', url);
  }
  function renderDetail() {
    const item = detailItem; if (!item) return;
    const hidden = item.status === 'hidden';
    const owner = state.user && item.author_id === state.user.id;
    $('detail-content').innerHTML = `<p class="eyebrow">${esc(item.author_name)} · ${esc(when(item.created_at))}${item.updated_at && item.updated_at !== item.created_at ? ` (수정 ${esc(when(item.updated_at))})` : ''}</p>
      <h2>${esc(item.title)}</h2>${item.subtitle ? `<p class="detail-sub">${esc(item.subtitle)}</p>` : ''}
      <div class="scenario-format-badges">${featureBadges(item)}</div>
      ${hidden ? '<p class="hidden-badge">신고가 쌓여 숨겨진 게시물입니다.</p>' : ''}
      <div class="card-tags">${tagChips(item.tags)}</div>
      ${item.summary ? `<p class="detail-summary">${esc(item.summary)}</p>` : ''}
      ${isMap(item) ? '<div class="gallery-map-preview" id="gallery-map-preview"><p class="g-help">지도를 불러오는 중…</p></div>' : ''}<dl class="detail-stats">${isMap(item) ? '' : `<div><dt>사건</dt><dd>${item.event_count}</dd></div><div><dt>엔딩</dt><dd>${item.ending_count}</dd></div><div><dt>플레이</dt><dd>${item.play_count}</dd></div>`}<div><dt>좋아요</dt><dd>${item.like_count}</dd></div></dl>
      <div class="detail-actions"><button type="button" class="btn primary" data-act="play" data-id="${item.id}">${isMap(item) ? '지도 편집하기' : '▶ 플레이'}</button>${hidden ? '' : likeButton(item)}<button type="button" class="btn secondary" data-act="copy-link" data-id="${item.id}">링크 복사</button><button type="button" class="btn secondary" data-act="download" data-id="${item.id}">JSON 받기</button></div>
      <div class="detail-footer">${owner ? `<button type="button" class="text-button" data-act="edit" data-id="${item.id}">정보 수정</button><button type="button" class="text-button" data-act="replace" data-id="${item.id}">내용 교체</button><button type="button" class="text-button danger-text" data-act="delete" data-id="${item.id}">삭제</button>` : `<button type="button" class="text-button" data-act="report" data-id="${item.id}">신고하기</button>`}<button type="button" class="btn secondary" data-act="close-detail">닫기</button></div>`;
    if (isMap(item)) renderMapPreview(item);
  }
  const mapPreviewCache = new Map();
  async function renderMapPreview(item) {
    const holder = $('gallery-map-preview'); if (!holder || !isMap(item)) return;
    try {
      let data = mapPreviewCache.get(item.id);
      if (!data) {
        const res = await client.from('scenarios').select('data').eq('content_kind', 'map').eq('id', item.id).single();
        if (detailItem?.id !== item.id || !holder.isConnected) return;
        if (res.error) throw res.error;
        if (!res.data) throw new Error('지도 내용을 찾을 수 없습니다.');
        await ensureContent(res.data.data);
        if (detailItem?.id !== item.id || !holder.isConnected) return;
        data = M.normalize(res.data.data); mapPreviewCache.set(item.id, data);
      }
      if (detailItem?.id === item.id && holder.isConnected) window.MapView.render(holder, {id:data.id,map:data.map}, null);
    } catch (error) {
      if (detailItem?.id !== item.id || !holder.isConnected) return;
      holder.replaceChildren();
      const message = document.createElement('p'); message.className = 'g-help'; message.textContent = '지도 미리보기를 불러오지 못했습니다. ' + friendlyError(error);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn secondary'; retry.textContent = '지도 다시 불러오기'; retry.onclick = () => { holder.textContent = '지도를 불러오는 중…'; renderMapPreview(item); };
      holder.append(message, retry);
    }
  }
  function rerender() { renderList(); if ($('detail-dialog').open) renderDetail(); }

  // ---------------------------------------------------------------- upload / edit / replace
  const upload = { mode: 'new', id: null, source: 'working', fileData: null, fileName: '', error: '', busy: false, checking: false, request: 0, done: null, touched: new Set() };
  function openUpload(mode = 'new', id = null) {
    ++upload.request;
    Object.assign(upload, { mode, id, source: 'working', fileData: null, fileName: '', fileProblem: '', pendingFile: null, error: '', busy: false, checking: false, done: null, touched: new Set() });
    if (!workingScenario().data) upload.source = 'file';
    renderUpload();
    const dialog = $('upload-dialog'); if (!dialog.open) dialog.showModal();
    if (mode !== 'edit' && registered()) prepareUploadSource();
  }
  async function prepareUploadSource() {
    const request = ++upload.request, kind = state.kind;
    const pendingFile = upload.source === 'file' && upload.pendingFile;
    const picked = upload.source === 'file' ? pendingFile?.data || upload.fileData : workingScenario().data;
    if (!picked) { upload.checking = false; renderUploadKeepFields(); return; }
    upload.checking = true; upload.error = ''; renderUploadKeepFields();
    try {
      await ensureContent(picked);
      if (request !== upload.request || kind !== state.kind || !$('upload-dialog').open) return;
      upload.error = checkContent(picked);
      if (upload.source === 'file') upload.fileProblem = upload.error;
      if (!upload.error && pendingFile) { upload.fileData = pendingFile.data; upload.fileName = pendingFile.name; upload.pendingFile = null; }
    } catch (error) {
      if (request !== upload.request || kind !== state.kind || !$('upload-dialog').open) return;
      upload.error = '지도를 불러오지 못했습니다. 입력한 내용은 유지했습니다. 다시 시도해 주세요. ' + friendlyError(error);
    }
    if (request === upload.request && kind === state.kind && $('upload-dialog').open) { upload.checking = false; renderUploadKeepFields(); }
  }
  function chosenData() {
    if (upload.source === 'file' && upload.fileProblem) return { data: null, problem: upload.fileProblem };
    if (upload.source === 'file' && upload.pendingFile) return { data: null, problem: '새 파일의 지도 확인이 끝나지 않았습니다. 다시 불러오거나 다른 파일을 선택해 주세요.' };
    if (upload.source === 'file') return upload.fileData ? { data: upload.fileData, problem: checkContent(upload.fileData) } : { data: null, problem: 'JSON 파일을 선택해 주세요.' };
    return workingScenario();
  }
  function renderUpload() {
    const box = $('upload-content');
    const titles = { new: noun() + ' 올리기', edit: noun() + ' 정보 수정', replace: noun() + ' 내용 교체' };
    if (!registered()) {
      box.innerHTML = `<h2>${titles[upload.mode]}</h2><p class="g-help">${noun()}를 올리려면 구글 계정으로 로그인해야 합니다. 로그인하면 다른 기기에서도 내가 올린 내용을 고치거나 지울 수 있습니다.</p><div class="dialog-actions"><button type="button" class="btn secondary" data-act="close-upload">취소</button><button type="button" class="btn primary" data-act="login-upload">구글로 로그인</button></div>`;
      return;
    }
    if (upload.done) {
      box.innerHTML = `<h2>올렸습니다!</h2><p class="g-help">「${esc(upload.done.title)}」이(가) 갤러리에 공개되었습니다. 링크를 복사해 친구에게 보내 보세요.</p><div class="dialog-actions"><button type="button" class="btn secondary" data-act="copy-link" data-id="${upload.done.id}">링크 복사</button><button type="button" class="btn primary" data-act="view-new" data-id="${upload.done.id}">갤러리에서 보기</button></div>`;
      return;
    }
    const item = upload.id ? state.items.find(i => i.id === upload.id) || detailItem : null;
    const picked = upload.mode === 'edit' ? { data: null, problem: '' } : chosenData();
    const base = picked.data || {};
    const lastName = (() => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } })();
    const meta = upload.mode === 'new'
      ? { title: String(base.title || '').slice(0, 120), subtitle: base.subtitle || '', summary: String(base.description || '').slice(0, 1000), tags: '', author: lastName || displayName(state.user) }
      : { title: item ? item.title : '', subtitle: item ? item.subtitle : '', summary: item ? item.summary : '', tags: item ? (item.tags || []).join(', ') : '', author: item ? item.author_name : '' };
    const working = workingScenario();
    const sourceBlock = upload.mode === 'edit' ? '' : `<fieldset class="source-pick"><legend>${upload.mode === 'replace' ? '새 내용' : '올릴 ' + noun()}</legend>
        <label class="source-option${working.data ? '' : ' disabled'}"><input type="radio" name="up-source" value="working" ${upload.source === 'working' ? 'checked' : ''} ${working.data ? '' : 'disabled'}><span><strong>지금 작업 중인 ${noun()}</strong><small>${working.data ? `「${esc(working.data.title)}」${state.kind === 'map' ? ' · 지도 전용' : ` · 사건 ${(working.data.events || []).length}개 · 엔딩 ${(working.data.endings || []).length}개`}` : esc(working.problem)}</small>${working.data ? `<span class="scenario-format-badges">${featureBadges(working.data)}</span>` : ''}</span></label>
        <label class="source-option"><input type="radio" name="up-source" value="file" ${upload.source === 'file' ? 'checked' : ''}><span><strong>JSON 파일 선택</strong><small>${upload.fileName ? esc(upload.fileName) : '내보내기로 저장한 ' + noun() + ' 파일'}</small></span></label>
        ${upload.source === 'file' ? '<button type="button" class="btn secondary" data-act="pick-file">파일 고르기</button>' : ''}
        ${upload.source === 'file' && picked.data ? `<div class="scenario-format-badges">${featureBadges(picked.data)}</div>` : ''}
        ${picked.problem && !upload.error ? `<p class="form-error">${esc(picked.problem)}</p>` : ''}
      </fieldset>`;
    const metaBlock = upload.mode === 'replace' ? `<p class="g-help">「${esc(meta.title)}」의 ${state.kind === 'map' ? '지도' : '사건·선택지·엔딩'}를 새 내용으로 바꿉니다. 좋아요와 기록은 그대로 유지됩니다.</p>` : `
      <label class="field"><span>제목 <small>필수 · 120자 이내</small></span><input id="up-title" maxlength="120" required value="${esc(meta.title)}"></label>
      <label class="field"><span>부제</span><input id="up-subtitle" maxlength="200" value="${esc(meta.subtitle)}"></label>
      <label class="field"><span>소개 <small>갤러리 카드에 보입니다 · 1000자 이내</small></span><textarea id="up-summary" rows="4" maxlength="1000">${esc(meta.summary)}</textarea></label>
      <div class="field-row"><label class="field"><span>작가 이름 <small>필수</small></span><input id="up-author" maxlength="30" required value="${esc(meta.author)}"></label>
      <label class="field"><span>태그 <small>쉼표로 구분 · 5개까지</small></span><input id="up-tags" maxlength="120" placeholder="조선, 임진왜란" value="${esc(meta.tags)}"></label></div>`;
    const consent = upload.mode === 'new' ? '<label class="consent"><input type="checkbox" id="up-consent"> 남의 글이나 작품을 허락 없이 옮기지 않았고, 누구나 볼 수 있게 공개해도 되는 내용입니다.</label>' : '';
    box.innerHTML = `<h2>${titles[upload.mode]}</h2><form id="upload-form" novalidate>${sourceBlock}${metaBlock}${consent}
      <p class="form-error" id="upload-error" role="alert" ${upload.error ? '' : 'hidden'}>${esc(upload.error)}</p>
      <div class="dialog-actions"><button type="button" class="btn secondary" data-act="close-upload">취소</button>${upload.error && upload.mode !== 'edit' ? '<button type="button" class="btn secondary" data-act="retry-upload">지도 다시 불러오기</button>' : ''}<button type="submit" class="btn primary" ${upload.busy || upload.checking ? 'disabled' : ''}>${upload.checking ? '지도 파일 확인 중…' : upload.busy ? '저장하는 중…' : upload.mode === 'new' ? '갤러리에 올리기' : '저장'}</button></div></form>`;
  }
  async function submitUpload() {
    if (upload.checking) return;
    const fail = message => { upload.error = message; upload.busy = false; renderUploadKeepFields(); };
    const val = id => ($(id) ? $(id).value : '');
    let payload = {};
    if (upload.mode !== 'replace') {
      payload = { title: val('up-title').trim(), subtitle: val('up-subtitle').trim(), summary: val('up-summary').trim(), author_name: val('up-author').trim(), tags: parseTags(val('up-tags')) };
      if (!payload.title) return fail('제목을 적어 주세요.');
      if (!payload.author_name) return fail('작가 이름을 적어 주세요.');
      if (payload.tags.some(t => t.length > 20)) return fail('태그는 하나에 20자 이내로 적어 주세요.');
    }
    if (upload.mode !== 'edit') {
      const picked = chosenData();
      if (!picked.data || picked.problem) return fail(picked.problem || '올릴 ' + noun() + '를 골라 주세요.');
      payload.data = state.kind === 'map' ? M.normalize(picked.data) : picked.data;
    }
    if (upload.mode === 'new' && !$('up-consent').checked) return fail('공개 동의에 체크해 주세요.');
    upload.busy = true; upload.error = ''; renderUploadKeepFields();
    let res;
    if (upload.mode === 'new') res = await client.from('scenarios').insert(payload).select(META).single();
    else res = await client.from('scenarios').update(payload).eq('content_kind', state.kind).eq('id', upload.id).select(META).single();
    if (res.error) return fail(friendlyError(res.error));
    try { if (payload.author_name) localStorage.setItem(NAME_KEY, payload.author_name); } catch {}
    upload.busy = false;
    if (upload.mode === 'new') { upload.done = res.data; renderUpload(); if (state.tab === 'all' || state.tab === 'mine') load(true); return; }
    mapPreviewCache.delete(res.data.id); updateItem(res.data.id, res.data); rerender();
    $('upload-dialog').close(); toast(upload.mode === 'edit' ? '정보를 수정했습니다.' : '내용을 교체했습니다.');
  }
  // Re-render the dialog, keeping what the person typed. Title/subtitle/summary follow the chosen
  // scenario until the person edits them; author and tags are always kept.
  function renderUploadKeepFields() {
    const keep = {}; ['up-title', 'up-subtitle', 'up-summary', 'up-author', 'up-tags'].forEach(id => {
      if ($(id) && (upload.mode !== 'new' || upload.touched.has(id) || id === 'up-author' || id === 'up-tags')) keep[id] = $(id).value;
    });
    const consent = $('up-consent') ? $('up-consent').checked : false;
    renderUpload();
    Object.entries(keep).forEach(([id, v]) => { if ($(id)) $(id).value = v; });
    if ($('up-consent')) $('up-consent').checked = consent;
  }

  // ---------------------------------------------------------------- report
  let reportId = null;
  function openReport(id) {
    reportId = id;
    if (!registered()) {
      $('report-content').innerHTML = '<h2>신고하기</h2><p class="g-help">장난 신고를 막기 위해 신고는 구글 로그인 후에 할 수 있습니다.</p><div class="dialog-actions"><button type="button" class="btn secondary" data-act="close-report">취소</button><button type="button" class="btn primary" data-act="login-report">구글로 로그인</button></div>';
    } else {
      $('report-content').innerHTML = '<h2>신고하기</h2><p class="g-help">혐오·폭력 조장, 개인정보 노출, 무단 전재 등 문제가 있는 게시물을 알려 주세요. 여러 사람이 신고하면 자동으로 숨겨지고 관리자가 확인합니다.</p><form id="report-form"><label class="field"><span>사유</span><textarea id="report-reason" rows="3" maxlength="300" required placeholder="어떤 점이 문제인지 짧게 적어 주세요"></textarea></label><div class="dialog-actions"><button type="button" class="btn secondary" data-act="close-report">취소</button><button type="submit" class="btn primary">신고</button></div></form>';
    }
    const dialog = $('report-dialog'); if (!dialog.open) dialog.showModal();
  }
  async function submitReport() {
    const reason = $('report-reason').value.trim();
    if (!reason) { $('report-reason').focus(); return; }
    const { error } = await client.from('reports').insert({ scenario_id: reportId, reason });
    $('report-dialog').close();
    if (error) toast(error.code === '23505' ? '이미 신고한 게시물입니다.' : '신고하지 못했습니다: ' + friendlyError(error));
    else toast('신고를 접수했습니다. 확인해 주셔서 고맙습니다.');
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-act]'); if (!target) return;
    const act = target.dataset.act, id = target.dataset.id;
    const actions = {
      login: () => login(), logout: async () => { await client.auth.signOut(); state.user = null; state.isAdmin = false; state.liked.clear(); if (state.tab === 'admin' || state.tab === 'mine') state.tab = 'all'; renderAuth(); load(true); },
      open: () => openDetail(id), play: () => play(id), like: () => toggleLike(id), tag: () => { state.tag = target.dataset.tag; if ($('detail-dialog').open) $('detail-dialog').close(); load(true); },
      'clear-filter': () => { state.tag = ''; state.q = ''; $('search-input').value = ''; load(true); }, reload: () => load(true),
      upload: () => openUpload('new'), edit: () => openUpload('edit', id), replace: () => openUpload('replace', id), delete: () => removeScenario(id),
      restore: () => setStatus(id, 'public'), hide: () => setStatus(id, 'hidden'),
      'copy-link': () => copyLink(id), download: () => downloadJSON(id), report: () => openReport(id),
      'close-detail': () => $('detail-dialog').close(), 'close-upload': () => $('upload-dialog').close(), 'close-report': () => $('report-dialog').close(),
      'login-upload': () => login('upload'), 'login-report': () => login('report:' + reportId),
      'pick-file': () => { const input = $('upload-file'); input.value = ''; input.click(); },
      'retry-upload': () => prepareUploadSource(),
      'view-new': () => { $('upload-dialog').close(); openDetail(id); }
    };
    if (actions[act]) { event.preventDefault(); actions[act](); }
  });
  $('kind-select').addEventListener('change', event => {
    ++playSequence; ++detailSequence;
    state.kind = event.target.value === 'map' ? 'map' : 'scenario';
    if ($('detail-dialog').open) $('detail-dialog').close();
    if ($('upload-dialog').open) $('upload-dialog').close();
    state.sort = state.kind === 'map' && state.sort === 'played' ? 'popular' : state.sort;
    $('sort-select').value = state.sort; reportsBy.clear();
    const url = new URL(location.href); url.searchParams.set('kind', state.kind); url.searchParams.delete('id'); history.replaceState(null, '', url);
    renderKind(); load(true);
  });
  $('upload-button').addEventListener('click', () => openUpload('new'));
  $('more-button').addEventListener('click', () => load(false));
  document.querySelectorAll('.gallery-tab').forEach(tab => tab.addEventListener('click', () => { state.tab = tab.dataset.tab; reportsBy.clear(); load(true); }));
  $('sort-select').addEventListener('change', event => { state.sort = event.target.value; load(true); });
  $('gallery-toolbar').addEventListener('submit', event => { event.preventDefault(); state.q = $('search-input').value.trim(); load(true); });
  document.addEventListener('change', event => {
    if (event.target.name === 'up-source') { upload.source = event.target.value; upload.error = ''; renderUploadKeepFields(); prepareUploadSource(); }
  });
  $('upload-file').addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const request = ++upload.request, kind = state.kind;
    upload.checking = true; upload.error = ''; upload.fileProblem = ''; renderUploadKeepFields();
    try {
      if (file.size > MAX_BYTES) throw new Error('갤러리에는 1 MB 이하의 ' + noun() + '만 올릴 수 있습니다.');
      let data;
      try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, '')); }
      catch { throw new Error('올바른 JSON 파일이 아닙니다.'); }
      if (request !== upload.request || kind !== state.kind || !$('upload-dialog').open) return;
      upload.pendingFile = { data, name: file.name };
      await ensureContent(data);
      if (request !== upload.request || kind !== state.kind || !$('upload-dialog').open) return;
      const problem = checkContent(data); if (problem) throw new Error(problem);
      upload.fileName = file.name; upload.fileData = data; upload.pendingFile = null; upload.fileProblem = '';
    } catch (error) {
      if (request !== upload.request || kind !== state.kind || !$('upload-dialog').open) return;
      upload.fileProblem = friendlyError(error);
      upload.error = upload.fileProblem + ' 이전에 선택한 파일과 작성한 설명은 유지했습니다.';
    }
    if (request === upload.request && kind === state.kind && $('upload-dialog').open) { upload.checking = false; renderUploadKeepFields(); }
  });
  $('upload-content').addEventListener('input', event => { if (/^up-(title|subtitle|summary)$/.test(event.target.id)) upload.touched.add(event.target.id); });
  document.addEventListener('submit', event => {
    if (event.target.id === 'upload-form') { event.preventDefault(); if (!upload.busy) submitUpload(); }
    if (event.target.id === 'report-form') { event.preventDefault(); submitReport(); }
  });
  $('detail-dialog').addEventListener('close', () => { ++detailSequence; const url = new URL(location.href); url.searchParams.delete('id'); history.replaceState(null, '', url); detailItem = null; });
  $('upload-dialog').addEventListener('close', () => { ++upload.request; upload.checking = false; });

  // ---------------------------------------------------------------- start
  (async function start() {
    const params = new URLSearchParams(location.search), hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorText = params.get('error_description') || hashParams.get('error_description');
    if (errorCode || params.get('error')) history.replaceState(null, '', cleanRedirect());
    const { data } = await client.auth.getSession();
    state.user = data.session ? data.session.user : null;
    if (errorCode === 'identity_already_exists') { await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: cleanRedirect() } }); return; }
    if (errorCode || params.get('error')) toast('로그인하지 못했습니다' + (errorText ? ': ' + errorText : '.'));
    await refreshAdmin();
    client.auth.onAuthStateChange((event, session) => {
      const before = state.user && state.user.id;
      state.user = session ? session.user : null;
      if ((state.user && state.user.id) !== before || event === 'USER_UPDATED') { refreshAdmin(); }
    });
    await load(true);
    let after = null; try { after = sessionStorage.getItem(AFTER_LOGIN_KEY); sessionStorage.removeItem(AFTER_LOGIN_KEY); } catch {}
    const linkId = params.get('id');
    if (linkId && /^[0-9a-f-]{36}$/i.test(linkId)) await openDetail(linkId, true);
    if (registered() && after === 'upload') openUpload('new');
    else if (registered() && after && after.startsWith('report:')) openReport(after.slice(7));
    else if (location.hash === '#upload') { history.replaceState(null, '', location.pathname + location.search); openUpload('new'); }
  })();
})();
