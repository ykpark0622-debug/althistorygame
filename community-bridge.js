/* Player ↔ gallery bridge. Runs after app.js on index.html only.
   - Shows gallery links when config.js has Supabase values.
   - Opens a scenario the gallery handed over (sessionStorage), keeping progress if it is the same one.
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

  const pending = read(sessionStorage, PENDING_KEY);
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  if (pending && pending.data && /^[0-9a-f-]{36}$/i.test(String(pending.id || ''))) {
    try {
      const same = hash(api.getScenario()) === hash(pending.data);
      if (!same) api.importScenario(pending.data);
      try { localStorage.setItem(ORIGIN_KEY, JSON.stringify({ id: pending.id, title: String(pending.title || ''), sig: hash(pending.data) })); } catch {}
      if (same) status(`갤러리의 「${pending.title}」을(를) 이어서 플레이합니다. 처음부터 하려면 ‘처음부터 다시’를 누르세요.`);
    } catch (error) {
      status('갤러리 시나리오를 열지 못했습니다: ' + String(error.message || error).split('\n')[0], true);
    }
  }

  function renderOrigin() {
    const old = document.getElementById('gallery-origin'); if (old) old.remove();
    if (!enabled) return;
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
})();
