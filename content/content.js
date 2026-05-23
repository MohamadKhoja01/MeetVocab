/**
 * content/content.js
 *
 * Runs on https://meet.google.com/*. Responsibilities:
 *   1. Locate Google Meet's live caption container.
 *   2. Observe it and mirror each utterance into OUR OWN floating panel,
 *      where every word is a clickable <span> (Meet rewrites its own caption
 *      DOM constantly, so we never inject into it — we render our own copy).
 *   3. On word click: capture word + sentence, look up the definition via the
 *      background worker, save to chrome.storage.local, show an inline popup,
 *      and offer native Text-to-Speech pronunciation.
 *
 * Depends on lib/store.js (loaded first by the manifest) → global `MVStore`.
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------- *
   * SELECTOR CONFIG  ── adjust here if Google Meet changes its DOM ──
   *
   * Meet's class names are obfuscated and rotate periodically. We try a list
   * of known candidates and fall back to a class-agnostic heuristic, so the
   * extension keeps working even when the specific classes change.
   * ----------------------------------------------------------------------- */
  const SEL = {
    // The scrolling region that holds all visible caption lines.
    containers: [
      '.a4cQT',
      '[jsname="dsyhDe"]',
      '[role="region"][aria-label*="aption" i]',
      'div[aria-label*="aptions" i]'
    ],
    // One node per utterance (one speaker turn). Reused/grown while speaking.
    entries: ['.nMcdL', '.TBMuR', '.CNusmb', 'span[jsname="tgaKEf"]'],
    // Speaker-name element within an entry.
    speaker: ['.NWpY1d', '.zs7s8d', '.KcIKyf'],
    // Spoken-text element within an entry.
    text: ['.bh44bd', '.iTTPOb', '.VbkSUe', 'div[jsname="tgaKEf"]', 'span']
  };

  /* ----------------------------------------------------------------------- *
   * STATE
   * ----------------------------------------------------------------------- */
  const nodeToId = new WeakMap(); // Meet DOM node -> our entry id (stable per utterance)
  const idToRec = new Map();      // id -> { id, speaker, text, timestamp }  (serializable)
  const idToRow = new Map();      // id -> our panel row element
  const order = [];               // entry ids in chronological order

  let container = null;
  let observer = null;
  let panel = null;
  let bodyEl = null;
  let persistTimer = null;
  let activePopup = null;
  let meetingId = '';             // the Google Meet session id (from the URL)

  // Remember the status by KEY (not text) so it can be re-translated on the fly.
  let statusKey = 'panel_status_init';
  let statusParams = null;

  const t = (k, p) => MVI18n.t(k, p);

  /* ----------------------------------------------------------------------- *
   * BOOTSTRAP
   * ----------------------------------------------------------------------- */
  init();

  async function init() {
    await MVI18n.init();         // UI language only — lookups stay English
    meetingId = currentMeetingId();
    await MVStore.ensureMeeting(meetingId, meetingTitle()); // record this session
    buildPanel();
    applyPanelI18n();
    watchLangChanges();          // live-update labels if language changes in the popup
    await restoreTranscript();   // continue an in-progress meeting across reloads
    primeVoices();               // warm up speechSynthesis voice list
    waitForContainer();
  }

  /** Stable id for the current meeting, taken from the Meet URL (e.g. abc-defg-hij). */
  function currentMeetingId() {
    const seg = (location.pathname || '').split('/').filter(Boolean)[0] || '';
    return seg || 'meeting';
  }

  /** Default auto title for a new meeting record: "Meeting · <local date/time>". */
  function meetingTitle() {
    return `${t('meeting_title')} · ${new Date().toLocaleString()}`;
  }

  /** Re-apply translated labels + text direction to the panel. */
  function applyPanelI18n() {
    if (!panel) return;
    panel.dir = MVI18n.isRTL() ? 'rtl' : 'ltr';
    const foot = panel.querySelector('#mv-foot');
    if (foot) foot.textContent = t('panel_footer');
    const s = panel.querySelector('#mv-status');
    if (s) s.textContent = t(statusKey, statusParams);
  }

  function watchLangChanges() {
    if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged)) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[MVStore.KEYS.LANG]) {
        MVI18n.use(changes[MVStore.KEYS.LANG].newValue); // in-memory only (no write loop)
        applyPanelI18n();
      }
    });
  }

  /** Poll until Meet's caption container appears (it only exists once CC is ON). */
  function waitForContainer() {
    const tick = setInterval(() => {
      const found = findContainer();
      if (found && found !== container) {
        container = found;
        attachObserver();
        setStatus('panel_status_detected');
      }
      if (found) clearInterval(tick);
    }, 1500);
  }

  function findContainer() {
    for (const sel of SEL.containers) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function attachObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => process());
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
    process();
  }

  /* ----------------------------------------------------------------------- *
   * CAPTION PARSING
   * ----------------------------------------------------------------------- */
  function process() {
    if (!container || !document.contains(container)) {
      // Container was torn down (e.g. captions toggled off) — re-acquire.
      container = null;
      waitForContainer();
      return;
    }

    for (const node of getEntryNodes()) {
      const { speaker, text } = extractEntry(node);
      if (!text) continue;

      let id = nodeToId.get(node);
      if (!id) {
        // New utterance.
        id = MVStore.uid();
        nodeToId.set(node, id);
        const rec = { id, speaker, text, timestamp: Date.now() };
        idToRec.set(id, rec);
        order.push(id);
        addRow(rec);
      } else {
        // Existing utterance grew or was corrected.
        const rec = idToRec.get(id);
        if (rec && (rec.text !== text || rec.speaker !== speaker)) {
          rec.text = text;
          rec.speaker = speaker;
          updateRow(rec);
        }
      }
    }
    schedulePersist();
  }

  function getEntryNodes() {
    for (const sel of SEL.entries) {
      const found = container.querySelectorAll(sel);
      if (found.length) return Array.from(found);
    }
    // Fallback: leaf-ish blocks that carry text and aren't wrappers of other blocks.
    return Array.from(container.querySelectorAll('div, span')).filter((n) => {
      const t = (n.innerText || '').trim();
      return t.length > 0 && n.querySelectorAll('div, span').length <= 2;
    });
  }

  function extractEntry(node) {
    // Preferred: dedicated speaker / text elements.
    let speaker = firstText(node, SEL.speaker);
    let text = firstText(node, SEL.text, speaker);

    // Fallback: Meet renders "Speaker\nspoken words..." — split on newline.
    if (!text) {
      const lines = (node.innerText || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length >= 2) {
        speaker = lines[0];
        text = lines.slice(1).join(' ');
      } else if (lines.length === 1) {
        text = lines[0];
      }
    }
    return { speaker: (speaker || 'Speaker').trim(), text: (text || '').trim() };
  }

  function firstText(root, selectors, exclude) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) {
        const t = (el.innerText || el.textContent || '').trim();
        if (t && t !== exclude) return t;
      }
    }
    return '';
  }

  /* ----------------------------------------------------------------------- *
   * PANEL RENDERING
   * ----------------------------------------------------------------------- */
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'mv-panel';
    panel.innerHTML = `
      <div id="mv-header">
        <span id="mv-title">MeetVocab</span>
        <span id="mv-status">Turn on captions (CC) to begin</span>
        <div id="mv-actions">
          <button id="mv-min" title="Minimize">–</button>
        </div>
      </div>
      <div id="mv-body" aria-live="polite"></div>
      <div id="mv-foot">Click any word for its English meaning.</div>
    `;
    document.body.appendChild(panel);
    bodyEl = panel.querySelector('#mv-body');

    makeDraggable(panel, panel.querySelector('#mv-header'));
    panel.querySelector('#mv-min').addEventListener('click', () => {
      panel.classList.toggle('mv-collapsed');
    });
    // Clicking empty panel space dismisses any open word popup.
    panel.addEventListener('click', (e) => {
      if (!e.target.classList.contains('mv-word')) closePopup();
    });
  }

  function setStatus(key, params) {
    statusKey = key;
    statusParams = params || null;
    const s = panel && panel.querySelector('#mv-status');
    if (s) s.textContent = t(key, params);
  }

  function addRow(rec) {
    const row = document.createElement('div');
    row.className = 'mv-row';
    row.dataset.id = rec.id;
    row.innerHTML = `<span class="mv-speaker"></span><span class="mv-text"></span>`;
    row.querySelector('.mv-speaker').textContent = rec.speaker + ': ';
    renderWords(row.querySelector('.mv-text'), rec.text);
    bodyEl.appendChild(row);
    idToRow.set(rec.id, row);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function updateRow(rec) {
    const row = idToRow.get(rec.id);
    if (!row) return addRow(rec);
    row.querySelector('.mv-speaker').textContent = rec.speaker + ': ';
    renderWords(row.querySelector('.mv-text'), rec.text);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  /**
   * Turn a string into clickable word spans. Each word stores the SENTENCE it
   * belongs to (data-sentence) so a click can capture full context.
   */
  function renderWords(target, text) {
    target.textContent = '';
    for (const sentence of splitSentences(text)) {
      for (const tok of tokenize(sentence)) {
        if (tok.type === 'word') {
          const span = document.createElement('span');
          span.className = 'mv-word';
          span.textContent = tok.value;
          span.dataset.word = cleanWord(tok.value);
          span.dataset.sentence = sentence.trim();
          span.addEventListener('click', onWordClick);
          target.appendChild(span);
        } else {
          target.appendChild(document.createTextNode(tok.value));
        }
      }
    }
  }

  function splitSentences(text) {
    const parts = text.match(/[^.!?]+[.!?]*/g);
    return parts && parts.length ? parts : [text];
  }

  function tokenize(text) {
    const tokens = [];
    const re = /([A-Za-z][A-Za-z'’-]*)|([^A-Za-z]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) tokens.push({ type: 'word', value: m[1] });
      else tokens.push({ type: 'sep', value: m[2] });
    }
    return tokens;
  }

  function cleanWord(w) {
    return w.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
  }

  /* ----------------------------------------------------------------------- *
   * WORD CLICK → lookup + save + popup
   * ----------------------------------------------------------------------- */
  async function onWordClick(e) {
    e.stopPropagation();
    const span = e.currentTarget;
    const word = span.dataset.word;
    const sentence = span.dataset.sentence;
    if (!word) return;

    openPopup(span, word); // immediate loading state

    const data = await chrome.runtime.sendMessage({ type: 'MV_LOOKUP', word });
    renderPopupData(word, data);

    // Clicking a word ADDS it (tagged with the current meeting). If it's already
    // saved, addVocab is a no-op and returns the existing id. Either way the
    // popup then shows a "saved ✓ / remove" footer so the user can undo easily.
    const sense = data.ok && data.meanings[0] ? data.meanings[0] : null;
    const translation =
      typeof MVDict !== 'undefined' ? MVDict.lookup(word, MVI18n.get()) : '';
    const res = await MVStore.addVocab({
      id: MVStore.uid(),
      word,
      sentence,
      definition: sense ? sense.definition : '(no definition found)',
      partOfSpeech: sense ? sense.partOfSpeech : '',
      example: sense ? sense.example : '',
      phonetic: data.phonetic || '',
      translation,
      meetingId,
      category: '',
      mastered: false,
      timestamp: Date.now()
    });
    span.classList.add('mv-saved');
    setPopupSaved(res.id, span);
  }

  /** Show the "saved ✓" footer with a Remove button that deletes the entry. */
  function setPopupSaved(vocabId, span) {
    if (!activePopup) return;
    const foot = activePopup.querySelector('.mv-pop-foot');
    if (!foot) return;
    foot.className = 'mv-pop-foot saved';
    foot.innerHTML = `
      <span class="mv-pop-saved-txt">${escapeHtml(t('pop_saved'))}</span>
      <button class="mv-pop-remove">${escapeHtml(t('pop_remove'))}</button>`;
    foot.querySelector('.mv-pop-remove').addEventListener('click', async () => {
      await MVStore.removeVocab(vocabId);
      if (span) span.classList.remove('mv-saved');
      foot.className = 'mv-pop-foot removed';
      foot.textContent = t('pop_removed');
    });
  }

  /* ----------------------------------------------------------------------- *
   * INLINE POPUP
   * ----------------------------------------------------------------------- */
  function openPopup(anchor, word) {
    // Capture the anchor's position BEFORE closing the current popup — when the
    // anchor is a word inside the popup itself (a definition word), closePopup
    // would detach it and getBoundingClientRect() would then return zeros.
    const rect = anchor.getBoundingClientRect();
    closePopup();
    const pop = document.createElement('div');
    pop.id = 'mv-popup';

    // Optional "Translate" button: only useful when the UI language isn't
    // English. Translation comes from the BUILT-IN offline dictionary (MVDict)
    // — no API, no network. The English definition always stays the main view.
    const canTranslate =
      MVI18n.get() !== 'en' && typeof MVDict !== 'undefined';
    const translateBtn = canTranslate
      ? `<button class="mv-pop-translate" title="${t('pop_translate')}">🌐</button>`
      : '';

    pop.innerHTML = `
      <div class="mv-pop-head">
        <span class="mv-pop-word">${escapeHtml(word)}</span>
        ${translateBtn}
        <button class="mv-pop-audio" title="${t('pop_audio_title')}">🔊</button>
        <button class="mv-pop-close" title="${t('pop_close_title')}">×</button>
      </div>
      <div class="mv-pop-trans" hidden></div>
      <div class="mv-pop-body">${t('pop_looking')}</div>
      <div class="mv-pop-foot"></div>
    `;
    pop.dir = MVI18n.isRTL() ? 'rtl' : 'ltr';
    document.body.appendChild(pop);
    activePopup = pop;

    pop.querySelector('.mv-pop-close').addEventListener('click', closePopup);
    pop.querySelector('.mv-pop-audio').addEventListener('click', () => speak(word));
    const tBtn = pop.querySelector('.mv-pop-translate');
    if (tBtn) tBtn.addEventListener('click', () => showTranslation(word));
    pop.addEventListener('click', (e) => e.stopPropagation());

    positionPopup(pop, rect);
  }

  /** Reveal the offline (local) translation of `word` in the active popup. */
  function showTranslation(word) {
    if (!activePopup) return;
    const box = activePopup.querySelector('.mv-pop-trans');
    if (!box) return;
    const tr = typeof MVDict !== 'undefined' ? MVDict.lookup(word, MVI18n.get()) : '';
    box.textContent = tr || t('pop_no_translation');
    box.classList.toggle('mv-pop-trans-empty', !tr);
    box.hidden = false;
  }

  function renderPopupData(word, data) {
    if (!activePopup) return;
    const head = activePopup.querySelector('.mv-pop-word');
    const body = activePopup.querySelector('.mv-pop-body');

    if (data.phonetic) head.textContent = `${word}  ${data.phonetic}`;

    if (!data.ok || !data.meanings.length) {
      body.innerHTML =
        data.error === 'network'
          ? `<em>${escapeHtml(t('pop_network'))}</em>`
          : `<em>${escapeHtml(t('pop_notfound', { word }))}</em>`;
      return;
    }

    // Show up to 3 senses. The definition + example are rendered with CLICKABLE
    // words: if the learner doesn't understand a word INSIDE the explanation,
    // they can click it to look it up and save it too (recursive lookup).
    body.innerHTML = '';
    data.meanings.slice(0, 3).forEach((m) => {
      const sense = document.createElement('div');
      sense.className = 'mv-sense';

      const pos = document.createElement('span');
      pos.className = 'mv-pos';
      pos.textContent = m.partOfSpeech;

      const def = document.createElement('span');
      def.className = 'mv-def';
      renderWords(def, m.definition);

      sense.append(pos, def);

      if (m.example) {
        const ex = document.createElement('div');
        ex.className = 'mv-ex';
        renderWords(ex, `“${m.example}”`);
        sense.appendChild(ex);
      }
      body.appendChild(sense);
    });
  }

  function positionPopup(pop, r) {
    const pw = 280;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + 180 > window.innerHeight) top = r.top - 186; // flip above if no room
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  function closePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }

  /* ----------------------------------------------------------------------- *
   * TEXT-TO-SPEECH  (native browser engine, English voice)
   * ----------------------------------------------------------------------- */
  function primeVoices() {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    } catch (_) {}
  }

  function speak(text) {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const en =
        voices.find((v) => /en[-_]US/i.test(v.lang)) ||
        voices.find((v) => /^en/i.test(v.lang));
      if (en) u.voice = en;
      u.lang = en ? en.lang : 'en-US';
      u.rate = 0.95;
      synth.speak(u);
    } catch (_) {}
  }

  /* ----------------------------------------------------------------------- *
   * PERSISTENCE
   * ----------------------------------------------------------------------- */
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const list = order.map((id) => idToRec.get(id)).filter(Boolean);
      MVStore.setTranscript(meetingId, list); // stored per-meeting, not one growing blob
    }, 800);
  }

  async function restoreTranscript() {
    const list = await MVStore.getTranscript(meetingId);
    for (const rec of list) {
      idToRec.set(rec.id, rec);
      order.push(rec.id);
      addRow(rec);
    }
    if (list.length) setStatus('panel_status_resumed', { n: list.length });
  }

  /* ----------------------------------------------------------------------- *
   * UTILITIES
   * ----------------------------------------------------------------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function makeDraggable(el, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      el.style.right = 'auto';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
    function onMove(e) {
      if (!dragging) return;
      el.style.left = ox + (e.clientX - sx) + 'px';
      el.style.top = oy + (e.clientY - sy) + 'px';
    }
    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }
})();
