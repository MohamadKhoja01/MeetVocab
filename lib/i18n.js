/**
 * lib/i18n.js
 * Lightweight UI-only internationalization for MeetVocab.
 *
 * IMPORTANT: This translates the EXTENSION'S INTERFACE TEXT only. It does NOT
 * change how the extension works — dictionary lookups stay English-to-English,
 * pronunciation stays an English TTS voice, captions are still read as-is.
 *
 * Classic script (no import/export) so the same file works in the content
 * script's isolated world AND the popup page. Exposes global `MVI18n`.
 * Depends on lib/store.js (loaded first) for persisting the chosen language.
 */
(function (global) {
  'use strict';

  const LANGS = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
    { code: 'tr', label: 'Türkçe' }
  ];

  const STRINGS = {
    en: {
      app_subtitle: 'Live English helper for Google Meet',
      stats: '{words} words · {meetings} meetings',
      tab_vocab: 'Vocabulary',
      tab_cards: 'Flashcards',
      tab_export: 'Export',
      vocab_empty: 'No saved words yet. Click words in a Google Meet caption to build your list.',
      onboard_title: 'How it works',
      onboard_step1: 'Join a Google Meet call and turn on captions (CC).',
      onboard_step2: 'Click any word in the caption box to see its meaning — it’s saved here automatically.',
      onboard_step3: 'Come back to review your saved words and practice them as flashcards.',
      tab_meetings: 'Meetings',
      cat_all: 'All words',
      cat_uncategorized: 'Uncategorized',
      cat_mastered: '⭐ Mastered',
      cat_new: '+ New section',
      cat_new_ph: 'Section name',
      cat_add: 'Add',
      cat_delete_title: 'Delete this section',
      words_hint: 'Tap a section to filter. Use the buttons under each word to organize it.',
      words_empty: 'No words here yet.',
      act_move_none: 'Section: none',
      act_move_to: 'Move to section…',
      act_master: '⭐ I learned it',
      act_unmaster: '↩ Back to review',
      meetings_hint: 'Each Google Meet you join is saved here with the words from that session.',
      meetings_empty: 'No meetings yet. Join a Google Meet and save some words.',
      meeting_words_n: '{n} words',
      meeting_back: '‹ All meetings',
      meeting_empty_words: 'No words were saved in this meeting.',
      meeting_title: 'Meeting',
      export_h_mastered: 'Mastered Words',
      meeting_delete_title: 'Delete meeting',
      meeting_delete_q: 'Delete this meeting?',
      meeting_delete_with: '🗑 Delete meeting + its words',
      meeting_delete_keep: '📂 Delete meeting, keep words',
      btn_cancel: 'Cancel',
      card_empty: 'No words to review yet',
      card_counter: 'Card {n} of {total}',
      card_hint_flip: 'Click the card to flip',
      card_hint_reveal: 'Click the card to reveal the meaning',
      card_hint_back: 'Click to flip back',
      btn_prev: '‹ Prev',
      btn_shuffle: '🔀 Shuffle',
      btn_next: 'Next ›',
      export_desc: 'Download your saved words, grouped by meeting, as a single file.',
      export_md: '⬇ Export as Markdown (.md)',
      export_txt: '⬇ Export as Text (.txt)',
      clear_data: '🗑 Clear all local data',
      act_pronounce: 'Pronounce',
      act_delete: 'Delete',
      panel_status_init: 'Turn on captions (CC) to begin',
      panel_status_detected: 'Captions detected — start talking.',
      panel_status_resumed: 'Resumed ({n} lines)',
      panel_footer: 'Click any word for its English meaning.',
      pop_looking: 'Looking up…',
      pop_saved: 'Saved to your vocabulary ✓',
      pop_notfound: 'No English definition found for “{word}”.',
      pop_network: "Couldn't reach the dictionary. Check your connection.",
      pop_audio_title: 'Hear pronunciation',
      pop_close_title: 'Close',
      pop_translate: '🌐 Translate',
      pop_no_translation: 'No built-in translation for this word.',
      pop_remove: '🗑 Remove',
      pop_removed: 'Removed from your list',
      export_translation: 'Translation',
      export_h_title: 'Meeting Notes — {date}',
      export_h_transcript: 'Transcript',
      export_h_vocab: 'My Saved Vocabulary',
      export_no_transcript: 'No transcript captured.',
      export_no_vocab: 'No words saved.',
      export_definition: 'Definition',
      export_context: 'Context',
      export_example: 'Example'
    },

    ar: {
      app_subtitle: 'مساعد الإنجليزية المباشر في Google Meet',
      stats: '{words} كلمة · {meetings} اجتماع',
      tab_vocab: 'المفردات',
      tab_cards: 'البطاقات',
      tab_export: 'تصدير',
      vocab_empty: 'لا توجد كلمات محفوظة بعد. انقر على الكلمات في ترجمة Google Meet لبناء قائمتك.',
      onboard_title: 'كيف تعمل الإضافة',
      onboard_step1: 'ادخل اجتماعًا في Google Meet وفعّل الترجمة (CC).',
      onboard_step2: 'انقر أي كلمة في صندوق الترجمة لترى معناها — وتُحفَظ هنا تلقائيًا.',
      onboard_step3: 'ارجِع إلى هنا لمراجعة كلماتك المحفوظة والتدرّب عليها كبطاقات.',
      tab_meetings: 'الاجتماعات',
      cat_all: 'كل الكلمات',
      cat_uncategorized: 'غير مصنّفة',
      cat_mastered: '⭐ مُتقَنة',
      cat_new: '+ قسم جديد',
      cat_new_ph: 'اسم القسم',
      cat_add: 'إضافة',
      cat_delete_title: 'حذف هذا القسم',
      words_hint: 'اضغط قسمًا للتصفية. استخدم الأزرار تحت كل كلمة لتنظيمها.',
      words_empty: 'لا توجد كلمات هنا بعد.',
      act_move_none: 'القسم: بلا',
      act_move_to: 'نقل إلى قسم…',
      act_master: '⭐ حفظتها',
      act_unmaster: '↩ إرجاع للمراجعة',
      meetings_hint: 'كل اجتماع Google Meet تدخله يُحفظ هنا مع كلمات تلك الجلسة.',
      meetings_empty: 'لا توجد اجتماعات بعد. ادخل اجتماعًا واحفظ بعض الكلمات.',
      meeting_words_n: '{n} كلمة',
      meeting_back: '‹ كل الاجتماعات',
      meeting_empty_words: 'لم تُحفظ أي كلمات في هذا الاجتماع.',
      meeting_title: 'اجتماع',
      export_h_mastered: 'الكلمات المُتقَنة',
      meeting_delete_title: 'حذف الاجتماع',
      meeting_delete_q: 'حذف هذا الاجتماع؟',
      meeting_delete_with: '🗑 حذف الاجتماع وكلماته',
      meeting_delete_keep: '📂 حذف الاجتماع وإبقاء الكلمات',
      btn_cancel: 'إلغاء',
      card_empty: 'لا توجد كلمات للمراجعة بعد',
      card_counter: 'بطاقة {n} من {total}',
      card_hint_flip: 'انقر على البطاقة للقلب',
      card_hint_reveal: 'انقر على البطاقة لإظهار المعنى',
      card_hint_back: 'انقر للعودة',
      btn_prev: '‹ السابق',
      btn_shuffle: '🔀 خلط',
      btn_next: 'التالي ›',
      export_desc: 'نزّل كلماتك المحفوظة مرتّبةً حسب الاجتماع في ملف واحد.',
      export_md: '⬇ تصدير كـ Markdown (.md)',
      export_txt: '⬇ تصدير كنص (.txt)',
      clear_data: '🗑 مسح كل البيانات المحلية',
      act_pronounce: 'النطق',
      act_delete: 'حذف',
      panel_status_init: 'شغّل الترجمة (CC) للبدء',
      panel_status_detected: 'تم رصد الترجمة — ابدأ الكلام.',
      panel_status_resumed: 'تم الاستئناف ({n} سطر)',
      panel_footer: 'انقر على أي كلمة لمعرفة معناها بالإنجليزية.',
      pop_looking: 'جارٍ البحث…',
      pop_saved: 'تم الحفظ في مفرداتك ✓',
      pop_notfound: 'لا يوجد تعريف إنجليزي للكلمة “{word}”.',
      pop_network: 'تعذّر الوصول إلى القاموس. تحقق من اتصالك.',
      pop_audio_title: 'استمع إلى النطق',
      pop_close_title: 'إغلاق',
      pop_translate: '🌐 ترجم',
      pop_no_translation: 'لا توجد ترجمة مدمجة لهذه الكلمة.',
      pop_remove: '🗑 إزالة',
      pop_removed: 'أُزيلت من قائمتك',
      export_translation: 'الترجمة',
      export_h_title: 'ملاحظات الاجتماع — {date}',
      export_h_transcript: 'النص',
      export_h_vocab: 'مفرداتي المحفوظة',
      export_no_transcript: 'لم يتم التقاط أي نص.',
      export_no_vocab: 'لا توجد كلمات محفوظة.',
      export_definition: 'التعريف',
      export_context: 'السياق',
      export_example: 'مثال'
    },

    tr: {
      app_subtitle: 'Google Meet için canlı İngilizce yardımcısı',
      stats: '{words} kelime · {meetings} toplantı',
      tab_vocab: 'Kelimeler',
      tab_cards: 'Kartlar',
      tab_export: 'Dışa Aktar',
      vocab_empty: 'Henüz kayıtlı kelime yok. Listeyi oluşturmak için Google Meet altyazısındaki kelimelere tıklayın.',
      onboard_title: 'Nasıl çalışır',
      onboard_step1: 'Bir Google Meet görüşmesine katıl ve altyazıyı (CC) aç.',
      onboard_step2: 'Anlamını görmek için altyazı kutusundaki herhangi bir kelimeye tıkla — buraya otomatik kaydedilir.',
      onboard_step3: 'Kaydettiğin kelimeleri gözden geçirmek ve kartlarla çalışmak için geri dön.',
      tab_meetings: 'Toplantılar',
      cat_all: 'Tüm kelimeler',
      cat_uncategorized: 'Sınıflandırılmamış',
      cat_mastered: '⭐ Öğrenildi',
      cat_new: '+ Yeni bölüm',
      cat_new_ph: 'Bölüm adı',
      cat_add: 'Ekle',
      cat_delete_title: 'Bu bölümü sil',
      words_hint: 'Filtrelemek için bir bölüme dokun. Düzenlemek için her kelimenin altındaki düğmeleri kullan.',
      words_empty: 'Burada henüz kelime yok.',
      act_move_none: 'Bölüm: yok',
      act_move_to: 'Bölüme taşı…',
      act_master: '⭐ Öğrendim',
      act_unmaster: '↩ İncelemeye geri al',
      meetings_hint: 'Katıldığın her Google Meet, o oturumun kelimeleriyle birlikte burada saklanır.',
      meetings_empty: 'Henüz toplantı yok. Bir Google Meet’e katıl ve kelime kaydet.',
      meeting_words_n: '{n} kelime',
      meeting_back: '‹ Tüm toplantılar',
      meeting_empty_words: 'Bu toplantıda kelime kaydedilmedi.',
      meeting_title: 'Toplantı',
      export_h_mastered: 'Öğrenilen Kelimeler',
      meeting_delete_title: 'Toplantıyı sil',
      meeting_delete_q: 'Bu toplantı silinsin mi?',
      meeting_delete_with: '🗑 Toplantıyı ve kelimelerini sil',
      meeting_delete_keep: '📂 Toplantıyı sil, kelimeleri tut',
      btn_cancel: 'İptal',
      card_empty: 'İncelenecek kelime yok',
      card_counter: 'Kart {n} / {total}',
      card_hint_flip: 'Çevirmek için karta tıklayın',
      card_hint_reveal: 'Anlamı görmek için karta tıklayın',
      card_hint_back: 'Geri çevirmek için tıklayın',
      btn_prev: '‹ Önceki',
      btn_shuffle: '🔀 Karıştır',
      btn_next: 'Sonraki ›',
      export_desc: 'Kaydettiğin kelimeleri toplantıya göre gruplanmış olarak tek dosyada indir.',
      export_md: '⬇ Markdown olarak indir (.md)',
      export_txt: '⬇ Metin olarak indir (.txt)',
      clear_data: '🗑 Tüm yerel verileri temizle',
      act_pronounce: 'Telaffuz',
      act_delete: 'Sil',
      panel_status_init: 'Başlamak için altyazıyı (CC) açın',
      panel_status_detected: 'Altyazı algılandı — konuşmaya başlayın.',
      panel_status_resumed: 'Devam ediliyor ({n} satır)',
      panel_footer: 'İngilizce anlamı için herhangi bir kelimeye tıklayın.',
      pop_looking: 'Aranıyor…',
      pop_saved: 'Kelime listenize kaydedildi ✓',
      pop_notfound: '“{word}” için İngilizce tanım bulunamadı.',
      pop_network: 'Sözlüğe ulaşılamadı. Bağlantınızı kontrol edin.',
      pop_audio_title: 'Telaffuzu dinle',
      pop_close_title: 'Kapat',
      pop_translate: '🌐 Çevir',
      pop_no_translation: 'Bu kelime için yerleşik çeviri yok.',
      pop_remove: '🗑 Kaldır',
      pop_removed: 'Listenizden kaldırıldı',
      export_translation: 'Çeviri',
      export_h_title: 'Toplantı Notları — {date}',
      export_h_transcript: 'Metin',
      export_h_vocab: 'Kaydettiğim Kelimeler',
      export_no_transcript: 'Metin yakalanmadı.',
      export_no_vocab: 'Kaydedilmiş kelime yok.',
      export_definition: 'Tanım',
      export_context: 'Bağlam',
      export_example: 'Örnek'
    }
  };

  let current = 'en';

  /** Load saved language, or fall back to the browser language, else English. */
  async function init() {
    let saved;
    try {
      if (global.MVStore && MVStore.getLang) saved = await MVStore.getLang();
    } catch (_) {}
    if (saved && STRINGS[saved]) {
      current = saved;
    } else {
      const nav = (global.navigator && navigator.language || 'en').slice(0, 2).toLowerCase();
      current = STRINGS[nav] ? nav : 'en';
    }
    return current;
  }

  function get() {
    return current;
  }

  /** Set + persist (used by the popup language selector). */
  async function set(lang) {
    use(lang);
    try {
      if (global.MVStore && MVStore.setLang) await MVStore.setLang(current);
    } catch (_) {}
    return current;
  }

  /** Set in memory only, no persistence (used by storage-change listeners to avoid write loops). */
  function use(lang) {
    current = STRINGS[lang] ? lang : 'en';
    return current;
  }

  function isRTL() {
    return current === 'ar';
  }

  /** Translate a key, replacing {placeholders} with params. Falls back to English then the raw key. */
  function t(key, params) {
    let s =
      (STRINGS[current] && STRINGS[current][key]) ||
      STRINGS.en[key] ||
      key;
    if (params) {
      for (const k in params) s = s.replace('{' + k + '}', params[k]);
    }
    return s;
  }

  global.MVI18n = { LANGS, init, get, set, use, isRTL, t };
})(typeof self !== 'undefined' ? self : window);
