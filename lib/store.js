/**
 * lib/store.js
 * Thin, promise-based wrapper around chrome.storage.local.
 *
 * Loaded as a CLASSIC script (no import/export) so the SAME file works in both:
 *   - the content script's isolated world (manifest content_scripts)
 *   - the popup page (<script src> in popup.html)
 *
 * chrome.storage.local is per-profile + per-extension, so all data here is
 * inherently private and isolated to this user. Nothing leaves the browser.
 *
 * DATA MODEL (v2 — meetings + categories + mastered):
 *   vocab entry: {
 *     id, word, sentence, definition, partOfSpeech, example, phonetic,
 *     translation, timestamp,
 *     meetingId,   // the Google Meet session the word was saved in
 *     category,    // '' = uncategorized, otherwise a category id
 *     mastered     // true once the user marks the word as learned
 *   }
 *   meeting:  { id, title, startedAt }
 *   category: { id, name }
 *   transcripts: { [meetingId]: [ { id, speaker, text, timestamp } ] }
 */
(function (global) {
  'use strict';

  const KEYS = {
    VOCAB: 'mv_vocab',
    MEETINGS: 'mv_meetings',
    CATEGORIES: 'mv_categories',
    TRANSCRIPTS: 'mv_transcripts', // keyed by meetingId (NOT one big growing list)
    LANG: 'mv_lang'
  };

  // chrome.storage.local exists in the content script and the real extension
  // popup. It is ABSENT in the bare HTML preview panel, so fall back to an
  // in-memory store there to keep the dashboard rendering instead of erroring.
  const hasStorage =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const mem = {};

  function get(keys) {
    if (hasStorage) {
      return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }
    const out = {};
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => (out[k] = mem[k]));
    return Promise.resolve(out);
  }
  function set(obj) {
    if (hasStorage) {
      return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
    }
    Object.assign(mem, obj);
    return Promise.resolve();
  }

  /* ------------------------------- vocab ------------------------------- */
  async function getVocab() {
    const r = await get(KEYS.VOCAB);
    // Normalize older entries that predate the new fields.
    return (r[KEYS.VOCAB] || []).map((v) => ({
      category: '',
      mastered: false,
      meetingId: v.meetingId || '',
      ...v
    }));
  }
  async function setVocab(list) {
    await set({ [KEYS.VOCAB]: list });
  }

  /** Add a vocab entry, de-duplicating on word + sentence. Returns {added, id}. */
  async function addVocab(entry) {
    const list = await getVocab();
    const existing = list.find(
      (v) => v.word === entry.word && v.sentence === entry.sentence
    );
    if (existing) return { added: false, id: existing.id };
    const full = { category: '', mastered: false, meetingId: '', ...entry };
    list.push(full);
    await setVocab(list);
    return { added: true, id: full.id };
  }

  async function removeVocab(id) {
    const list = (await getVocab()).filter((v) => v.id !== id);
    await setVocab(list);
    return list;
  }

  /** Patch one vocab entry (e.g. { category }, { mastered }). Returns the list. */
  async function updateVocab(id, patch) {
    const list = await getVocab();
    const it = list.find((v) => v.id === id);
    if (it) Object.assign(it, patch);
    await setVocab(list);
    return list;
  }

  /** Find the saved entry for a word+sentence pair, or null. */
  async function findVocab(word, sentence) {
    const list = await getVocab();
    return list.find((v) => v.word === word && v.sentence === sentence) || null;
  }

  /* ----------------------------- meetings ------------------------------ */
  async function getMeetings() {
    const r = await get(KEYS.MEETINGS);
    return r[KEYS.MEETINGS] || [];
  }
  async function setMeetings(list) {
    await set({ [KEYS.MEETINGS]: list });
  }
  /** Create the meeting record if it doesn't exist yet; returns it. */
  async function ensureMeeting(id, title) {
    const list = await getMeetings();
    let m = list.find((x) => x.id === id);
    if (!m) {
      m = { id, title: title || id, startedAt: Date.now() };
      list.push(m);
      await setMeetings(list);
    }
    return m;
  }

  /**
   * Delete a meeting. With deleteWords=true its saved words are removed too;
   * otherwise the words are kept and just detached (meetingId cleared) so they
   * still live under "All words". The meeting's transcript is always dropped.
   */
  async function removeMeeting(id, deleteWords) {
    const meetings = (await getMeetings()).filter((m) => m.id !== id);
    await setMeetings(meetings);

    const r = await get(KEYS.TRANSCRIPTS);
    const all = r[KEYS.TRANSCRIPTS] || {};
    delete all[id];
    await set({ [KEYS.TRANSCRIPTS]: all });

    const vocab = await getVocab();
    const next = deleteWords
      ? vocab.filter((v) => v.meetingId !== id)
      : vocab.map((v) => (v.meetingId === id ? { ...v, meetingId: '' } : v));
    await setVocab(next);
    return { meetings, vocab: next };
  }

  /* ---------------------------- categories ----------------------------- */
  async function getCategories() {
    const r = await get(KEYS.CATEGORIES);
    return r[KEYS.CATEGORIES] || [];
  }
  async function setCategories(list) {
    await set({ [KEYS.CATEGORIES]: list });
  }
  async function addCategory(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const list = await getCategories();
    const dup = list.find((c) => c.name.toLowerCase() === clean.toLowerCase());
    if (dup) return dup;
    const cat = { id: uid(), name: clean };
    list.push(cat);
    await setCategories(list);
    return cat;
  }
  /** Remove a category and un-assign any words that pointed to it. */
  async function removeCategory(id) {
    const cats = (await getCategories()).filter((c) => c.id !== id);
    await setCategories(cats);
    const vocab = await getVocab();
    let touched = false;
    for (const v of vocab) {
      if (v.category === id) {
        v.category = '';
        touched = true;
      }
    }
    if (touched) await setVocab(vocab);
    return cats;
  }

  /* ---------------------------- transcripts ---------------------------- */
  async function getTranscript(meetingId) {
    const r = await get(KEYS.TRANSCRIPTS);
    const all = r[KEYS.TRANSCRIPTS] || {};
    return all[meetingId] || [];
  }
  async function setTranscript(meetingId, list) {
    const r = await get(KEYS.TRANSCRIPTS);
    const all = r[KEYS.TRANSCRIPTS] || {};
    all[meetingId] = list;
    await set({ [KEYS.TRANSCRIPTS]: all });
  }

  /* ------------------------------- misc -------------------------------- */
  async function clearAll() {
    await set({
      [KEYS.VOCAB]: [],
      [KEYS.MEETINGS]: [],
      [KEYS.CATEGORIES]: [],
      [KEYS.TRANSCRIPTS]: {}
    });
  }

  /** UI language (undefined until the user picks one). */
  async function getLang() {
    const r = await get(KEYS.LANG);
    return r[KEYS.LANG];
  }
  async function setLang(lang) {
    await set({ [KEYS.LANG]: lang });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  global.MVStore = {
    KEYS,
    get,
    set,
    getVocab,
    setVocab,
    addVocab,
    removeVocab,
    updateVocab,
    findVocab,
    getMeetings,
    setMeetings,
    ensureMeeting,
    removeMeeting,
    getCategories,
    setCategories,
    addCategory,
    removeCategory,
    getTranscript,
    setTranscript,
    clearAll,
    getLang,
    setLang,
    uid
  };
})(typeof self !== 'undefined' ? self : window);
