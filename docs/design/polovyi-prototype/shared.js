/* ===== Shared demo data + behaviours for all five єПластун design proposals ===== */
(function () {
  'use strict';

  /* ---------- "Photos": generated SVG so the artifact needs no external images ---------- */
  const ICONS = {
    tent: (c) => `<polygon points="14,80 50,20 86,80" fill="${c.main}"/><polygon points="50,20 86,80 66,80" fill="${c.dark}"/><polygon points="41,80 50,57 59,80" fill="${c.deep}"/><line x1="50" y1="20" x2="50" y2="12" stroke="${c.deep}" stroke-width="2.5"/>`,
    axe: (c) => `<rect x="47" y="18" width="7" height="66" rx="3" fill="${c.wood}" transform="rotate(18 50 50)"/><path d="M40 16 L70 12 Q76 26 68 38 L42 34 Z" fill="${c.metal}" transform="rotate(18 50 50)"/><path d="M68 12 Q76 26 68 38" stroke="${c.light}" stroke-width="2" fill="none" transform="rotate(18 50 50)"/>`,
    pot: (c) => `<path d="M24 44 H76 L71 76 Q50 86 29 76 Z" fill="${c.metal}"/><ellipse cx="50" cy="44" rx="26" ry="6" fill="${c.dark}"/><path d="M26 44 Q50 6 74 44" stroke="${c.deep}" stroke-width="2.5" fill="none"/><path d="M34 58 Q50 64 66 58" stroke="${c.light}" stroke-width="2" fill="none"/>`,
    lantern: (c) => `<path d="M38 18 Q50 6 62 18" stroke="${c.deep}" stroke-width="3" fill="none"/><rect x="33" y="18" width="34" height="8" rx="2" fill="${c.dark}"/><rect x="36" y="26" width="28" height="44" rx="4" fill="${c.glass}"/><path d="M50 36 Q58 48 50 60 Q42 48 50 36 Z" fill="${c.flame}"/><rect x="33" y="70" width="34" height="10" rx="2" fill="${c.dark}"/>`,
    rope: (c) => `<g fill="none" stroke="${c.main}" stroke-width="5"><circle cx="50" cy="52" r="28"/><circle cx="50" cy="52" r="20" stroke="${c.dark}"/><circle cx="50" cy="52" r="12"/></g><path d="M78 52 Q90 70 80 86" stroke="${c.main}" stroke-width="5" fill="none"/>`,
    saw: (c) => `<path d="M16 40 H72 L72 58 H16 Z" fill="${c.metal}"/><path d="M16 58 l4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6 4 6 4-6" fill="${c.metal}"/><rect x="70" y="34" width="18" height="30" rx="7" fill="${c.wood}"/><rect x="75" y="42" width="8" height="14" rx="3" fill="${c.bg2}"/>`,
    tarp: (c) => `<polygon points="14,40 86,30 80,66 20,72" fill="${c.main}"/><polygon points="14,40 86,30 83,48 17,56" fill="${c.dark}" opacity=".35"/><g stroke="${c.deep}" stroke-width="1.6"><line x1="14" y1="40" x2="6" y2="88"/><line x1="86" y1="30" x2="94" y2="88"/><line x1="20" y1="72" x2="12" y2="92"/><line x1="80" y1="66" x2="88" y2="92"/></g>`,
    flag: (c) => `<rect x="24" y="12" width="4" height="76" fill="${c.deep}"/><path d="M28 16 Q46 8 58 18 T86 18 V48 Q72 40 58 48 T28 48 Z" fill="${c.main}"/><path d="M28 32 Q46 24 58 34 T86 34 V48 Q72 40 58 48 T28 48 Z" fill="${c.flame}"/>`,
    compass: (c) => `<circle cx="50" cy="52" r="32" fill="${c.dark}"/><circle cx="50" cy="52" r="26" fill="${c.glass}"/><polygon points="50,28 56,52 50,76 44,52" fill="${c.flame}"/><polygon points="50,52 56,52 50,76 44,52" fill="${c.deep}"/><circle cx="50" cy="52" r="3" fill="${c.dark}"/>`,
    aid: (c) => `<rect x="18" y="30" width="64" height="48" rx="8" fill="${c.main}"/><rect x="38" y="20" width="24" height="12" rx="4" fill="none" stroke="${c.dark}" stroke-width="4"/><rect x="45" y="40" width="10" height="28" fill="${c.light}"/><rect x="36" y="49" width="28" height="10" fill="${c.light}"/>`,
    shovel: (c) => `<rect x="47" y="10" width="6" height="52" rx="3" fill="${c.wood}"/><rect x="40" y="8" width="20" height="7" rx="3" fill="${c.wood}"/><path d="M36 60 H64 V74 Q50 94 36 74 Z" fill="${c.metal}"/>`,
    fire: (c) => `<g fill="${c.wood}"><rect x="22" y="72" width="56" height="8" rx="4" transform="rotate(12 50 76)"/><rect x="22" y="72" width="56" height="8" rx="4" transform="rotate(-12 50 76)"/></g><path d="M50 22 Q70 46 62 64 Q58 74 50 74 Q38 74 36 62 Q34 50 44 42 Q44 54 50 56 Q46 40 50 22 Z" fill="${c.flame}"/><path d="M50 50 Q58 60 54 68 Q50 72 46 68 Q44 60 50 50 Z" fill="${c.light}"/>`,
  };

  function palette(h) {
    return {
      bg1: `hsl(${h} 32% 82%)`, bg2: `hsl(${(h + 30) % 360} 28% 66%)`, ground: `hsl(${h} 20% 40% / .28)`,
      main: `hsl(${(h + 180) % 360} 45% 42%)`, dark: `hsl(${(h + 180) % 360} 40% 28%)`, deep: `hsl(${h} 30% 18%)`,
      light: `hsl(${h} 60% 94%)`, wood: 'hsl(28 45% 38%)', metal: 'hsl(210 8% 52%)', glass: `hsl(${h} 50% 90%)`, flame: 'hsl(36 95% 55%)',
    };
  }

  // shot 0 = whole object, 1 = close-up, 2 = from another side, 3 = in the box
  function photo(icon, hue, shot = 0, extra = '') {
    const c = palette(hue);
    const t = [
      'translate(0 0) scale(1)',
      'translate(-38 -30) scale(1.75)',
      'translate(100 4) scale(-0.92 0.92)',
      'translate(18 18) scale(.64)',
    ][shot % 4];
    const box = shot % 4 === 3 ? `<rect x="10" y="44" width="80" height="46" rx="3" fill="hsl(30 35% 52%)"/><rect x="10" y="44" width="80" height="8" fill="hsl(30 35% 42%)"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg1}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient></defs><rect width="100" height="75" fill="url(#g)"/><ellipse cx="50" cy="66" rx="40" ry="7" fill="${c.ground}"/><g transform="translate(14 -6) scale(.72)"><g transform="${t}">${ICONS[icon](c)}</g></g>${box}${extra}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function scene(icons, hue, seed = 0) {
    const c = palette(hue);
    const parts = icons.map((ic, i) => {
      const x = 8 + i * (84 / icons.length) + ((seed * 7 + i * 5) % 6);
      const s = 0.42 + ((seed + i) % 3) * 0.06;
      return `<g transform="translate(${x} ${22 + ((seed + i) % 2) * 6}) scale(${s})">${ICONS[ic](palette((hue + i * 40) % 360))}</g>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 86%)"/><stop offset=".62" stop-color="hsl(${(hue + 20) % 360} 35% 74%)"/><stop offset=".62" stop-color="hsl(110 25% 46%)"/><stop offset="1" stop-color="hsl(110 28% 34%)"/></linearGradient></defs><rect width="100" height="62" fill="url(#s)"/><path d="M0 40 L18 22 L32 34 L50 14 L70 36 L84 24 L100 38 V62 H0Z" fill="hsl(${(hue + 160) % 360} 18% 52% / .45)"/>${parts}<circle cx="${80 - seed * 9}" cy="12" r="5" fill="hsl(44 95% 70%)"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- Demo data (fictional, matches the real app's fields) ---------- */
  const P = (first, last, nick) => ({ first, last, nick, initials: first[0] + last[0] });
  const people = {
    kurinnyi: P('Остап', 'Мельник', 'Сокіл'), suddia: P('Тарас', 'Бойко'), pysar: P('Назар', 'Шевчук', 'Перо'),
    skarbnyk: P('Максим', 'Ткачук'), intendant: P('Данило', 'Гнатюк', 'Ключ'), khorunzhyi: P('Юрко', 'Савчук'),
    smm: P('Богдан', 'Лисенко'), zvyazkovyi: P('Андрій', 'Коваль'),
  };

  const kurin = {
    name: 'Курінь ч. 307 «Чорногора»', short: '«Чорногора»', number: '307', stanytsia: 'Львів', gender: 'Чоловіча',
    program: 'Нова', drive: { connected: true, email: 'kurin307@gmail.com', folder: 'Реманент 2026' },
    founded: '2019', members: 34, hurtkyCount: 4,
  };

  const provid = [
    { role: 'Курінний', who: people.kurinnyi, since: 'вересень 2025' },
    { role: 'Суддя', who: people.suddia, since: 'вересень 2025' },
    { role: 'Писар', who: people.pysar, since: 'жовтень 2025' },
    { role: 'Скарбник', who: people.skarbnyk, since: 'вересень 2025' },
    { role: 'Інтендант', who: people.intendant, since: 'січень 2026' },
    { role: 'Хорунжий', who: people.khorunzhyi, since: 'вересень 2025' },
    { role: 'СММник', who: people.smm, since: 'березень 2026' },
  ];

  const hurtky = [
    { name: 'Беркути', number: '1', hurtkovyi: 'Марко Кравець', vykhovnyk: 'Ярема Олійник', count: 9, founded: '2019', color: 145 },
    { name: 'Рисі', number: '2', hurtkovyi: 'Іван Поліщук', vykhovnyk: 'Роман Гуменюк', count: 8, founded: '2021', color: 30 },
    { name: 'Тури', number: '3', hurtkovyi: 'Святослав Дячук', vykhovnyk: 'Нестор Гладун', count: 9, founded: '2023', color: 210 },
    { name: 'Вовки', number: '4', hurtkovyi: 'Захар Петрук', vykhovnyk: 'Олесь Мороз', count: 8, founded: '2025', color: 280 },
  ];

  const degrees = ['Учасник', 'Розвідувач', 'Скоб'];
  const names = [
    ['Марко', 'Кравець'], ['Іван', 'Поліщук'], ['Святослав', 'Дячук'], ['Захар', 'Петрук'], ['Влад', 'Костюк'],
    ['Тимко', 'Зінчук'], ['Степан', 'Яворський'], ['Ілля', 'Бондар'], ['Олег', 'Федорів'], ['Михайло', 'Стасюк'],
    ['Петро', 'Вовк'], ['Арсен', 'Гаврилюк'], ['Денис', 'Маркевич'], ['Віталій', 'Сорока'], ['Лев', 'Білик'],
    ['Кирило', 'Танчак'], ['Матвій', 'Дорош'], ['Орест', 'Кушнір'], ['Ростислав', 'Мисак'], ['Ярослав', 'Пасічник'],
  ];
  const roster = names.map(([f, l], i) => ({
    id: 'j' + i, first: f, last: l, initials: f[0] + l[0],
    hurtok: hurtky[i % 4].name, degree: degrees[(i * 7) % 3], born: 2010 + (i % 5),
    progress: [92, 64, 38, 81, 55, 17, 73, 46, 88, 29, 60, 9, 77, 51, 34, 69, 42, 95, 23, 58][i],
  }));

  const REACTIONS = [['THUMBS_UP', '👍'], ['HEART', '❤️'], ['CLAP', '👏'], ['WOW', '😮'], ['LAUGH', '😂'], ['SAD', '😢']];

  const news = [
    {
      id: 'n1', pinned: true, tag: 'Збірка', author: people.kurinnyi, role: 'Курінний', date: '2026-11-11T18:20',
      title: 'Збірка куреня в неділю: готуємось до осіннього рейду',
      body: ['Неділя, 15 листопада, 10:00, Домівка на Городоцькій. Беремо однострій, нотатник проб і теплий одяг: частина програми надворі.',
        'Після загальної частини гуртки розходяться на свої заняття. Беркути та Рисі мають в’язання вузлів, Тури й Вовки орієнтування.'],
      event: { when: 'Нд, 15 листопада · 10:00', where: 'Домівка, вул. Городоцька 14' },
      photos: [], reactions: { THUMBS_UP: 14, HEART: 3, CLAP: 5 }, mine: 'THUMBS_UP', comments: 4,
    },
    {
      id: 'n2', tag: 'Табір', author: people.smm, role: 'СММник', date: '2026-11-09T12:05',
      title: 'Фото з осіннього табору «Сокільська скеля»',
      body: ['Три дні, дві ночі, один дощ і жодного промоклого спальника. Дякуємо інтендантові за нові тенти.',
        'Повний альбом у папці куреня на Google Drive, тут найкращі кадри.'],
      photos: [scene(['tent', 'fire', 'flag'], 120, 0), scene(['tent', 'tent', 'tarp'], 200, 1), scene(['fire', 'pot', 'lantern'], 30, 2), scene(['flag', 'compass'], 260, 3), scene(['tent', 'lantern'], 340, 1)],
      reactions: { HEART: 22, WOW: 6, CLAP: 9, LAUGH: 2 }, mine: null, comments: 11,
    },
    {
      id: 'n3', tag: 'Проби', author: people.suddia, role: 'Суддя', date: '2026-11-06T20:40',
      title: 'Здача проби з першої допомоги: запис до 20 листопада',
      body: ['Хто готовий здавати пункти з першої допомоги, запишіться у свого гурткового. Практичне заняття проведе пластун-медик.',
        'Що треба знати: зупинку кровотечі, накладання пов’язки, стабільне бокове положення.'],
      list: ['Пов’язка на руку та коліно', 'Стабільне бокове положення', 'Дзвінок 103: що казати'],
      photos: [photo('aid', 0, 0)], reactions: { THUMBS_UP: 9, CLAP: 2 }, mine: null, comments: 2,
    },
    {
      id: 'n4', tag: 'Інтендантство', author: people.intendant, role: 'Інтендант', date: '2026-11-03T09:15',
      title: 'Повернути спорядження після табору до неділі',
      body: ['Два казанки, пилка та ліхтар ще не повернулись на склад. Перевірте наплічники, будь ласка. Список видачі у вкладці «Інтендантство».'],
      photos: [photo('pot', 40, 0), photo('saw', 200, 0), photo('lantern', 260, 0)],
      reactions: { THUMBS_UP: 6, SAD: 1, LAUGH: 3 }, mine: 'LAUGH', comments: 0,
    },
    {
      id: 'n5', tag: 'Оголошення', author: people.zvyazkovyi, role: 'Звʼязковий', date: '2026-10-28T17:00',
      title: 'Внески за осінь: до кінця листопада',
      body: ['Курінний внесок 300 грн на осінь. Передайте скарбникові на збірці або переказом, реквізити в чаті куреня.'],
      photos: [], reactions: { THUMBS_UP: 11 }, mine: null, comments: 1,
    },
  ];

  const CATS = ['Табірне', 'Кухня', 'Інструмент', 'Світло', 'Вузли та мотузки', 'Безпека'];
  const inventory = [
    { id: 'i1', name: 'Намет «Карпати-4»', cat: 'Табірне', icon: 'tent', hue: 140, qty: 3, place: 'Склад, полиця A', condition: 'Добрий', desc: 'Чотиримісний, двошаровий. Один має латку на тенті.', lent: null },
    { id: 'i2', name: 'Тент 3×4 м', cat: 'Табірне', icon: 'tarp', hue: 190, qty: 4, place: 'Склад, полиця A', condition: 'Новий', desc: 'Куплені у жовтні 2026, з розтяжками.', lent: { who: 'Гурток «Тури»', due: '2026-11-16' } },
    { id: 'i3', name: 'Казанок 8 л', cat: 'Кухня', icon: 'pot', hue: 40, qty: 5, place: 'Скриня «Кухня»', condition: 'Добрий', desc: 'Алюмінієві, з кришками. Два ще не повернули після табору.', lent: { who: 'Влад Костюк', due: '2026-11-09', overdue: true } },
    { id: 'i4', name: 'Сокира туристична', cat: 'Інструмент', icon: 'axe', hue: 10, qty: 2, place: 'Шафа з замком', condition: 'Потребує заточки', desc: 'Видається лише гуртковим і старшим.', lent: null },
    { id: 'i5', name: 'Пилка складна', cat: 'Інструмент', icon: 'saw', hue: 210, qty: 2, place: 'Шафа з замком', condition: 'Добрий', desc: 'Полотно по дереву 30 см.', lent: { who: 'Марко Кравець', due: '2026-11-08', overdue: true } },
    { id: 'i6', name: 'Ліхтар газовий', cat: 'Світло', icon: 'lantern', hue: 260, qty: 3, place: 'Скриня «Світло»', condition: 'Добрий', desc: 'Картриджі зберігаються окремо.', lent: null },
    { id: 'i7', name: 'Мотузка статична 30 м', cat: 'Вузли та мотузки', icon: 'rope', hue: 80, qty: 6, place: 'Склад, гачки', condition: 'Добрий', desc: 'Для навчання вузлів і переправ. Не для страховки.', lent: null },
    { id: 'i8', name: 'Аптечка табірна', cat: 'Безпека', icon: 'aid', hue: 0, qty: 2, place: 'Шафа біля входу', condition: 'Перевірити терміни', desc: 'Остання перевірка у вересні 2026.', lent: null },
    { id: 'i9', name: 'Компас Silva', cat: 'Безпека', icon: 'compass', hue: 300, qty: 10, place: 'Скриня «Орієнтування»', condition: 'Добрий', desc: 'Для занять з орієнтування.', lent: { who: 'Гурток «Вовки»', due: '2026-11-22' } },
    { id: 'i10', name: 'Прапор куреня', cat: 'Табірне', icon: 'flag', hue: 160, qty: 1, place: 'Хорунжий', condition: 'Добрий', desc: 'Відповідає хорунжий.', lent: null },
    { id: 'i11', name: 'Лопата саперна', cat: 'Інструмент', icon: 'shovel', hue: 100, qty: 3, place: 'Склад, кут', condition: 'Добрий', desc: 'Для табору і ватри.', lent: null },
  ];
  inventory.forEach((it, idx) => {
    const n = 2 + (idx % 3);
    it.photos = Array.from({ length: n }, (_, s) => photo(it.icon, (it.hue + s * 25) % 360, s));
  });

  /* ---------- Formatting ---------- */
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const NOW = new Date('2026-11-12T10:00');
  function fmtDate(iso, withTime) {
    const d = new Date(iso);
    const days = Math.floor((NOW - d) / 86400000);
    if (days === 0) return 'сьогодні' + (withTime ? ', ' + d.toTimeString().slice(0, 5) : '');
    if (days === 1) return 'учора' + (withTime ? ', ' + d.toTimeString().slice(0, 5) : '');
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  function fmtDue(iso) { const d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /* ---------- Reactions (shared markup, each design styles .rx) ---------- */
  function reactionsHTML(post, opts = {}) {
    const shown = REACTIONS.filter(([k]) => opts.all || post.reactions[k] || post.mine === k || ['THUMBS_UP', 'HEART'].includes(k));
    return shown.map(([k, e]) => {
      const n = post.reactions[k] || 0;
      return `<button type="button" class="rx${post.mine === k ? ' on' : ''}" data-react="${post.id}:${k}" aria-pressed="${post.mine === k}" aria-label="Реакція ${e}${n ? ', ' + n : ''}"><span class="rx-e">${e}</span>${n ? `<span class="rx-n">${n}</span>` : ''}</button>`;
    }).join('');
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-react]');
    if (!b) return;
    const [id, k] = b.dataset.react.split(':');
    const post = news.find((p) => p.id === id);
    if (post.mine) post.reactions[post.mine] = Math.max(0, (post.reactions[post.mine] || 1) - 1);
    if (post.mine === k) post.mine = null; else { post.mine = k; post.reactions[k] = (post.reactions[k] || 0) + 1; }
    const bar = b.closest('[data-rx-bar]');
    bar.innerHTML = reactionsHTML(post, { all: bar.dataset.rxBar === 'all' });
  });

  /* ---------- Carousel + lightbox ---------- */
  let cid = 0;
  const registry = {};
  function carousel(photos, opts = {}) {
    const id = 'cz' + ++cid;
    registry[id] = { photos, opts };
    const nav = photos.length > 1;
    return `<div class="cz cz--${opts.nav || 'dots'}" data-cz="${id}" style="--cz-ratio:${opts.ratio || '4/3'}">
      <div class="cz-stage">
        <div class="cz-track" tabindex="0" aria-roledescription="карусель" aria-label="${esc(opts.label || 'Фото')}">
          ${photos.map((src, i) => `<button type="button" class="cz-slide" data-cz-open="${i}" aria-label="Відкрити фото ${i + 1} з ${photos.length}"><img src="${src}" alt="${esc(opts.label || 'Фото')} ${i + 1}" loading="lazy" draggable="false"></button>`).join('')}
        </div>
        ${nav && opts.nav !== 'bar' ? `<button type="button" class="cz-btn cz-prev" data-cz-step="-1" aria-label="Попереднє фото">‹</button><button type="button" class="cz-btn cz-next" data-cz-step="1" aria-label="Наступне фото">›</button><span class="cz-count"><b>1</b>/${photos.length}</span>` : ''}
      </div>
      ${opts.captions ? `<p class="cz-cap" aria-live="polite"><b>1/${photos.length}</b> · <span>${esc(opts.captions[0] || '')}</span></p>` : ''}
      ${nav && opts.nav === 'bar' ? `<div class="cz-bar"><button type="button" class="cz-bbtn" data-cz-step="-1" aria-label="Попереднє фото">‹</button><div class="cz-dots">${photos.map((_, i) => `<button type="button" class="cz-dot${i ? '' : ' on'}" data-cz-go="${i}" aria-label="Фото ${i + 1} з ${photos.length}"></button>`).join('')}</div><button type="button" class="cz-bbtn" data-cz-step="1" aria-label="Наступне фото">›</button></div>` : ''}
      ${nav && (opts.nav || 'dots') === 'dots' ? `<div class="cz-dots">${photos.map((_, i) => `<button type="button" class="cz-dot${i ? '' : ' on'}" data-cz-go="${i}" aria-label="Фото ${i + 1}"></button>`).join('')}</div>` : ''}
      ${nav && opts.nav === 'thumbs' ? `<div class="cz-thumbs">${photos.map((src, i) => `<button type="button" class="cz-thumb${i ? '' : ' on'}" data-cz-go="${i}" aria-label="Фото ${i + 1}"><img src="${src}" alt=""></button>`).join('')}</div>` : ''}
    </div>`;
  }
  function czIndex(root) { const t = root.querySelector('.cz-track'); return Math.round(t.scrollLeft / Math.max(1, t.clientWidth)); }
  function czGo(root, i) {
    const t = root.querySelector('.cz-track');
    const n = t.children.length;
    i = (i + n) % n;
    t.scrollTo({ left: i * t.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function czSync(root) {
    const i = czIndex(root);
    root.querySelectorAll('[data-cz-go]').forEach((d) => d.classList.toggle('on', +d.dataset.czGo === i));
    const c = root.querySelector('.cz-count b'); if (c) c.textContent = i + 1;
    const cap = root.querySelector('.cz-cap'); const reg = registry[root.dataset.cz];
    if (cap && reg && reg.opts.captions) { cap.querySelector('b').textContent = (i + 1) + '/' + reg.photos.length; cap.querySelector('span').textContent = reg.opts.captions[i] || ''; }
    const th = root.querySelector('.cz-thumb.on'); if (th) th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  document.addEventListener('scroll', (ev) => { const t = ev.target; if (t.classList && t.classList.contains('cz-track')) czSync(t.closest('.cz')); }, true);
  document.addEventListener('click', (ev) => {
    const step = ev.target.closest('[data-cz-step]');
    if (step) { const r = step.closest('.cz'); czGo(r, czIndex(r) + +step.dataset.czStep); return; }
    const go = ev.target.closest('[data-cz-go]');
    if (go) { czGo(go.closest('.cz'), +go.dataset.czGo); return; }
    const open = ev.target.closest('[data-cz-open]');
    if (open && !open.closest('.lb')) { const r = open.closest('.cz'); openLightbox(registry[r.dataset.cz], +open.dataset.czOpen); }
  });
  document.addEventListener('keydown', (ev) => {
    const lbOpen = document.querySelector('.lb:not([hidden])');
    if (lbOpen && ev.key === 'Escape') { closeLightbox(); return; }
    const t = lbOpen ? lbOpen.querySelector('.cz') : (document.activeElement && document.activeElement.closest('.cz'));
    if (!t) return;
    if (ev.key === 'ArrowRight') { czGo(t, czIndex(t) + 1); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft') { czGo(t, czIndex(t) - 1); ev.preventDefault(); }
  });
  function openLightbox(entry, i) {
    let lb = document.querySelector('.lb');
    if (!lb) {
      lb = document.createElement('div');
      lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Перегляд фото');
      document.body.appendChild(lb);
      lb.addEventListener('click', (ev) => { if (ev.target === lb || ev.target.closest('.lb-close')) closeLightbox(); });
    }
    lb.innerHTML = `<button type="button" class="lb-close" aria-label="Закрити">×</button><div class="lb-inner">${carousel(entry.photos, { ...entry.opts, nav: entry.opts.nav === 'thumbs' ? 'thumbs' : 'dots', ratio: '4/3', captions: entry.opts.captions })}</div>`;
    lb.hidden = false;
    document.documentElement.classList.add('lb-lock');
    const r = lb.querySelector('.cz');
    requestAnimationFrame(() => { r.querySelector('.cz-track').scrollLeft = i * r.querySelector('.cz-track').clientWidth; czSync(r); lb.querySelector('.lb-close').focus(); });
  }
  function closeLightbox() { const lb = document.querySelector('.lb'); if (lb) lb.hidden = true; document.documentElement.classList.remove('lb-lock'); }

  /* ---------- Text size: scales the root font size, everything is in rem ---------- */
  const FS = [0.875, 1, 1.125, 1.25, 1.375];
  function applyFs(i) {
    i = Math.max(0, Math.min(FS.length - 1, i));
    document.documentElement.style.setProperty('--fs', FS[i]);
    document.querySelectorAll('[data-fs-label]').forEach((el) => { el.textContent = Math.round(FS[i] * 100) + '%'; });
    document.querySelectorAll('[data-fs-set]').forEach((el) => el.classList.toggle('on', +el.dataset.fsSet === i));
    document.querySelectorAll('input[data-fs-range]').forEach((el) => { el.value = i; });
    try { localStorage.setItem('plast-fs', i); } catch (e) { /* storage blocked */ }
    window.__fs = i;
  }
  document.addEventListener('click', (ev) => {
    const s = ev.target.closest('[data-fs-step]'); if (s) applyFs((window.__fs ?? 1) + +s.dataset.fsStep);
    const t = ev.target.closest('[data-fs-set]'); if (t) applyFs(+t.dataset.fsSet);
  });
  document.addEventListener('input', (ev) => { if (ev.target.matches('input[data-fs-range]')) applyFs(+ev.target.value); });
  function initFs() { let i = 1; try { const v = localStorage.getItem('plast-fs'); if (v !== null) i = +v; } catch (e) { /* ignore */ } applyFs(i); }

  /* ---------- Hash tabs ---------- */
  function initTabs(render) {
    const show = () => {
      const tab = ['news', 'kurin', 'inventory'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'news';
      document.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
      if (render) render(tab);
    };
    window.addEventListener('hashchange', show);
    document.addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { ev.preventDefault(); if (location.hash !== '#' + b.dataset.tab) location.hash = b.dataset.tab; else show(); window.scrollTo(0, 0); } });
    show();
  }

  window.PLAST = { kurin, provid, hurtky, roster, news, inventory, CATS, REACTIONS, people, photo, scene, carousel, reactionsHTML, fmtDate, fmtDue, esc, initFs, applyFs, initTabs, czGo };
})();
