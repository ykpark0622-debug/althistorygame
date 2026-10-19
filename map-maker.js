/* Standalone map documents share the existing territory editor, never game saves. */
(function () {
  'use strict';

  let options = { onCreateScenario: null };
  let openSequence = 0;
  async function ensureDocument(value, blank = false) {
    const templateId = value?.map?.templateId || (blank ? 'regional_eastasia_1592' : null);
    if (!templateId) return;
    if (!globalThis.MapTemplates?.get(templateId)) {
      if (!globalThis.MapTemplates?.ensure) throw new Error('지도 로더를 준비하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
      await MapTemplates.ensure(templateId);
    }
  }
  const D = () => {
    if (!globalThis.MapDocument || !globalThis.ScenarioEditor) throw new Error('지도 작업실 파일을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return globalThis.MapDocument;
  };

  function configure(next) {
    if (next && typeof next === 'object') options = { ...options, ...next };
  }

  function readRaw() {
    const api = D(); let raw;
    try { raw = localStorage.getItem(api.STORAGE_KEY); }
    catch (_) { throw new Error('브라우저의 지도 저장 공간에 접근하지 못했습니다. 새 지도를 만들고 JSON 파일로 보관하거나, 브라우저 저장소 설정을 확인해 주세요.'); }
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (error) { throw new Error('저장된 지도를 읽지 못했습니다. 저장 내용은 보존했습니다. 지도 JSON을 다시 가져오거나 새 지도를 만드세요.\n' + error.message); }
  }

  async function readStored() {
    const value = readRaw();
    if (!value) return null;
    try { await ensureDocument(value); return D().normalize(value); }
    catch (error) { throw new Error('저장된 지도를 열지 못했습니다. 저장 내용은 보존했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.\n' + error.message); }
  }

  function saveDocument(document) {
    const api = D(), normalized = api.normalize(document);
    try { localStorage.setItem(api.STORAGE_KEY, JSON.stringify(normalized)); }
    catch (_) { throw new Error('브라우저 저장 공간에 지도를 보관하지 못했습니다. “지도 JSON 내보내기”로 파일을 먼저 보관해 주세요.'); }
    return normalized;
  }

  function downloadDocument(mapDocument) {
    const normalized = D().normalize(mapDocument), text = JSON.stringify(normalized, null, 2) + '\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = documentElement('a');
    anchor.href = url;
    anchor.download = String(normalized.id || 'my-map').replace(/[^a-zA-Z0-9_-]/g, '_') + '.map.json';
    (document.querySelector('dialog[open]') || document.body).append(anchor);
    anchor.click();
    setTimeout(() => anchor.remove(), 1000);
    // Keep the Blob alive while the browser schedules the download.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function documentElement(tag) { return globalThis.document.createElement(tag); }

  async function open(document, newMap = false) {
    const request = ++openSequence;
    globalThis.ScenarioEditor?.cancelPending?.();
    const api = D(), value = newMap ? null : document === undefined ? readRaw() : document;
    const blank = newMap || (document === undefined && value === null);
    await ensureDocument(value, blank);
    if (request !== openSequence) return false;
    const mapDocument = blank ? api.create() : api.normalize(value);
    const scenario = api.toScenario(mapDocument);
    const fromDraft = draft => api.fromScenario(draft, { id: mapDocument.id });
    return ScenarioEditor.open(scenario, draft => saveDocument(fromDraft(draft)), {
      mapOnly: true,
      mapActions: {
        check(draft) { fromDraft(draft); return '지도 검사를 통과했습니다. 제목·지역·국가와 영토 배치를 확인했습니다.'; },
        save(draft) { saveDocument(fromDraft(draft)); return '이 브라우저에 지도를 저장했습니다. 다른 기기로 옮기려면 지도 JSON을 내려받거나 갤러리에 공유하세요.'; },
        export(draft) { downloadDocument(fromDraft(draft)); return '지도를 JSON 파일로 내보냈습니다. 이 파일은 지도 작업실이나 시나리오 제작에 다시 사용할 수 있습니다.'; },
        importText(text) {
          let parsed;
          try { parsed = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
          catch (_) { throw new Error('지도 JSON 문법을 확인해 주세요. 현재 지도와 저장 내용은 유지했습니다.'); }
          return importDocument(parsed);
        },
        new() { return startNew(); },
        share(draft) {
          const normalized = fromDraft(draft);
          if (new Blob([JSON.stringify(normalized)]).size > 1024 * 1024) throw new Error('갤러리에 공유하는 지도 JSON은 1MB 이하로 준비해 주세요. 파일로 내보내기는 5MB까지 가능합니다.');
          saveDocument(normalized);
          globalThis.location.assign('gallery.html?kind=map#upload');
          return '지도를 저장했습니다. 갤러리에서 설명과 공개 여부를 확인한 뒤 공유하세요.';
        },
        createScenario(draft) {
          if (typeof options.onCreateScenario !== 'function') throw new Error('시나리오 만들기를 연결하지 못했습니다. 지도를 JSON으로 내보낸 뒤 다시 열어 주세요.');
          const normalized = saveDocument(fromDraft(draft));
          const result = options.onCreateScenario(api.toScenario(normalized));
          if (result === false) return false;
          return '이 지도를 넣은 빈 시나리오를 만들었습니다.';
        }
      }
    });
  }

  function startNew() { return open(undefined, true); }
  function importDocument(document) { return open(document); }

  globalThis.MapMaker = { configure, open, startNew, importDocument, getStored: readStored, cancelPending() { ++openSequence; } };
})();
