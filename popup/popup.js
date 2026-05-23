/**
 * popup/popup.js — dashboard logic.
 *   - Words tab: saved vocabulary with category filter chips (All / Uncategorized
 *     / your sections / Mastered). Each word can be moved to a section, marked as
 *     learned (→ Mastered), pronounced, translated (offline) or deleted.
 *   - Meetings tab: every Google Meet session you joined; open one to see the
 *     words you saved during it.
 *   - Flashcards tab: review the words you still need (mastered words are skipped).
 *   - Export tab: download all saved words grouped by meeting as .md / .txt.
 *
 * Depends on lib/store.js + lib/i18n.js + lib/dictionary.js (loaded first) →
 * globals MVStore, MVI18n, MVDict. i18n is UI-only: definitions/translation stay
 * as captured; the dictionary translation is the offline built-in one.
 */
(function () {
  'use strict';

  const t = (k, p) => MVI18n.t(k, p);

  let vocab = [];
  let meetings = [];
  let categories = [];

  let activeFilter = 'all';   // 'all' | 'uncat' | 'mastered' | <categoryId>
  let openMeetingId = null;   // when viewing one meeting's words
  let activeWordPopup = null; // the inline lookup popup for a word in a definition

  // Flashcard state.
  let cards = [];             // reviewable (non-mastered) words
  let cardOrder = [];
  let cardIndex = 0;
  let cardFlipped = false;

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    await MVI18n.init();
    buildLangSelect();
    applyI18n();
    wireTabs();
    wireExport();
    wireFlashcards();
    wireCategoryAdd();
    wireMeetings();
    // click anywhere outside an open word-lookup popup to dismiss it
    document.addEventListener('click', (e) => {
      if (activeWordPopup && !activeWordPopup.contains(e.target)) closeWordPopup();
    });
    await refresh();
  }

  async function refresh() {
    [vocab, meetings, categories] = await Promise.all([
      MVStore.getVocab(),
      MVStore.getMeetings(),
      MVStore.getCategories()
    ]);
    updateStats();
    renderWords();
    renderMeetings();
    resetCards();
  }

  /* ---------------- i18n ---------------- */
  function applyI18n() {
    document.documentElement.lang = MVI18n.get();
    document.documentElement.dir = MVI18n.isRTL() ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
  }

  function buildLangSelect() {
    const sel = document.getElementById('lang-select');
    sel.innerHTML = '';
    MVI18n.LANGS.forEach((l) => {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.label;
      if (l.code === MVI18n.get()) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', async () => {
      await MVI18n.set(sel.value); // persists -> content panel updates live too
      applyI18n();
      updateStats();
      renderWords();
      renderMeetings();
      renderCard();
    });
  }

  function updateStats() {
    document.getElementById('stats').textContent = t('stats', {
      words: vocab.length,
      meetings: meetings.length
    });
  }

  /* ---------------- tabs ---------------- */
  function wireTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  /* ---------------- words + categories ---------------- */
  function activeWords() {
    return vocab.filter((v) => !v.mastered);
  }

  function filterWords(filter) {
    if (filter === 'mastered') return vocab.filter((v) => v.mastered);
    const act = activeWords();
    if (filter === 'all') return act;
    if (filter === 'uncat') return act.filter((v) => !v.category);
    return act.filter((v) => v.category === filter); // a category id
  }

  function renderWords() {
    const ui = document.getElementById('words-ui');
    const onboard = document.getElementById('onboard');
    if (!vocab.length) {
      ui.style.display = 'none';
      onboard.style.display = 'block';
      return;
    }
    ui.style.display = 'block';
    onboard.style.display = 'none';

    renderCatBar();

    const items = filterWords(activeFilter);
    const list = document.getElementById('vocab-list');
    list.innerHTML = '';
    document.getElementById('words-empty').hidden = items.length > 0;
    // newest first, with a gentle cascade-in
    items.slice().reverse().forEach((v, i) => {
      const el = buildWordCard(v);
      el.style.animationDelay = stagger(i);
      list.appendChild(el);
    });
  }

  function renderCatBar() {
    const bar = document.getElementById('cat-bar');
    bar.innerHTML = '';
    const act = activeWords();

    bar.appendChild(chip('all', t('cat_all'), act.length, false));
    bar.appendChild(chip('uncat', t('cat_uncategorized'), act.filter((v) => !v.category).length, false));
    categories.forEach((c) => {
      bar.appendChild(chip(c.id, c.name, act.filter((v) => v.category === c.id).length, true));
    });
    bar.appendChild(chip('mastered', t('cat_mastered'), vocab.filter((v) => v.mastered).length, false));

    const add = document.createElement('button');
    add.className = 'chip add';
    add.textContent = t('cat_new');
    add.addEventListener('click', () => {
      const row = document.getElementById('cat-add-row');
      row.hidden = !row.hidden;
      if (!row.hidden) document.getElementById('cat-input').focus();
    });
    bar.appendChild(add);
  }

  function chip(id, label, count, deletable) {
    const b = document.createElement('button');
    b.className = 'chip' + (activeFilter === id ? ' active' : '');
    const lbl = document.createElement('span');
    lbl.textContent = label;
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = count;
    b.append(lbl, document.createTextNode(' '), cnt);
    b.addEventListener('click', () => {
      activeFilter = id;
      renderWords();
    });
    if (deletable) {
      const x = document.createElement('button');
      x.className = 'chip-x';
      x.textContent = '×';
      x.title = t('cat_delete_title');
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        await MVStore.removeCategory(id);
        if (activeFilter === id) activeFilter = 'all';
        await refresh();
      });
      b.appendChild(x);
    }
    return b;
  }

  function wireCategoryAdd() {
    const input = document.getElementById('cat-input');
    const btn = document.getElementById('cat-add-btn');
    const submit = async () => {
      const cat = await MVStore.addCategory(input.value);
      input.value = '';
      document.getElementById('cat-add-row').hidden = true;
      if (cat) activeFilter = cat.id;
      await refresh();
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  /** Build one word card (used in the Words tab AND inside a meeting's detail). */
  function buildWordCard(v) {
    const item = document.createElement('div');
    item.className = 'vocab-item';

    const tr = translateWord(v.word);
    const trBtn = tr ? `<button class="btn-act translate">${t('pop_translate')}</button>` : '';
    const masterBtn = v.mastered
      ? `<button class="btn-act master unmaster">${t('act_unmaster')}</button>`
      : `<button class="btn-act master">${t('act_master')}</button>`;

    item.innerHTML = `
      <div class="row"><div><span class="word"></span><span class="pos"></span></div></div>
      <div class="def"></div>
      <div class="tr"></div>
      <div class="ctx"></div>
      <div class="section-row"><select class="cat-select"></select></div>
      <div class="vocab-actions">
        ${trBtn}
        <button class="btn-act speak">🔊 ${t('act_pronounce')}</button>
        ${masterBtn}
        <button class="btn-act del">🗑 ${t('act_delete')}</button>
      </div>`;

    item.querySelector('.word').textContent = v.word;
    item.querySelector('.pos').textContent = v.partOfSpeech || '';
    // definition + context words are clickable: tap one you don't know to look
    // it up and save it too.
    renderClickableText(item.querySelector('.def'), v.definition || '');
    const ctxEl = item.querySelector('.ctx');
    if (v.sentence) renderClickableText(ctxEl, `“${v.sentence}”`, v.sentence);
    else ctxEl.textContent = '';

    // offline translation, revealed only on demand
    const trEl = item.querySelector('.tr');
    trEl.textContent = tr;
    trEl.style.display = 'none';
    const trBtnEl = item.querySelector('.btn-act.translate');
    if (trBtnEl) {
      trBtnEl.addEventListener('click', () => {
        trEl.style.display = trEl.style.display === 'none' ? 'inline-block' : 'none';
      });
    }

    // move-to-section selector
    const sel = item.querySelector('.cat-select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t('act_move_none');
    sel.appendChild(none);
    categories.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.value = v.category || '';
    sel.addEventListener('change', async () => {
      await MVStore.updateVocab(v.id, { category: sel.value });
      await refresh();
    });

    // pronounce / master / delete
    item.querySelector('.speak').addEventListener('click', () => speak(v.word));
    item.querySelector('.master').addEventListener('click', async () => {
      await MVStore.updateVocab(v.id, { mastered: !v.mastered });
      await refresh();
    });
    item.querySelector('.del').addEventListener('click', async () => {
      await MVStore.removeVocab(v.id);
      await refresh();
    });

    return item;
  }

  /* ---------------- meetings ---------------- */
  function wireMeetings() {
    document.getElementById('meeting-back').addEventListener('click', () => {
      openMeetingId = null;
      renderMeetings();
    });
    // click the dimmed backdrop to dismiss the confirm modal
    document.getElementById('mv-modal').addEventListener('click', (e) => {
      if (e.target.id === 'mv-modal') closeModal();
    });
  }

  /** Small per-item entrance delay (capped) so lists cascade in nicely. */
  function stagger(i) {
    return Math.min(i, 12) * 0.03 + 's';
  }

  function renderMeetings() {
    const listEl = document.getElementById('meetings-list');
    const emptyEl = document.getElementById('meetings-empty');
    const detail = document.getElementById('meeting-detail');
    const hint = document.querySelector('#tab-meetings .hint');

    if (openMeetingId) {
      listEl.style.display = 'none';
      emptyEl.hidden = true;
      if (hint) hint.style.display = 'none';
      detail.hidden = false;
      renderMeetingDetail();
      return;
    }

    detail.hidden = true;
    listEl.style.display = 'block';
    if (hint) hint.style.display = '';

    const ms = [...meetings].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    listEl.innerHTML = '';
    emptyEl.hidden = ms.length > 0;

    ms.forEach((m, i) => {
      const count = vocab.filter((v) => v.meetingId === m.id).length;
      const card = document.createElement('div');
      card.className = 'meeting-card';
      card.style.animationDelay = stagger(i);

      const title = document.createElement('span');
      title.className = 'm-title';
      title.textContent = m.title || m.id;

      const right = document.createElement('div');
      right.className = 'm-right';
      const badge = document.createElement('span');
      badge.className = 'm-count';
      badge.textContent = t('meeting_words_n', { n: count });
      const del = document.createElement('button');
      del.className = 'm-del';
      del.textContent = '🗑';
      del.title = t('meeting_delete_title');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteMeeting(m);
      });
      right.append(badge, del);

      card.append(title, right);
      card.addEventListener('click', () => {
        openMeetingId = m.id;
        renderMeetings();
      });
      listEl.appendChild(card);
    });
  }

  /* ---------------- confirm modal ---------------- */
  function openModal(title, actions) {
    document.getElementById('modal-title').textContent = title;
    const box = document.getElementById('modal-actions');
    box.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      if (a.cls) b.className = a.cls;
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      box.appendChild(b);
    });
    document.getElementById('mv-modal').hidden = false;
  }

  function closeModal() {
    document.getElementById('mv-modal').hidden = true;
  }

  function confirmDeleteMeeting(m) {
    openModal(t('meeting_delete_q'), [
      {
        label: t('meeting_delete_with'),
        cls: 'danger',
        onClick: async () => {
          await MVStore.removeMeeting(m.id, true);
          if (openMeetingId === m.id) openMeetingId = null;
          closeModal();
          await refresh();
        }
      },
      {
        label: t('meeting_delete_keep'),
        cls: 'keep',
        onClick: async () => {
          await MVStore.removeMeeting(m.id, false);
          if (openMeetingId === m.id) openMeetingId = null;
          closeModal();
          await refresh();
        }
      },
      { label: t('btn_cancel'), cls: 'cancel', onClick: closeModal }
    ]);
  }

  function renderMeetingDetail() {
    const m = meetings.find((x) => x.id === openMeetingId);
    document.getElementById('meeting-detail-title').textContent = m ? m.title || m.id : '';
    const list = document.getElementById('meeting-detail-list');
    list.innerHTML = '';
    const words = vocab.filter((v) => v.meetingId === openMeetingId);
    document.getElementById('meeting-detail-empty').hidden = words.length > 0;
    words.slice().reverse().forEach((v, i) => {
      const el = buildWordCard(v);
      el.style.animationDelay = stagger(i);
      list.appendChild(el);
    });
  }

  /* ---------------- flashcards ---------------- */
  function wireFlashcards() {
    document.getElementById('card').addEventListener('click', (e) => {
      if (e.target.closest('button')) return; // don't flip when tapping the Translate button
      flip();
    });
    document.getElementById('card-next').addEventListener('click', () => move(1));
    document.getElementById('card-prev').addEventListener('click', () => move(-1));
    document.getElementById('card-shuffle').addEventListener('click', () => {
      cardOrder = shuffle([...cards.keys()]);
      cardIndex = 0;
      cardFlipped = false;
      renderCard();
    });
  }

  function resetCards() {
    cards = activeWords(); // mastered words are not reviewed
    cardOrder = [...cards.keys()];
    cardIndex = 0;
    cardFlipped = false;
    renderCard();
  }

  function renderCard() {
    const card = document.getElementById('card');
    const counter = document.getElementById('card-counter');
    const front = card.querySelector('.card-front');
    const back = card.querySelector('.card-back');
    const hint = document.getElementById('card-hint');

    if (!cardOrder.length) {
      card.classList.remove('flipped');
      counter.textContent = '';
      front.textContent = t('card_empty');
      back.innerHTML = '';
      hint.textContent = '';
      return;
    }
    const v = cards[cardOrder[cardIndex]];
    counter.textContent = t('card_counter', { n: cardIndex + 1, total: cardOrder.length });

    // Front face = the word; back face = the meaning. The 3D flip is pure CSS,
    // driven by toggling the `flipped` class on #card.
    front.textContent = v.word;
    const tr = translateWord(v.word);
    back.innerHTML = '';
    const wl = document.createElement('span');
    wl.className = 'word-lg';
    wl.textContent = v.word;
    back.appendChild(wl);
    if (v.partOfSpeech) {
      const p = document.createElement('span');
      p.className = 'pos';
      p.textContent = v.partOfSpeech;
      back.appendChild(p);
    }
    const d = document.createElement('span');
    d.className = 'def';
    renderClickableText(d, v.definition || ''); // clickable definition words
    back.appendChild(d);
    if (v.sentence) {
      const c = document.createElement('span');
      c.className = 'ctx';
      renderClickableText(c, `“${v.sentence}”`, v.sentence);
      back.appendChild(c);
    }
    if (tr) {
      const trBtn = document.createElement('button');
      trBtn.type = 'button';
      trBtn.className = 'card-tr-btn';
      trBtn.textContent = t('pop_translate');
      const trSpan = document.createElement('span');
      trSpan.className = 'tr';
      trSpan.style.display = 'none';
      trBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        trSpan.textContent = tr;
        trSpan.style.display = 'block';
        trBtn.style.display = 'none';
      });
      back.append(trBtn, trSpan);
    }

    card.classList.toggle('flipped', cardFlipped);
    hint.textContent = cardFlipped ? t('card_hint_back') : t('card_hint_reveal');
  }

  function flip() {
    if (!cardOrder.length) return;
    cardFlipped = !cardFlipped;
    renderCard();
  }

  function move(dir) {
    if (!cardOrder.length) return;
    cardIndex = (cardIndex + dir + cardOrder.length) % cardOrder.length;
    cardFlipped = false;
    renderCard();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ---------------- in-dashboard word lookup ----------------
     Click a word inside any definition / context to look it up and save it. */
  function tokenizeWords(text) {
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

  /** Render text where every English word is a clickable span. */
  function renderClickableText(target, text, source) {
    target.textContent = '';
    const src = source != null ? source : text;
    tokenizeWords(text || '').forEach((tok) => {
      if (tok.type === 'word') {
        const span = document.createElement('span');
        span.className = 'dword';
        span.textContent = tok.value;
        const w = cleanWord(tok.value);
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          if (w) lookupWord(w, span, src);
        });
        target.appendChild(span);
      } else {
        target.appendChild(document.createTextNode(tok.value));
      }
    });
  }

  async function lookupWord(word, anchor, source) {
    const rect = anchor.getBoundingClientRect(); // capture before any DOM swap
    openWordPopup(rect, word);

    let data = { ok: false };
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        data = await chrome.runtime.sendMessage({ type: 'MV_LOOKUP', word });
      }
    } catch (_) {}
    renderWordPopup(word, data);

    const sense = data && data.ok && data.meanings && data.meanings[0] ? data.meanings[0] : null;
    const res = await MVStore.addVocab({
      id: MVStore.uid(),
      word,
      sentence: source || '',
      definition: sense ? sense.definition : '(no definition found)',
      partOfSpeech: sense ? sense.partOfSpeech : '',
      example: sense ? sense.example : '',
      phonetic: (data && data.phonetic) || '',
      translation: translateWord(word),
      meetingId: '',
      category: '',
      mastered: false,
      timestamp: Date.now()
    });
    setWordPopupSaved(res.id);
    await softRefresh();
  }

  function openWordPopup(rect, word) {
    closeWordPopup();
    const canTranslate = MVI18n.get() !== 'en' && typeof MVDict !== 'undefined';
    const pop = document.createElement('div');
    pop.className = 'dpop';
    pop.dir = MVI18n.isRTL() ? 'rtl' : 'ltr';
    pop.innerHTML = `
      <div class="dpop-head">
        <span class="dpop-word"></span>
        ${canTranslate ? `<button class="dpop-tr" title="${t('pop_translate')}">🌐</button>` : ''}
        <button class="dpop-audio" title="${t('act_pronounce')}">🔊</button>
        <button class="dpop-close" title="${t('pop_close_title')}">×</button>
      </div>
      <div class="dpop-trans" hidden></div>
      <div class="dpop-body">${t('pop_looking')}</div>
      <div class="dpop-foot"></div>`;
    pop.querySelector('.dpop-word').textContent = word;
    document.body.appendChild(pop);
    activeWordPopup = pop;

    pop.querySelector('.dpop-close').addEventListener('click', closeWordPopup);
    pop.querySelector('.dpop-audio').addEventListener('click', () => speak(word));
    const tb = pop.querySelector('.dpop-tr');
    if (tb) {
      tb.addEventListener('click', () => {
        const box = pop.querySelector('.dpop-trans');
        const tr = translateWord(word);
        box.textContent = tr || t('pop_no_translation');
        box.hidden = false;
      });
    }
    pop.addEventListener('click', (e) => e.stopPropagation());
    positionWordPopup(pop, rect);
  }

  function renderWordPopup(word, data) {
    if (!activeWordPopup) return;
    const head = activeWordPopup.querySelector('.dpop-word');
    const body = activeWordPopup.querySelector('.dpop-body');
    if (data && data.phonetic) head.textContent = `${word}  ${data.phonetic}`;

    if (!data || !data.ok || !data.meanings || !data.meanings.length) {
      body.innerHTML =
        data && data.error === 'network'
          ? `<em>${escapeHtml(t('pop_network'))}</em>`
          : `<em>${escapeHtml(t('pop_notfound', { word }))}</em>`;
      return;
    }
    body.innerHTML = '';
    data.meanings.slice(0, 3).forEach((m) => {
      const sense = document.createElement('div');
      sense.className = 'dpop-sense';
      const pos = document.createElement('span');
      pos.className = 'dpop-pos';
      pos.textContent = m.partOfSpeech;
      const def = document.createElement('span');
      def.className = 'dpop-def';
      renderClickableText(def, m.definition); // recursive: words here are clickable too
      sense.append(pos, def);
      if (m.example) {
        const ex = document.createElement('div');
        ex.className = 'dpop-ex';
        renderClickableText(ex, `“${m.example}”`);
        sense.appendChild(ex);
      }
      body.appendChild(sense);
    });
  }

  function setWordPopupSaved(id) {
    if (!activeWordPopup) return;
    const foot = activeWordPopup.querySelector('.dpop-foot');
    foot.className = 'dpop-foot saved';
    foot.innerHTML = `<span>${escapeHtml(t('pop_saved'))}</span><button class="dpop-remove">${escapeHtml(t('pop_remove'))}</button>`;
    foot.querySelector('.dpop-remove').addEventListener('click', async () => {
      await MVStore.removeVocab(id);
      foot.className = 'dpop-foot removed';
      foot.textContent = t('pop_removed');
      await softRefresh();
    });
  }

  function positionWordPopup(pop, r) {
    const pw = 250;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + 170 > window.innerHeight) top = r.top - 176;
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  function closeWordPopup() {
    if (activeWordPopup) {
      activeWordPopup.remove();
      activeWordPopup = null;
    }
  }

  /** Re-read data + re-render lists WITHOUT resetting the flashcard, so a lookup
      popup opened over a flipped card doesn't make the card flip back. */
  async function softRefresh() {
    [vocab, meetings, categories] = await Promise.all([
      MVStore.getVocab(),
      MVStore.getMeetings(),
      MVStore.getCategories()
    ]);
    updateStats();
    renderWords();
    renderMeetings();
    syncCards();
  }

  /** Reconcile the flashcard deck with the latest vocab after an in-dashboard
      add/remove, WITHOUT resetting the user's position, shuffle order, or flip
      state: newly saved words are appended to the deck, removed ones drop out,
      and we stay on whatever card was showing. */
  function syncCards() {
    const prevOrderIds = cardOrder.map((i) => cards[i] && cards[i].id).filter(Boolean);
    const currentId = cardOrder.length ? (cards[cardOrder[cardIndex]] || {}).id : null;

    cards = activeWords();
    const indexById = new Map(cards.map((c, i) => [c.id, i]));

    const order = [];
    const seen = new Set();
    prevOrderIds.forEach((id) => {
      const idx = indexById.get(id);
      if (idx !== undefined) {
        order.push(idx);
        seen.add(id);
      }
    });
    cards.forEach((c, i) => {
      if (!seen.has(c.id)) order.push(i);
    });
    cardOrder = order;

    const pos = currentId ? cardOrder.findIndex((i) => cards[i].id === currentId) : -1;
    cardIndex = pos >= 0 ? pos : Math.min(cardIndex, Math.max(0, cardOrder.length - 1));
    renderCard();
  }

  /* ---------------- export ---------------- */
  function wireExport() {
    document.getElementById('export-md').addEventListener('click', () =>
      download(`meetvocab-${stamp()}.md`, buildMarkdown(), 'text/markdown')
    );
    document.getElementById('export-txt').addEventListener('click', () =>
      download(`meetvocab-${stamp()}.txt`, buildText(), 'text/plain')
    );
    document.getElementById('clear').addEventListener('click', async () => {
      await MVStore.clearAll();
      activeFilter = 'all';
      openMeetingId = null;
      await refresh();
    });
  }

  /** Words grouped by meeting (newest first), then a Mastered section. */
  function groupedExport(emitGroup, noVocabLine) {
    const act = activeWords();
    const ms = [...meetings].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const known = new Set(meetings.map((m) => m.id));
    let any = false;

    ms.forEach((m) => {
      const words = act.filter((v) => v.meetingId === m.id);
      if (words.length) {
        any = true;
        emitGroup(m.title || m.id, words);
      }
    });
    const leftover = act.filter((v) => !known.has(v.meetingId));
    if (leftover.length) {
      any = true;
      emitGroup(t('cat_uncategorized'), leftover);
    }
    if (!any) noVocabLine();
  }

  function buildMarkdown() {
    const date = new Date().toLocaleString();
    const L = [];
    L.push(`# ${t('export_h_title', { date })}`, '');
    L.push(`## ${t('export_h_vocab')}`, '');

    groupedExport(
      (title, words) => {
        L.push(`### ${title}`, '');
        words.forEach((v) => {
          L.push(`- **${v.word}**${v.partOfSpeech ? ` _(${v.partOfSpeech})_` : ''}: ${v.definition}`);
          if (v.sentence) L.push(`  - ${t('export_context')}: "${v.sentence}"`);
        });
        L.push('');
      },
      () => L.push(`_${t('export_no_vocab')}_`, '')
    );

    const mastered = vocab.filter((v) => v.mastered);
    if (mastered.length) {
      L.push(`## ${t('export_h_mastered')}`, '');
      mastered.forEach((v) =>
        L.push(`- **${v.word}**${v.partOfSpeech ? ` _(${v.partOfSpeech})_` : ''}: ${v.definition}`)
      );
      L.push('');
    }
    return L.join('\n');
  }

  function buildText() {
    const date = new Date().toLocaleString();
    const L = [];
    L.push(t('export_h_title', { date }).toUpperCase(), '');
    L.push(`=== ${t('export_h_vocab')} ===`, '');

    groupedExport(
      (title, words) => {
        L.push(`--- ${title} ---`);
        words.forEach((v) => {
          L.push(`* ${v.word}${v.partOfSpeech ? ` (${v.partOfSpeech})` : ''}: ${v.definition}`);
          if (v.sentence) L.push(`    ${t('export_context')}: "${v.sentence}"`);
        });
        L.push('');
      },
      () => L.push(`(${t('export_no_vocab')})`, '')
    );

    const mastered = vocab.filter((v) => v.mastered);
    if (mastered.length) {
      L.push(`=== ${t('export_h_mastered')} ===`, '');
      mastered.forEach((v) =>
        L.push(`* ${v.word}${v.partOfSpeech ? ` (${v.partOfSpeech})` : ''}: ${v.definition}`)
      );
      L.push('');
    }
    return L.join('\n');
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------------- shared utils ---------------- */
  function stamp() {
    return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  }

  /** Offline translation of `word` in the current UI language ('' for English/unknown). */
  function translateWord(word) {
    return typeof MVDict !== 'undefined' ? MVDict.lookup(word, MVI18n.get()) : '';
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
})();
