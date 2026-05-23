/**
 * background/service_worker.js
 *
 * Sole job: look up a word against the free, public, unauthenticated
 * Free Dictionary API and return a normalized result.
 *
 * Why here and not in the content script?
 *   Google Meet's page enforces a strict Content-Security-Policy (connect-src)
 *   that would block a cross-origin fetch made from the page context. The
 *   service worker runs under the EXTENSION's CSP, governed by host_permissions
 *   in manifest.json, so it can reach api.dictionaryapi.dev freely.
 *
 * No API key. No auth header. No third-party AI. Just one public GET request.
 */

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'MV_LOOKUP') {
    lookup(msg.word).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  return false;
});

async function lookup(rawWord) {
  const word = String(rawWord || '').toLowerCase().trim();
  if (!word) return { ok: false, word, error: 'empty' };

  try {
    const res = await fetch(API_BASE + encodeURIComponent(word));
    if (!res.ok) {
      // 404 => the API found no definitions for this word.
      return { ok: false, word, error: res.status === 404 ? 'not_found' : 'http_' + res.status };
    }
    const data = await res.json();
    return { ok: true, ...normalize(word, data) };
  } catch (e) {
    return { ok: false, word, error: 'network' };
  }
}

/**
 * Flatten the API's nested shape into ONE simple sense per part of speech.
 *
 * "Simpler English" goal: a word can carry many definitions, and the longer
 * ones are usually the hardest to read. For each part of speech we therefore
 * keep the SHORTEST definition (typically the plainest), and still attach an
 * example sentence — concrete usage helps a learner more than a long wording.
 *
 *   meanings: [{ partOfSpeech, definition, example }]
 */
function normalize(word, data) {
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) return { word, phonetic: '', meanings: [] };

  const phonetic =
    entry.phonetic ||
    (entry.phonetics || []).map((p) => p.text).find(Boolean) ||
    '';

  // One slot per part of speech, holding the shortest definition seen so far.
  const byPos = new Map();
  for (const m of entry.meanings || []) {
    const pos = m.partOfSpeech || '';
    const slot = byPos.get(pos) || { partOfSpeech: pos, definition: '', example: '' };
    for (const d of m.definitions || []) {
      const def = (d.definition || '').trim();
      const ex = (d.example || '').trim();
      if (def && (!slot.definition || def.length < slot.definition.length)) {
        slot.definition = def;
        if (ex) slot.example = ex; // prefer the chosen definition's own example
      }
      if (ex && !slot.example) slot.example = ex; // otherwise borrow any example
    }
    if (slot.definition) byPos.set(pos, slot);
  }

  return { word: entry.word || word, phonetic, meanings: Array.from(byPos.values()) };
}
