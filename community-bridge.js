/* Player ↔ gallery bridge. Runs after app.js on index.html only.
   - Shows gallery links when config.js has Supabase values.
   - Opens a scenario only for an explicit gallery play URL and matching handoff.
   - Shows a "from the gallery" line while that scenario is open. No network access here. */
(function () {
  'use strict';
  const cfg = window.HC_COMMUNITY || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
  document.body.classList.toggle('community-on', enabled);
  const api = window.HistoryCrossroads;
  if (!api) return;
  const PENDING_KEY = 'hc:pendingImport', ORIGIN_KEY = 'hc:galleryOrigin';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = value => { let h = 2166136261; for (const c of JSON.stringify(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
  const status = (message, error = false) => { const node = document.getElementById('status-message'); if (!node) return; node.textContent = message; node.classList.toggle('error', error); node.hidden = !message; };
  const clearPlayRequest = () => {
    try { const url = new URL(location.href); if (!url.searchParams.has('galleryImport')) return; url.searchParams.delete('galleryImport'); window.history?.replaceState(null, '', url.href); } catch {}
  };

  async function applyPendingImport() {
    await api.ready;
    const url = new URL(location.href), requested = url.searchParams.get('galleryImport');
    // A failed handoff stays available for retry, but its mere presence must
    // never navigate away from home, the map workshop, or an ordinary visit.
    if (url.searchParams.get('home') === '1' || url.searchParams.get('mapMaker') === '1') { clearPlayRequest(); return; }
    if (!requested) return;
    const pending = read(sessionStorage, PENDING_KEY);
    if (!pending || !pending.data || !/^[0-9a-f-]{36}$/i.test(String(pending.id || '')) || requested !== pending.id) {
      clearPlayRequest(); return;
    }
    try {
      const sig = hash(pending.data), same = hash(api.getScenario()) === sig;
      if (!same) {
        const imported = await api.importScenario(pending.data);
        if (!imported || hash(api.getScenario()) !== sig) return;
      } else if (typeof api.resumeScenario === 'function') {
        const resumed = await api.resumeScenario();
        if (!resumed || hash(api.getScenario()) !== sig) return;
      }
      // Keep the handoff available after a failed map fetch. Only a completed
      // import may consume it, and never consume a newer gallery handoff.
      const current = read(sessionStorage, PENDING_KEY);
      if (current?.id === pending.id && current.data && hash(current.data) === sig) {
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
      }
      clearPlayRequest();
      try { localStorage.setItem(ORIGIN_KEY, JSON.stringify({ id: pending.id, title: String(pending.title || ''), sig })); } catch {}
      if (same) status(`갤러리의 「${pending.title}」을(를) 이어서 플레이합니다. 처음부터 하려면 ‘처음부터’를 누르세요.`);
      renderOrigin();
    } catch (error) {
      status('갤러리 시나리오를 열지 못했습니다. 현재 작업과 갤러리 원고는 보존했습니다. 새로고침하면 다시 시도합니다: ' + String(error.message || error).split('\n')[0], true);
    }
  }

  function renderOrigin() {
    const old = document.getElementById('gallery-origin'); if (old) old.remove();
    if (!enabled || document.body.classList.contains('is-home')) return;
    const origin = read(localStorage, ORIGIN_KEY);
    if (!origin || !/^[0-9a-f-]{36}$/i.test(String(origin.id || '')) || origin.sig !== hash(api.getScenario())) return;
    const box = document.createElement('div');
    box.id = 'gallery-origin'; box.className = 'gallery-origin';
    box.innerHTML = `<span aria-hidden="true">✦</span><span>갤러리 시나리오 「${esc(origin.title)}」</span><a href="gallery.html?id=${esc(origin.id)}">갤러리에서 좋아요 · 공유하기 →</a>`;
    const heading = document.querySelector('.scenario-heading');
    if (heading) heading.insertAdjacentElement('afterend', box);
  }
  renderOrigin();
  const title = document.getElementById('scenario-title');
  if (title) new MutationObserver(renderOrigin).observe(title, { childList: true, characterData: true, subtree: true });
  void applyPendingImport().catch(error => status('갤러리 시나리오를 준비하지 못했습니다: ' + String(error.message || error).split('\n')[0], true));
})();
