/**
 * lib/dictionary.js
 * A small, BUILT-IN, fully OFFLINE English → Arabic / Turkish word dictionary.
 *
 * WHY this exists:
 *   The user wanted help understanding English words in their own language,
 *   but with NO external API, NO cloud service, NO AI and NO API keys. The only
 *   way to translate with zero network calls is to ship the data inside the
 *   extension itself. So this file bundles the most common English words with
 *   accurate Arabic + Turkish meanings. Everything runs locally and offline.
 *
 * LIMITS (be honest):
 *   - It translates a SINGLE WORD, not a whole sentence.
 *   - It only knows the words listed below (common, high-frequency vocabulary).
 *     Unknown words simply return '' and the UI keeps showing the English
 *     definition from the dictionary API.
 *   - A light morphological fallback maps simple inflections to their base
 *     form (books→book, making→make, tried→try, quickly→quick…).
 *
 * Classic script (no import/export) so the SAME file works in the content
 * script's isolated world AND the popup page. Exposes global `MVDict`.
 *
 * Data shape — compact to keep the file small:  word: [arabic, turkish]
 */
(function (global) {
  'use strict';

  const WORDS = {
    /* ---- pronouns / people ---- */
    i: ['أنا', 'ben'],
    you: ['أنتَ', 'sen'],
    he: ['هو', 'o'],
    she: ['هي', 'o'],
    we: ['نحن', 'biz'],
    they: ['هم', 'onlar'],
    it: ['هو/هي (لغير العاقل)', 'o'],
    me: ['أنا/لي', 'beni'],
    my: ['ملكي', 'benim'],
    your: ['ملكك', 'senin'],
    our: ['ملكنا', 'bizim'],
    their: ['ملكهم', 'onların'],

    /* ---- question words ---- */
    who: ['مَن', 'kim'],
    what: ['ماذا', 'ne'],
    when: ['متى', 'ne zaman'],
    where: ['أين', 'nerede'],
    why: ['لماذا', 'neden'],
    how: ['كيف', 'nasıl'],
    which: ['أيّ', 'hangi'],

    /* ---- answers / basics ---- */
    yes: ['نعم', 'evet'],
    no: ['لا', 'hayır'],
    not: ['ليس', 'değil'],
    maybe: ['ربما', 'belki'],
    okay: ['حسنًا', 'tamam'],
    ok: ['حسنًا', 'tamam'],
    please: ['من فضلك', 'lütfen'],
    sorry: ['آسف', 'üzgünüm'],
    thanks: ['شكرًا', 'teşekkürler'],
    thank: ['يشكر', 'teşekkür etmek'],
    hello: ['مرحبًا', 'merhaba'],
    hi: ['مرحبًا', 'selam'],
    welcome: ['أهلًا بك', 'hoş geldiniz'],
    bye: ['وداعًا', 'hoşça kal'],

    /* ---- conjunctions / prepositions / connectors ---- */
    and: ['و', 've'],
    or: ['أو', 'veya'],
    but: ['لكن', 'ama'],
    because: ['لأنّ', 'çünkü'],
    if: ['إذا', 'eğer'],
    so: ['لذلك', 'bu yüzden'],
    then: ['ثم', 'sonra'],
    than: ['من (للمقارنة)', '-den'],
    with: ['مع', 'ile'],
    without: ['بدون', 'olmadan'],
    for: ['لـ / من أجل', 'için'],
    from: ['من', '-den'],
    to: ['إلى', '-e'],
    of: ['من / لـ', '-in'],
    about: ['حول / عن', 'hakkında'],
    in: ['في', 'içinde'],
    on: ['على', 'üzerinde'],
    at: ['عند / في', '-de'],
    by: ['بواسطة', 'tarafından'],
    between: ['بين', 'arasında'],
    before: ['قبل', 'önce'],
    after: ['بعد', 'sonra'],
    during: ['خلال', 'sırasında'],
    while: ['بينما', '-iken'],
    until: ['حتى', 'kadar'],
    over: ['فوق', 'üzerinde'],
    under: ['تحت', 'altında'],
    up: ['أعلى', 'yukarı'],
    down: ['أسفل', 'aşağı'],
    back: ['إلى الخلف', 'geri'],
    around: ['حول', 'etrafında'],
    also: ['أيضًا', 'ayrıca'],
    too: ['أيضًا', 'de / fazla'],
    even: ['حتى', 'bile'],
    just: ['فقط / للتو', 'sadece'],
    only: ['فقط', 'yalnızca'],
    still: ['ما زال', 'hâlâ'],
    already: ['بالفعل', 'zaten'],
    well: ['جيدًا', 'iyi'],

    /* ---- time ---- */
    time: ['وقت', 'zaman'],
    now: ['الآن', 'şimdi'],
    today: ['اليوم', 'bugün'],
    tomorrow: ['غدًا', 'yarın'],
    yesterday: ['أمس', 'dün'],
    day: ['يوم', 'gün'],
    week: ['أسبوع', 'hafta'],
    month: ['شهر', 'ay'],
    year: ['سنة', 'yıl'],
    hour: ['ساعة', 'saat'],
    minute: ['دقيقة', 'dakika'],
    morning: ['صباح', 'sabah'],
    night: ['ليل', 'gece'],
    always: ['دائمًا', 'her zaman'],
    never: ['أبدًا', 'asla'],
    sometimes: ['أحيانًا', 'bazen'],
    often: ['غالبًا', 'sık sık'],
    again: ['مرة أخرى', 'tekrar'],
    soon: ['قريبًا', 'yakında'],
    future: ['المستقبل', 'gelecek'],
    past: ['الماضي', 'geçmiş'],

    /* ---- quantity ---- */
    very: ['جدًا', 'çok'],
    more: ['أكثر', 'daha fazla'],
    most: ['الأكثر', 'en çok'],
    less: ['أقل', 'daha az'],
    much: ['كثير', 'çok'],
    many: ['كثير / عديد', 'birçok'],
    few: ['قليل', 'az'],
    all: ['كل', 'hepsi'],
    some: ['بعض', 'bazı'],
    any: ['أيّ', 'herhangi'],
    none: ['لا شيء', 'hiçbiri'],
    every: ['كل', 'her'],
    other: ['آخر', 'diğer'],
    another: ['آخر', 'başka'],
    same: ['نفس', 'aynı'],
    different: ['مختلف', 'farklı'],
    enough: ['كافٍ', 'yeterli'],

    /* ---- common verbs ---- */
    be: ['يكون', 'olmak'],
    have: ['يملك', 'sahip olmak'],
    do: ['يفعل', 'yapmak'],
    say: ['يقول', 'söylemek'],
    go: ['يذهب', 'gitmek'],
    come: ['يأتي', 'gelmek'],
    get: ['يحصل على', 'almak'],
    make: ['يصنع', 'yapmak'],
    know: ['يعرف', 'bilmek'],
    think: ['يفكر', 'düşünmek'],
    see: ['يرى', 'görmek'],
    look: ['ينظر', 'bakmak'],
    want: ['يريد', 'istemek'],
    need: ['يحتاج', 'ihtiyaç duymak'],
    give: ['يعطي', 'vermek'],
    take: ['يأخذ', 'almak'],
    find: ['يجد', 'bulmak'],
    tell: ['يخبر', 'anlatmak'],
    ask: ['يسأل', 'sormak'],
    work: ['يعمل / عمل', 'çalışmak / iş'],
    call: ['يتصل / ينادي', 'aramak'],
    try: ['يحاول', 'denemek'],
    use: ['يستخدم', 'kullanmak'],
    feel: ['يشعر', 'hissetmek'],
    become: ['يصبح', 'olmak'],
    leave: ['يغادر', 'ayrılmak'],
    put: ['يضع', 'koymak'],
    mean: ['يعني', 'demek / anlamına gelmek'],
    keep: ['يحتفظ', 'tutmak'],
    let: ['يسمح / يدع', 'izin vermek'],
    begin: ['يبدأ', 'başlamak'],
    start: ['يبدأ', 'başlamak'],
    help: ['يساعد', 'yardım etmek'],
    talk: ['يتحدث', 'konuşmak'],
    speak: ['يتكلم', 'konuşmak'],
    show: ['يُظهر / يعرض', 'göstermek'],
    hear: ['يسمع', 'duymak'],
    listen: ['يستمع', 'dinlemek'],
    play: ['يلعب', 'oynamak'],
    run: ['يركض / يُشغّل', 'koşmak'],
    move: ['يتحرك', 'hareket etmek'],
    like: ['يحب', 'beğenmek'],
    live: ['يعيش', 'yaşamak'],
    believe: ['يصدّق', 'inanmak'],
    bring: ['يُحضِر', 'getirmek'],
    happen: ['يحدث', 'olmak'],
    write: ['يكتب', 'yazmak'],
    read: ['يقرأ', 'okumak'],
    send: ['يرسل', 'göndermek'],
    meet: ['يقابل / يجتمع', 'buluşmak'],
    pay: ['يدفع', 'ödemek'],
    learn: ['يتعلم', 'öğrenmek'],
    understand: ['يفهم', 'anlamak'],
    change: ['يغيّر / تغيير', 'değiştirmek'],
    follow: ['يتبع', 'takip etmek'],
    stop: ['يتوقف', 'durmak'],
    create: ['يُنشئ', 'oluşturmak'],
    open: ['يفتح', 'açmak'],
    close: ['يغلق', 'kapatmak'],
    wait: ['ينتظر', 'beklemek'],
    buy: ['يشتري', 'satın almak'],
    sell: ['يبيع', 'satmak'],
    build: ['يبني', 'inşa etmek'],
    add: ['يضيف', 'eklemek'],
    remember: ['يتذكر', 'hatırlamak'],
    forget: ['ينسى', 'unutmak'],
    love: ['يحب', 'sevmek'],
    hope: ['يأمل', 'ummak'],
    check: ['يتحقق / يفحص', 'kontrol etmek'],
    agree: ['يوافق', 'katılmak'],
    explain: ['يشرح', 'açıklamak'],
    decide: ['يقرر', 'karar vermek'],
    choose: ['يختار', 'seçmek'],
    win: ['يفوز', 'kazanmak'],
    lose: ['يخسر', 'kaybetmek'],
    grow: ['ينمو', 'büyümek'],

    /* ---- common nouns ---- */
    people: ['ناس', 'insanlar'],
    person: ['شخص', 'kişi'],
    man: ['رجل', 'adam'],
    woman: ['امرأة', 'kadın'],
    child: ['طفل', 'çocuk'],
    friend: ['صديق', 'arkadaş'],
    family: ['عائلة', 'aile'],
    world: ['عالم', 'dünya'],
    country: ['دولة / بلد', 'ülke'],
    city: ['مدينة', 'şehir'],
    home: ['منزل', 'ev'],
    house: ['بيت', 'ev'],
    school: ['مدرسة', 'okul'],
    job: ['وظيفة', 'iş'],
    company: ['شركة', 'şirket'],
    money: ['مال', 'para'],
    business: ['عمل تجاري', 'iş'],
    problem: ['مشكلة', 'sorun'],
    question: ['سؤال', 'soru'],
    answer: ['إجابة', 'cevap'],
    idea: ['فكرة', 'fikir'],
    word: ['كلمة', 'kelime'],
    name: ['اسم', 'isim'],
    number: ['رقم', 'sayı'],
    place: ['مكان', 'yer'],
    thing: ['شيء', 'şey'],
    way: ['طريقة / طريق', 'yol'],
    part: ['جزء', 'parça'],
    end: ['نهاية', 'son'],
    case: ['حالة', 'durum'],
    point: ['نقطة', 'nokta'],
    group: ['مجموعة', 'grup'],
    team: ['فريق', 'takım'],
    meeting: ['اجتماع', 'toplantı'],
    project: ['مشروع', 'proje'],
    plan: ['خطة', 'plan'],
    report: ['تقرير', 'rapor'],
    email: ['بريد إلكتروني', 'e-posta'],
    phone: ['هاتف', 'telefon'],
    computer: ['حاسوب', 'bilgisayar'],
    internet: ['إنترنت', 'internet'],
    book: ['كتاب', 'kitap'],
    water: ['ماء', 'su'],
    food: ['طعام', 'yemek'],
    car: ['سيارة', 'araba'],
    room: ['غرفة', 'oda'],
    door: ['باب', 'kapı'],
    hand: ['يد', 'el'],
    eye: ['عين', 'göz'],
    head: ['رأس', 'baş'],
    life: ['حياة', 'hayat'],
    light: ['ضوء', 'ışık'],
    story: ['قصة', 'hikaye'],
    fact: ['حقيقة', 'gerçek'],
    example: ['مثال', 'örnek'],
    information: ['معلومات', 'bilgi'],
    data: ['بيانات', 'veri'],
    service: ['خدمة', 'hizmet'],
    system: ['نظام', 'sistem'],
    price: ['سعر', 'fiyat'],
    market: ['سوق', 'pazar'],
    product: ['منتج', 'ürün'],
    customer: ['عميل', 'müşteri'],
    order: ['طلب', 'sipariş'],
    result: ['نتيجة', 'sonuç'],
    reason: ['سبب', 'sebep'],
    goal: ['هدف', 'hedef'],
    power: ['قوة / طاقة', 'güç'],
    energy: ['طاقة', 'enerji'],
    health: ['صحة', 'sağlık'],
    music: ['موسيقى', 'müzik'],
    game: ['لعبة', 'oyun'],

    /* ---- adjectives ---- */
    good: ['جيد', 'iyi'],
    bad: ['سيئ', 'kötü'],
    big: ['كبير', 'büyük'],
    small: ['صغير', 'küçük'],
    new: ['جديد', 'yeni'],
    old: ['قديم / كبير السن', 'eski'],
    great: ['عظيم / رائع', 'harika'],
    high: ['عالٍ', 'yüksek'],
    low: ['منخفض', 'düşük'],
    long: ['طويل', 'uzun'],
    short: ['قصير', 'kısa'],
    right: ['صحيح / يمين', 'doğru'],
    wrong: ['خاطئ', 'yanlış'],
    true: ['صحيح / حقيقي', 'doğru'],
    easy: ['سهل', 'kolay'],
    hard: ['صعب / صلب', 'zor'],
    difficult: ['صعب', 'zor'],
    important: ['مهم', 'önemli'],
    early: ['مبكر', 'erken'],
    late: ['متأخر', 'geç'],
    fast: ['سريع', 'hızlı'],
    slow: ['بطيء', 'yavaş'],
    happy: ['سعيد', 'mutlu'],
    sad: ['حزين', 'üzgün'],
    nice: ['لطيف', 'güzel'],
    beautiful: ['جميل', 'güzel'],
    strong: ['قوي', 'güçlü'],
    weak: ['ضعيف', 'zayıf'],
    hot: ['حار', 'sıcak'],
    cold: ['بارد', 'soğuk'],
    full: ['ممتلئ', 'dolu'],
    empty: ['فارغ', 'boş'],
    free: ['مجاني / حر', 'ücretsiz / özgür'],
    ready: ['جاهز', 'hazır'],
    sure: ['متأكد', 'emin'],
    clear: ['واضح', 'açık'],
    possible: ['ممكن', 'mümkün'],
    real: ['حقيقي', 'gerçek'],
    best: ['الأفضل', 'en iyi'],
    better: ['أفضل', 'daha iyi'],
    next: ['التالي', 'sonraki'],
    last: ['الأخير', 'son'],
    first: ['الأول', 'ilk'],
    able: ['قادر', 'yetenekli'],
    available: ['متاح', 'mevcut'],
    really: ['حقًا', 'gerçekten'],
    actually: ['في الواقع', 'aslında'],
    together: ['معًا', 'birlikte'],

    /* ---- "every-/some-/no-" words ---- */
    everyone: ['الجميع', 'herkes'],
    everybody: ['الجميع', 'herkes'],
    everything: ['كل شيء', 'her şey'],
    someone: ['شخص ما', 'biri'],
    something: ['شيء ما', 'bir şey'],
    nothing: ['لا شيء', 'hiçbir şey'],
    here: ['هنا', 'burada'],
    there: ['هناك', 'orada'],

    /* ---- numbers ---- */
    one: ['واحد', 'bir'],
    two: ['اثنان', 'iki'],
    three: ['ثلاثة', 'üç'],
    four: ['أربعة', 'dört'],
    five: ['خمسة', 'beş'],
    six: ['ستة', 'altı'],
    seven: ['سبعة', 'yedi'],
    eight: ['ثمانية', 'sekiz'],
    nine: ['تسعة', 'dokuz'],
    ten: ['عشرة', 'on'],
    hundred: ['مئة', 'yüz'],
    thousand: ['ألف', 'bin'],
    million: ['مليون', 'milyon']
  };

  /**
   * Build a small list of candidate base forms for a word, so common
   * inflections still match a dictionary entry. Order = most likely first.
   */
  function forms(raw) {
    const base = String(raw || '').toLowerCase().replace(/[^a-z']/g, '');
    const out = [];
    const push = (x) => {
      if (x && x.length >= 2 && !out.includes(x)) out.push(x);
    };
    push(base);
    if (base.endsWith('ies')) push(base.slice(0, -3) + 'y'); // studies -> study
    if (base.endsWith('ied')) push(base.slice(0, -3) + 'y'); // tried -> try
    if (base.endsWith('es')) push(base.slice(0, -2));        // boxes -> box
    if (base.endsWith('s')) push(base.slice(0, -1));         // books -> book
    if (base.endsWith('ing')) {                              // making -> mak / make
      push(base.slice(0, -3));
      push(base.slice(0, -3) + 'e');
    }
    if (base.endsWith('ed')) {                               // worked -> work / like
      push(base.slice(0, -2));
      push(base.slice(0, -1));
    }
    if (base.endsWith('ly')) push(base.slice(0, -2));        // quickly -> quick
    if (base.endsWith('est')) push(base.slice(0, -3));       // fastest -> fast
    if (base.endsWith('er')) push(base.slice(0, -2));        // faster -> fast
    return out;
  }

  /**
   * Translate a single English word into `lang` ('ar' | 'tr').
   * Returns '' when the word isn't in the built-in dictionary (or lang is 'en').
   */
  function lookup(word, lang) {
    if (lang !== 'ar' && lang !== 'tr') return '';
    for (const f of forms(word)) {
      const entry = WORDS[f];
      if (entry) return lang === 'ar' ? entry[0] : entry[1];
    }
    return '';
  }

  /** True if the word (or a simple inflection) is in the dictionary. */
  function has(word) {
    return forms(word).some((f) => WORDS[f]);
  }

  global.MVDict = { lookup, has, size: Object.keys(WORDS).length };
})(typeof self !== 'undefined' ? self : window);
