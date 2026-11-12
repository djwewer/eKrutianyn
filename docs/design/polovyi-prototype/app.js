(function () {
  'use strict';
  const D = window.PLAST, esc = D.esc;
  const root = document.getElementById('root');
  const MON = ['СІЧ', 'ЛЮТ', 'БЕР', 'КВІ', 'ТРА', 'ЧЕР', 'ЛИП', 'СЕР', 'ВЕР', 'ЖОВ', 'ЛИС', 'ГРУ'];
  const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const fmtD = (iso) => { const d = new Date(iso); return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + (d.getFullYear() !== 2026 ? ' ' + d.getFullYear() : ''); };
  const money = (n) => n.toLocaleString('uk-UA') + ' грн';

  /* ================= demo users & extra data ================= */
  const USERS = {
    JUNAK: { role: 'JUNAK', roleLabel: 'Юнак · інтендант', first: 'Данило', last: 'Гнатюк', nick: 'Ключ', initials: 'ДГ', email: 'danylo.hnatiuk@gmail.com', hurtok: 'Тури', positions: ['INTENDANT'], degree: 'Учасник', progress: 64 },
    VYKHOVNYK: { role: 'VYKHOVNYK', roleLabel: 'Виховник', first: 'Ярема', last: 'Олійник', initials: 'ЯО', email: 'yarema.oliinyk@gmail.com', hurtok: 'Беркути', positions: [] },
    ZVYAZKOVYI: { role: 'ZVYAZKOVYI', roleLabel: 'Звʼязковий', first: 'Андрій', last: 'Коваль', initials: 'АК', email: 'andrii.koval@gmail.com', hurtok: null, positions: [], degree: 'Учасник', progress: 41 },
  };
  let session = null;
  try { const s = sessionStorage.getItem('plast-role'); if (s && USERS[s]) session = USERS[s]; } catch (e) { /* ignore */ }
  let loginRole = 'ZVYAZKOVYI';

  const vykhovnyky = D.hurtky.map((h, i) => ({ id: 'v' + i, first: h.vykhovnyk.split(' ')[0], last: h.vykhovnyk.split(' ')[1], hurtok: h.name }));
  const roster = D.roster;
  const findJ = (id) => roster.find((j) => j.id === id);

  const EVENTS = [
    { d: '2026-11-15', t: 'Збірка куреня', p: 'Домівка, 10:00' },
    { d: '2026-11-22', t: 'Орієнтування гуртка «Вовки»', p: 'Стрийський парк, 11:00' },
    { d: '2026-11-29', t: 'Сходини проводу куреня', p: 'Онлайн, 19:00' },
    { d: '2026-12-06', t: 'Пластовий Миколай', p: 'Домівка, 16:00' },
    { d: '2026-12-13', t: 'Зимова прогулянка', p: 'Брюховичі' },
    { d: '2027-01-03', t: 'Зимовий табір «Сніжний барс»', p: 'Карпати, 3–7 січня' },
    { d: '2027-02-14', t: 'Теренова гра', p: 'Винниківський ліс' },
    { d: '2027-04-25', t: 'Свято Юрія і пластова присяга', p: 'Львів' },
  ];
  let approvals = [
    { id: 'a1', type: 'Зміна дати народження', who: 'Ярема Олійник', subj: 'Марко Кравець', from: '12.03.2011', to: '21.03.2011', when: '2026-11-11T19:10' },
    { id: 'a2', type: 'Переведення в інший гурток', who: 'Олесь Мороз', subj: 'Петро Вовк', from: '«Тури»', to: '«Беркути»', when: '2026-11-10T12:40' },
    { id: 'a3', type: 'Створення юнака', who: 'Роман Гуменюк', subj: 'Нестор Ільків', from: '—', to: 'гурток «Рисі», nestor.ilkiv@gmail.com', when: '2026-11-08T17:05' },
    { id: 'a4', type: 'Масовий імпорт юнаків з Книги судді', who: 'Тарас Бойко', subj: '6 рядків', from: '—', to: '4 нові юнаки, 2 оновлення', when: '2026-11-06T21:30' },
  ];
  const AUDIT = [
    { t: '2026-11-12T08:00', who: 'Система', cat: 'Суддівство', text: 'Нічна синхронізація Книги судді: 3 зміни записано в таблицю' },
    { t: '2026-11-11T18:20', who: 'Остап Мельник', cat: 'Оголошення', text: 'Опублікував оголошення «Збірка куреня в неділю»' },
    { t: '2026-11-11T16:02', who: 'Данило Гнатюк', cat: 'Реманент', text: 'Видав «Тент 3×4 м» гуртку «Тури» до 16 листопада' },
    { t: '2026-11-10T20:15', who: 'Ярема Олійник', cat: 'Проби', text: 'Підтвердив точку проби «В’язання вузлів» для Марка Кравця' },
    { t: '2026-11-09T12:05', who: 'Богдан Лисенко', cat: 'Оголошення', text: 'Додав 5 фото до оголошення «Фото з осіннього табору»' },
    { t: '2026-11-07T10:44', who: 'Максим Ткачук', cat: 'Гроші', text: 'Записав прибуток 900 грн: продаж кави на ярмарку' },
    { t: '2026-11-05T09:30', who: 'Андрій Коваль', cat: 'Люди', text: 'Призначив Данила Гнатюка інтендантом куреня' },
    { t: '2026-11-03T18:12', who: 'Тарас Бойко', cat: 'Проби', text: 'Закрив пробу прихильника для Тимка Зінчука' },
  ];
  let treasury = { start: 4200, tx: [
    { d: '2026-11-05', amt: -320, t: 'Поповнення аптечки' },
    { d: '2026-11-02', amt: 900, t: 'Продаж кави на ярмарку' },
    { d: '2026-10-24', amt: -640, t: 'Продукти на осінній табір' },
    { d: '2026-10-12', amt: -1850, t: 'Тенти 3×4 м, 2 шт' },
    { d: '2026-10-10', amt: 3000, t: 'Курінні внески за осінь' },
  ] };
  let activities = [
    { t: 'Осінній табір «Сокільська скеля»', role: 'учасник', d: 'Ставив намети і чергував на кухні' },
    { t: 'Теренівка «Лісова стежка»', role: 'в проводі', d: 'Вів станцію з першої допомоги' },
  ];
  const SKILLS = [
    { g: 'Таборування', items: [['Таборовик', 'Учасник'], ['Кухар', 'Учасник'], ['Піонер', 'Розвідувач'], ['Ватрознавець', 'Учасник']] },
    { g: 'Природа', items: [['Природознавець', 'Учасник'], ['Метеоролог', 'Розвідувач'], ['Орнітолог', 'Розвідувач'], ['Дослідник лісу', 'Учасник', true]] },
    { g: 'Техніка', items: [['Радіоаматор', 'Розвідувач'], ['Картограф', 'Учасник'], ['Фотограф', 'Учасник']] },
    { g: 'Мистецтво та культура', items: [['Співак', 'Учасник'], ['Бандурист', 'Розвідувач'], ['Писанкар', 'Учасник']] },
    { g: 'Спорт', items: [['Пливак', 'Учасник'], ['Лещетар', 'Розвідувач'], ['Веслувальник', 'Розвідувач', true]] },
  ];
  // inventory photos: a few clearly different shots of each item
  D.inventory.forEach((it, idx) => {
    const n = 2 + (idx % 3);
    it.photos = Array.from({ length: n }, (_, s) => D.photo(it.icon, (it.hue + s * 75) % 360, s));
  });

  /* ================= helpers ================= */
  function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
  const isZv = () => session && session.role === 'ZVYAZKOVYI';
  const av = (i) => `<span class="av" aria-hidden="true">${esc(i)}</span>`;
  const I = {
    news: '<path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"/>', cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>', tent: '<path d="M3 20 12 4l9 16zM10 20l2-5 2 5"/>',
    box: '<path d="M4 8h16v12H4zM8 8V5h8v3M4 13h16"/>', scale: '<path d="M12 4v16M5 20h14M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z"/>', pen: '<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
    coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6z"/>', layers: '<path d="M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', plus: '<path d="M12 5v14M5 12h14"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
  };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const chev2 = '<svg class="chev2" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M8 14 20 6l12 8M8 24l12-8 12 8M8 34l12-8 12 8"/></svg>';
  let topoCache = '';
  function topo() {
    if (topoCache) return topoCache;
    let out = '';
    [[560, 120, 13], [180, 230, 8], [760, 260, 6]].forEach(([cx, cy, n], s) => {
      for (let k = 1; k <= n; k++) {
        const r = k * 22, pts = [];
        for (let a = 0; a <= 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          const rr = r * (1 + 0.16 * Math.sin(3 * t + k * 0.5 + s) + 0.09 * Math.cos(5 * t - k * 0.3) + 0.05 * Math.sin(9 * t + s));
          pts.push((cx + rr * Math.cos(t) * 1.35).toFixed(1) + ',' + (cy + rr * Math.sin(t)).toFixed(1));
        }
        out += `<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="${k % 4 === 0 ? 2 : 1}"/>`;
      }
    });
    return (topoCache = `<svg class="topo" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${out}</svg>`);
  }

  /* ================= navigation model (mirrors lib/nav-model.ts) ================= */
  function navModel() {
    const r = session.role;
    const center = r === 'VYKHOVNYK' ? { href: 'my-hurtok', label: 'Мій гурток', icon: 'users' }
      : { href: 'plast', label: r === 'ZVYAZKOVYI' ? 'Моя проба' : 'Моє пластування', icon: 'flag', also: ['proby', 'ai', 'activity', 'skills'] };
    const dil = [
      { href: 'inventory', label: 'Реманент', pos: 'INTENDANT', icon: 'box' },
      { href: 'suddivstvo', label: 'Суддівство', pos: 'SUDDIA', icon: 'scale', also: ['import'] },
      { href: 'pysarstvo', label: 'Писарство', pos: 'PYSAR', icon: 'pen' },
      { href: 'treasury', label: 'Скарбниця', pos: 'SKARBNYK', icon: 'coins' },
    ].filter((p) => r === 'ZVYAZKOVYI' || session.positions.includes(p.pos));
    return {
      left: [{ href: 'news', label: 'Новини', icon: 'news', also: ['news-new'] }, { href: 'calendar', label: 'Календар', icon: 'cal' }],
      center, kurin: { href: 'kurin', label: 'Курінь', icon: 'tent', also: ['user', 'user-new'] }, dil,
      settings: { href: 'prefs', label: 'Налаштування', icon: 'gear', also: ['approvals', 'audit', 'me'], badge: r === 'ZVYAZKOVYI' ? approvals.length : 0 },
    };
  }
  const active = (item, page) => page === item.href || (item.also || []).includes(page);

  function shell(page, html) {
    const n = navModel();
    const tab = (it) => `<a href="#${it.href}" class="${active(it, page) ? 'on' : ''}"${active(it, page) ? ' aria-current="page"' : ''}>${esc(it.label)}${it.badge ? ` <span class="cnt">${it.badge}</span>` : ''}</a>`;
    const bn = (it, cls = '') => `<a href="#${it.href}" class="${cls} ${active(it, page) ? 'on' : ''}"${active(it, page) ? ' aria-current="page"' : ''}>${ic(it.icon)}${esc(it.label)}</a>`;
    const moreActive = n.dil.some((d) => active(d, page)) || active(n.settings, page);
    return `<header class="band"><div class="in">
        <div class="idrow">
          <div class="patch"><div><b>307</b></div></div>
          <div class="grow"><h1>Чорногора</h1><p>КУРІНЬ Ч. 307 · СТАНИЦЯ ЛЬВІВ</p></div>
          <a class="me" href="#me" aria-label="Моя сторінка"><i>${esc(session.initials)}</i><span>${esc(session.first)}</span></a>
        </div>
        <nav class="tabs" aria-label="Розділи">${n.left.map(tab).join('')}${tab(n.center)}${tab(n.kurin)}${n.dil.length ? '<span class="sep" aria-hidden="true"></span>' + n.dil.map(tab).join('') : ''}<span class="sep" aria-hidden="true"></span>${tab(n.settings)}</nav>
      </div></header>
      <main class="col" id="main">${html}<p class="note">ПРОТОТИП «ПОЛЬОВИЙ» · увійшли як: ${esc(session.roleLabel)} · дані вигадані, нічого не зберігається на сервері</p></main>
      <div class="bnav"><nav aria-label="Розділи">${bn(n.left[0])}${bn(n.left[1])}${bn(n.center, 'center')}${bn(n.kurin)}<button type="button" data-act="more" class="${moreActive ? 'on' : ''}">${ic('more')}Ще${n.settings.badge ? '<span class="dotc"></span>' : ''}</button></nav></div>`;
  }
  function moreSheet() {
    const n = navModel();
    const el = document.createElement('div');
    el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Більше розділів');
    el.innerHTML = `<div>${n.dil.map((d) => `<a class="li" href="#${d.href}">${ic(d.icon, 'chev2')}<span class="grow"><b>${esc(d.label)}</b></span></a>`).join('')}
      <a class="li" href="#prefs">${ic('gear', 'chev2')}<span class="grow"><b>Налаштування</b></span>${n.settings.badge ? `<span class="cnt">${n.settings.badge}</span>` : ''}</a>
      <a class="li" href="#me">${ic('users', 'chev2')}<span class="grow"><b>Моя сторінка</b></span></a>
      <button type="button" class="btn wide" data-act="close-sheet">Закрити</button></div>`;
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('a') || e.target.closest('[data-act="close-sheet"]')) el.remove(); });
    document.body.appendChild(el);
    el.querySelector('a, button').focus();
  }
  const head = (title, sub, actions = '', crumb = '') => `<div class="pagehead"><div class="grow">${crumb}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;

  /* ================= auth ================= */
  const loginEmails = { JUNAK: USERS.JUNAK.email, VYKHOVNYK: USERS.VYKHOVNYK.email, ZVYAZKOVYI: USERS.ZVYAZKOVYI.email };
  function loginPage() {
    return `<div class="auth">${topo()}<div style="position:relative;display:grid;justify-items:center;width:100%">
      <form class="auth-card" id="login-form" novalidate>
        <div class="auth-head"><div class="patch"><div><b>єП</b><span>ДЕМО</span></div></div><div><h1>єПластун</h1><p>КУРІННИЙ ЖУРНАЛ ОНЛАЙН</p></div></div>
        <div class="demo"><b>Демо: увійти як</b>
          <div class="seg" role="radiogroup" aria-label="Роль для демо">${[['JUNAK', 'Юнак'], ['VYKHOVNYK', 'Виховник'], ['ZVYAZKOVYI', 'Звʼязковий']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === loginRole}" class="${k === loginRole ? 'on' : ''}" data-act="login-role" data-role="${k}">${l}</button>`).join('')}</div>
          <span class="small muted">${loginRole === 'JUNAK' ? 'Юнак, який ще й інтендант: бачить «Реманент».' : loginRole === 'VYKHOVNYK' ? 'Виховник гуртка «Беркути»: у центрі меню «Мій гурток».' : 'Звʼязковий: бачить усе діловодство і запити на затвердження.'}</span></div>
        <label class="field"><span>Email</span><input class="input" id="login-email" type="email" autocomplete="username" value="${esc(loginEmails[loginRole])}"></label>
        <label class="field"><span>Пароль</span><input class="input" id="login-pass" type="password" autocomplete="current-password" value="demo-password"></label>
        <p id="login-err" class="stamp late" hidden>Невірний email або пароль</p>
        <button class="btn pri wide" type="submit">Увійти</button>
        <div class="or">або</div>
        <button type="button" class="btn wide" data-act="google"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.5c2.1-1.9 3.3-4.8 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.2v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.2a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z"/></svg>Увійти через Google</button>
        <a href="#forgot" class="small" style="justify-self:center">Забули пароль?</a>
      </form>
      <p class="auth-foot">ДЕМО-ПРОТОТИП · ДАНІ ВИГАДАНІ</p></div></div>`;
  }
  let forgotSent = false;
  function forgotPage() {
    return `<div class="auth">${topo()}<div style="position:relative;display:grid;justify-items:center;width:100%">
      <form class="auth-card" id="forgot-form" novalidate>
        <div class="auth-head"><div class="patch"><div><b>єП</b><span>ДЕМО</span></div></div><div><h1>Забули пароль?</h1><p>ВІДНОВЛЕННЯ ДОСТУПУ</p></div></div>
        ${forgotSent ? '<p class="card" style="background:var(--ok-soft);border-color:var(--ok);color:var(--ok)">Якщо такий email зареєстровано, на нього надіслано лист із посиланням для відновлення пароля.</p>'
          : `<p class="muted small">Вкажіть email, з яким ви входите. Ми надішлемо посилання, яке діє 1 годину.</p>
        <label class="field"><span>Email</span><input class="input" id="forgot-email" type="email" autocomplete="email" placeholder="name@gmail.com"></label>
        <button class="btn pri wide" type="submit">Надіслати посилання</button>`}
        <a href="#login" class="small" style="justify-self:center">Повернутись до входу</a>
      </form></div></div>`;
  }

  /* ================= pages ================= */
  const P = {};

  P.news = () => {
    const canPost = isZv();
    return head('Новини', 'Журнал куреня: оголошення, збірки, фото з таборів', canPost ? '<a class="btn pri" href="#news-new">+ Нове оголошення</a>' : '') +
      `<div class="tl">${D.news.map((p) => {
        const d = new Date(p.date);
        return `<div class="entry"><div class="date"><b>${d.getDate()}</b><span>${MON[d.getMonth()]}</span></div>
        <article class="card post${p.pinned ? ' pin' : ''}">
          <div class="kick">${p.pinned ? '<span class="stamp">Закріплено</span>' : ''}<span class="stamp mute">${esc(p.tag)}</span><span>${d.toTimeString().slice(0, 5)}</span></div>
          <h3>${esc(p.title)}</h3>
          ${p.body.map((t) => `<p>${esc(t)}</p>`).join('')}
          ${p.list ? `<ul>${p.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          ${p.event ? `<blockquote class="quote"><p><b>Коли:</b> ${esc(p.event.when)}</p><p><b>Де:</b> ${esc(p.event.where)}</p><p><b>Форма:</b> однострій, теплий одяг</p></blockquote>` : ''}
          ${p.photos.length ? D.carousel(p.photos, { label: p.title, ratio: '16/10', nav: 'dots' }) : ''}
          <p class="sig">${esc(p.author.first + ' ' + p.author.last)}${p.author.nick ? ' «' + esc(p.author.nick) + '»' : ''}, ${esc(p.role.toLowerCase())}</p>
          <div class="rxs" data-rx-bar>${D.reactionsHTML(p)}</div>
          ${canPost ? '<div class="row"><button type="button" class="btn sm">Редагувати</button><button type="button" class="btn sm danger">Видалити</button></div>' : ''}
        </article></div>`;
      }).join('')}</div>`;
  };

  P['news-new'] = () => head('Нове оголошення', 'Курінь побачить його в стрічці і отримає сповіщення', '', '<a class="crumb" href="#news">← НОВИНИ</a>') +
    `<form class="card" id="post-form" novalidate>
      <label class="field"><span>Заголовок</span><input class="input" id="post-title" placeholder="Напр. «Збірка в суботу»" required></label>
      <div class="grid2"><label class="field"><span>Тема</span><select class="select" id="post-tag"><option>Оголошення</option><option>Збірка</option><option>Табір</option><option>Проби</option><option>Інтендантство</option></select></label>
      <label class="sw" for="post-pin" style="align-self:end;min-height:2.75rem"><input type="checkbox" id="post-pin"><span>Закріпити вгорі</span></label></div>
      <div class="field"><span>Текст</span>
        <div class="editor-tools" role="toolbar" aria-label="Форматування"><button type="button" aria-label="Жирний"><b>Ж</b></button><button type="button" aria-label="Курсив"><i>К</i></button><button type="button" aria-label="Маркований список">•≡</button><button type="button" aria-label="Нумерований список">1.</button><button type="button" aria-label="Цитата">❝</button><button type="button" aria-label="Додати фото">${ic('plus')}</button></div>
        <textarea class="textarea" id="post-body" placeholder="Що, коли, де, що взяти з собою. Порожній рядок починає новий абзац."></textarea></div>
      <p class="small muted">Фото завантажуються в Google Drive куреня.</p>
      <p id="post-err" class="stamp late" hidden>Додайте заголовок і текст</p>
      <div class="row"><button class="btn pri" type="submit">Опублікувати</button><a class="btn ghost" href="#news">Скасувати</a></div>
    </form>`;

  const TODAY = '2026-11-12';
  const PAST = [
    { d: '2024-01-05', t: 'Зимовий табір «Ялинка»', p: 'Славське, 5–8 січня' },
    { d: '2024-04-23', t: 'Свято Юрія і пластова присяга', p: 'Львів' },
    { d: '2024-07-14', t: 'Літній табір «Лісова школа»', p: 'Гута, 14–24 липня' },
    { d: '2024-09-08', t: 'Відкриття пластового року', p: 'Домівка' },
    { d: '2024-10-14', t: 'Свято Покрови, закриття проб прихильника', p: 'Домівка, 17:00' },
    { d: '2025-01-04', t: 'Зимовий табір «Ґорґани»', p: 'Ґорґани, 4–7 січня' },
    { d: '2025-03-16', t: 'Теренова гра «Весняна облога»', p: 'Винниківський ліс' },
    { d: '2025-04-27', t: 'Свято Юрія', p: 'Львів' },
    { d: '2025-06-21', t: 'Мандрівка Чорногорою', p: 'Чорногора, 21–24 червня' },
    { d: '2025-07-13', t: 'Літній табір «Сокільська скеля»', p: 'Сколівські Бескиди' },
    { d: '2025-09-07', t: 'Відкриття пластового року', p: 'Домівка' },
    { d: '2025-12-06', t: 'Пластовий Миколай', p: 'Домівка, 16:00' },
    { d: '2026-01-03', t: 'Зимовий табір «Смерека»', p: 'Карпати, 3–6 січня' },
    { d: '2026-02-15', t: 'Теренова гра «Сніжна облога»', p: 'Брюховичі' },
    { d: '2026-04-26', t: 'Свято Юрія і пластова присяга', p: 'Львів' },
    { d: '2026-07-12', t: 'Літній табір «Лісова школа»', p: 'Гута, 12–22 липня' },
    { d: '2026-09-06', t: 'Відкриття пластового року', p: 'Домівка' },
    { d: '2026-11-06', t: 'Осінній табір «Сокільська скеля»', p: 'Сколівські Бескиди, 6–8 листопада' },
  ];
  const DOW = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  let cal = { view: 'next', adding: false };
  P.calendar = () => {
    const [ty, tm] = [+TODAY.slice(0, 4), +TODAY.slice(5, 7) - 1];
    const next = cal.view === 'next';
    const months = [];
    if (next) for (let i = 0; i < 12; i++) months.push([ty + Math.floor((tm + i) / 12), (tm + i) % 12]);
    else { const y = +cal.view; for (let m = 0; m < (y === ty ? tm + 1 : 12); m++) months.push([y, m]); months.reverse(); }
    const all = PAST.concat(EVENTS).filter((e) => (next ? e.d >= TODAY : e.d < TODAY && e.d.startsWith(cal.view)));
    const views = [['next', 'Наступні 12 місяців'], [String(ty), String(ty)], [String(ty - 1), String(ty - 1)], [String(ty - 2), String(ty - 2)]];
    const evHTML = (e) => { const d = new Date(e.d); return `<div class="ev${next ? '' : ' past'}"><div class="day"><b>${d.getDate()}</b><span>${DOW[d.getDay()]}</span></div><div class="grow"><b>${esc(e.t)}</b><small>${esc(e.p)}</small></div></div>`; };
    return head('Календарний план', next ? 'Збірки, табори та акції куреня на рік уперед' : `Що відбулося в ${cal.view} році`, isZv() ? '<button type="button" class="btn pri" data-act="cal-add">+ Додати подію</button>' : '') +
      `<div class="seg yrs" role="radiogroup" aria-label="Період">${views.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === cal.view}" class="${v === cal.view ? 'on' : ''}" data-act="cal-view" data-v="${v}">${l}</button>`).join('')}</div>
      ${cal.adding ? `<form class="card" id="ev-form" style="margin-top:1rem" novalidate><h3>Нова подія</h3><div class="grid2"><label class="field"><span>Дата події</span><input class="input" type="date" id="ev-date" value="${TODAY}" min="${TODAY}"></label><label class="field"><span>Назва</span><input class="input" id="ev-title" placeholder="Напр. «Зимовий табір»"></label></div><label class="field"><span>Опис (необовʼязково)</span><input class="input" id="ev-place" placeholder="Де і о котрій"></label><div class="row"><button class="btn pri" type="submit">Додати</button><button type="button" class="btn ghost" data-act="cal-add">Скасувати</button></div></form>` : ''}
      <div class="ytl">${months.map(([y, m]) => {
        const key = y + '-' + String(m + 1).padStart(2, '0');
        const list = all.filter((e) => e.d.startsWith(key)).sort((a, b) => (next ? a.d.localeCompare(b.d) : b.d.localeCompare(a.d)));
        const now = next && y === ty && m === tm ? `<p class="now">Сьогодні, ${fmtD(TODAY)}</p>` : '';
        return `<section class="mo${list.length ? '' : ' empty'}"><h4>${MONTHS[m]} <span>${y}</span></h4><div class="evs">${now}${list.length ? list.map(evHTML).join('') : '<p class="none">Подій немає</p>'}</div></section>`;
      }).join('')}</div>
      ${next ? `<button type="button" class="btn ghost" style="margin-top:1rem" data-act="cal-view" data-v="${ty}">← Попередні події</button>` : `<button type="button" class="btn ghost" style="margin-top:1rem" data-act="cal-view" data-v="next">До найближчих подій →</button>`}`;
  };

  P.plast = () => {
    const u = session;
    const zv = isZv();
    return head(zv ? 'Моя проба' : 'Моє пластування', zv ? 'Звʼязковий теж здобуває ступені' : 'Проба, вмілості, акції і помічник для підготовки') +
      `<div class="degrees">${[['Прихильник', 'жовт. 2024', 'done'], ['Учасник', u.progress + '%', 'cur'], ['Розвідувач', 'попереду', ''], ['Скоб', 'попереду', '']].map(([n, s, c]) => `<div class="deg ${c}"><b>${n}</b><span>${s}</span></div>`).join('')}</div>
      <h3 class="h">Розділи</h3>
      <div class="tiles">
        <a class="tile" href="#proby">${ic('flag')}<b>Моя проба</b><span>Точки проби учасника та їх стан</span><div class="bar" style="margin-top:.4rem"><i style="width:${u.progress}%"></i></div></a>
        <a class="tile ai-ring" href="#ai">${ic('ai')}<b class="ai-text">AI-виховник</b><span>Запитай про будь-яку точку</span></a>
        <a class="tile" href="#activity">${ic('plus')}<b>Додати акцію</b><span>Табір, сходини, акція</span></a>
        <a class="tile" href="#skills">${ic('star')}<b>Вмілості</b><span>Каталог вмілостей і вимоги</span></a>
        <div class="tile off" aria-disabled="true">${ic('doc')}<b>Запит</b><span>Дозвіл, посвідка, документ</span><span class="stamp mute">Скоро</span></div>
      </div>`;
  };

  let probyState = null;
  P.proby = () => {
    const stages = window.PROBY;
    const doneOf = (si, ci, pi) => si === 0 || (si === 1 && (ci * 3 + pi) % 5 < 3);
    return head('Програма проб', 'Нова програма УПЮ · пункти, які підтвердив виховник, позначені', '', '<a class="crumb" href="#plast">← МОЄ ПЛАСТУВАННЯ</a>') +
      stages.map((s, si) => {
        const locked = si === 2, total = s.cats.reduce((a, c) => a + c.points.length, 0);
        const done = s.cats.reduce((a, c, ci) => a + c.points.filter((_, pi) => doneOf(si, ci, pi)).length, 0);
        return `<details class="acc" ${si === 1 ? 'open' : ''} ${locked ? 'aria-disabled="true" data-locked' : ''}>
          <summary><span class="ico">${ic(si === 0 ? 'star' : 'flag')}</span><span class="grow" style="min-width:0"><span class="t">${esc(s.name)}</span><br><span class="s">${locked ? 'Розблокується після закриття попередньої проби' : si === 0 ? 'Закрито 14 жовтня 2024' : `${done} з ${total} точок`}</span></span>${si === 0 ? '<span class="stamp ok">Закрито</span>' : locked ? '<span class="stamp mute">Замкнено</span>' : ''}</summary>
          ${locked ? '' : `<div class="body">${s.cats.map((c, ci) => {
            const cd = c.points.filter((_, pi) => doneOf(si, ci, pi)).length;
            return `<details class="acc" ${si === 1 && ci === 0 ? 'open' : ''}><summary><span class="grow" style="min-width:0"><span class="t">${esc(c.name)}</span><br><span class="s">${cd}/${c.points.length}</span></span><span style="width:5rem" class="bar"><i style="width:${Math.round(cd / c.points.length * 100)}%"></i></span></summary>
              <div class="body">${c.points.map((p, pi) => { const ok = doneOf(si, ci, pi); return `<div class="pt"><span class="chk ${ok ? 'on' : ''}" role="img" aria-label="${ok ? 'Зараховано' : 'Ще не зараховано'}">${ok ? '✓' : ''}</span><p>${esc(p)}</p>${ok || si === 0 ? '' : `<a href="#ai" class="ai-text" data-act="ask-ai" data-p="${esc(p.slice(0, 80))}">Запитати AI</a>`}</div>`; }).join('')}</div></details>`;
          }).join('')}</div>`}</details>`;
      }).join('');
  };

  let ai = { conv: 0, point: '', typing: false, convs: [
    { title: 'Як звʼязати рифовий вузол', msgs: [
      { me: true, t: 'Як швидко навчитися вʼязати рифовий вузол і не плутати його з бабиним?' },
      { me: false, t: 'Рифовий вузол вʼяжуть у два кроки: <ol><li>Праве через ліве і під низ.</li><li>Ліве через праве і під низ.</li></ol>Перевірка: обидва кінці мають лежати з одного боку петлі. Якщо вони з різних боків, вийшов бабин вузол. Потренуйся 10 разів наосліп і покажи гурковому.' }] },
    { title: 'Похід на 2 дні: що взяти', msgs: [{ me: true, t: 'Що взяти в похід на дві доби восени?' }, { me: false, t: 'Базовий список: спальник з комфортом до +5, карімат, дощовик, змінні шкарпетки (2 пари), ліхтарик, кружка, ложка, миска, аптечка гуртка, однострій. Важке клади ближче до спини.' }] },
  ] };
  P.ai = () => {
    const c = ai.convs[ai.conv];
    const pts = window.PROBY[1].cats.flatMap((cat) => cat.points.map((p) => ({ c: cat.name, p })));
    return head('<span class="ai-text">AI-виховник</span>', 'Допомагає підготуватися до точок проби', '', '<a class="crumb" href="#plast">← МОЄ ПЛАСТУВАННЯ</a>') +
      `<div class="chat"><div class="convs"><button type="button" class="btn sm" data-act="ai-new">+ Нова розмова</button>${ai.convs.map((x, i) => `<button type="button" class="${i === ai.conv ? 'on' : ''}" data-act="ai-conv" data-i="${i}">${esc(x.title)}</button>`).join('')}</div>
      <div class="card"><label class="field"><span>Точка проби</span><select class="select" id="ai-point"><option value="">Оберіть точку проби</option>${pts.map((x) => `<option ${ai.point && x.p.startsWith(ai.point) ? 'selected' : ''}>${esc(x.c.slice(0, 2) + ' ' + x.p.slice(0, 90))}</option>`).join('')}</select></label>
        <div class="msgs" id="msgs">${c.msgs.length ? c.msgs.map((m) => `<div class="bub ${m.me ? 'me' : 'ai ai-ring'}">${m.me ? esc(m.t) : m.t}</div>`).join('') : '<p class="empty">Оберіть точку проби та опишіть, що хочете підготувати. AI-виховник допоможе скласти план.</p>'}${ai.typing ? '<p class="typing">AI-виховник пише відповідь…</p>' : ''}</div>
        <form class="compose" id="ai-form"><textarea class="textarea ai-ring ai-glow" id="ai-text" placeholder="Опишіть, що хочете підготувати…" aria-label="Повідомлення"></textarea><button class="btn pri" type="submit">Надіслати</button></form>
        <p class="small muted">AI-виховник старається бути щоразу кращим, проте може помилятися. Перевіряй його відповідь.</p></div></div>`;
  };

  P.activity = () => head('Моя активність', 'Ця сторінка ще у виробництві: поки що це вільний запис', '', '<a class="crumb" href="#plast">← МОЄ ПЛАСТУВАННЯ</a>') +
    `<form class="card" id="act-form" novalidate><h3>Додати акцію</h3>
      <label class="field"><span>Назва акції</span><input class="input" id="act-title" placeholder="Напр. «Теренівка»"></label>
      <div class="seg" role="radiogroup" aria-label="Роль"><button type="button" class="on" data-act="act-role" data-r="учасник" role="radio" aria-checked="true">Я був(-ла) учасником</button><button type="button" data-act="act-role" data-r="в проводі" role="radio" aria-checked="false">Я був(-ла) в проводі</button></div>
      <label class="field"><span>Що ти там робив(-ла)?</span><textarea class="textarea" id="act-desc" style="min-height:4.5rem"></textarea></label>
      <div><button class="btn pri" type="submit">Додати</button></div></form>
    <h3 class="h">Історія</h3>
    ${activities.length ? `<div class="list">${activities.map((a, i) => `<div class="li"><span class="grow"><b>${esc(a.t)}</b><small>${esc(a.d)}</small></span><span class="stamp ${a.role === 'в проводі' ? '' : 'mute'}">${esc(a.role)}</span><button type="button" class="btn sm ghost" data-act="act-del" data-i="${i}">Видалити</button></div>`).join('')}</div>` : '<p class="empty">Ще немає жодного запису.</p>'}`;

  let skillQ = '';
  P.skills = () => head('Вмілості', 'Каталог «Вмілості УПЮ» (Львів, 2003) і власні вмілості куреня. Рівень вмілості означає пробу, до якої вона призначена.', isZv() ? '<button type="button" class="btn pri">+ Додати власну вмілість</button>' : '', '<a class="crumb" href="#plast">← МОЄ ПЛАСТУВАННЯ</a>') +
    `<input class="input" id="skill-q" type="search" placeholder="Пошук вмілості" aria-label="Пошук вмілості" value="${esc(skillQ)}" style="margin-bottom:1rem"><div id="skill-list">${skillList()}</div>`;
  function skillList() {
    return SKILLS.map((g) => { const items = g.items.filter((s) => s[0].toLowerCase().includes(skillQ.toLowerCase())); return items.length ? `<details class="acc" open><summary><span class="ico">${ic('star')}</span><span class="t">${esc(g.g)}</span><span class="s">&nbsp;· ${items.length}</span></summary><div class="body"><div class="ranks">${items.map(([n, lvl, own]) => `<div class="rank"><div style="min-width:0"><span>${esc(lvl)}</span><b>${esc(n)}</b></div>${own ? '<span class="stamp" style="margin-left:auto">Власна</span>' : ''}</div>`).join('')}</div></div></details>` : ''; }).join('') || '<p class="empty">Нічого не знайдено.</p>';
  }

  P['my-hurtok'] = () => {
    const h = D.hurtky.find((x) => x.name === session.hurtok);
    const members = roster.filter((j) => j.hurtok === h.name);
    return head(`Гурток «${esc(h.name)}» №${h.number}`, `Гуртковий: ${esc(h.hurtkovyi)} · ${members.length} юнаків · заснований ${h.founded}`, '<a class="btn pri" href="#user-new">+ Додати юнака/чку</a><button type="button" class="btn">Налаштування</button>') +
      `<div class="list">${members.map((j) => `<a class="li" href="#user-${j.id}">${av(j.initials)}<span class="grow"><b>${esc(j.last + ' ' + j.first)}</b><small>${esc(j.degree)} · ${j.born} р.н.</small></span><span style="width:6rem" class="bar"><i style="width:${j.progress}%"></i></span><span class="mono small">${j.progress}%</span><span class="chev" aria-hidden="true">›</span></a>`).join('')}</div>`;
  };

  let kurinQ = '';
  const rosterList = () => roster.filter((j) => (j.first + ' ' + j.last + ' ' + j.hurtok).toLowerCase().includes(kurinQ.toLowerCase())).map((j) => `<a class="li" href="#user-${j.id}">${av(j.initials)}<span class="grow"><b>${esc(j.last + ' ' + j.first)}</b><small>гурток «${esc(j.hurtok)}» · ${j.born} р.н.</small></span><em>${esc(j.degree)}</em><span class="chev" aria-hidden="true">›</span></a>`).join('') || '<p class="empty">Нікого не знайдено.</p>';
  P.kurin = () => {
    const k = D.kurin, full = isZv();
    const acc = (key, icon, title, sub, body) => `<details class="acc" data-k="${key}"><summary><span class="ico">${ic(icon)}</span><span class="grow" style="min-width:0"><span class="t">${title}</span><br><span class="s">${sub}</span></span></summary><div class="body">${body}</div></details>`;
    return head('Курінь', esc(k.name)) +
      acc('info', 'info', 'Інформація про курінь', 'Номер, станиця, програма проби, Google Drive',
        `<dl class="kv"><div><dt>Назва</dt><dd>${esc(k.name)}</dd></div><div><dt>Номер</dt><dd>${k.number}</dd></div><div><dt>Станиця</dt><dd>${esc(k.stanytsia)}</dd></div><div><dt>Стать</dt><dd>${esc(k.gender)}</dd></div><div><dt>Програма проби</dt><dd>${esc(k.program)}</dd></div><div><dt>Google Drive</dt><dd><span class="stamp ok">Підключено</span></dd></div></dl>
        ${full ? `<div class="card" style="background:var(--bg)"><b>Google Drive</b><p class="small muted">Підключено як ${esc(k.drive.email)} · папка «${esc(k.drive.folder)}»</p><div class="row"><button type="button" class="btn sm">Змінити папку</button><button type="button" class="btn sm danger">Відключити</button></div></div>` : ''}`) +
      acc('provid', 'shield', 'Провід куреня', D.provid.length + ' посад',
        `<div class="ranks">${D.provid.map((r) => `<div class="rank">${av(r.who.initials)}<div style="min-width:0"><span>${esc(r.role)}</span><b>${esc(r.who.first + ' ' + r.who.last)}</b></div></div>`).join('')}</div>
        ${full ? `<form class="row" id="assign-form"><select class="select" style="width:auto;flex:1 1 12rem" aria-label="Хто"><option>Оберіть юнака</option>${roster.slice(0, 8).map((j) => `<option>${esc(j.last + ' ' + j.first)}</option>`).join('')}</select><select class="select" style="width:auto;flex:1 1 10rem" aria-label="Посада"><option>Курінний</option><option>Суддя</option><option>Писар</option><option>Скарбник</option><option>Інтендант</option><option>Хорунжий</option><option>СММник</option></select><button class="btn pri" type="submit">Призначити</button></form>` : ''}`) +
      acc('hurtky', 'layers', 'Гуртки', D.hurtky.map((h) => h.name).join(', '),
        `${full ? '<div><button type="button" class="btn sm pri">+ Новий гурток</button></div>' : ''}
        ${D.hurtky.map((h) => { const m = roster.filter((j) => j.hurtok === h.name); return `<details class="acc"><summary><span class="hnum" style="--h:${h.color}">${h.number}</span><span class="grow" style="min-width:0"><span class="t">${esc(h.name)}</span><br><span class="s">виховник ${esc(h.vykhovnyk)} · ${m.length} юнаків</span></span></summary>
          <div class="body"><dl class="kv"><div><dt>Гуртковий</dt><dd>${esc(h.hurtkovyi)}</dd></div><div><dt>Виховник</dt><dd>${esc(h.vykhovnyk)}</dd></div><div><dt>Заснований</dt><dd>${h.founded}</dd></div></dl>
          <div class="list">${m.map((j) => `<a class="li" href="#user-${j.id}">${av(j.initials)}<span class="grow"><b>${esc(j.last + ' ' + j.first)}</b><small>${esc(j.degree)} · проба ${j.progress}%</small></span><span class="chev" aria-hidden="true">›</span></a>`).join('')}</div>
          <div class="row"><a class="btn sm" href="#user-new">+ Додати юнака/чку</a><button type="button" class="btn sm">Налаштування</button></div></div></details>`; }).join('')}`) +
      (full ? acc('vykh', 'users', 'Кадра виховників', vykhovnyky.length + ' виховники',
        `<div class="list">${vykhovnyky.map((v) => `<div class="li">${av(v.first[0] + v.last[0])}<span class="grow"><b>${esc(v.last + ' ' + v.first)}</b><small>гурток «${esc(v.hurtok)}»</small></span></div>`).join('')}</div><div><a class="btn sm" href="#user-new">+ Додати людину</a></div>`) +
        acc('junatstvo', 'list', 'Список юнацтва', roster.length + ' юнаків',
        `<input class="input" id="kurin-q" type="search" placeholder="Пошук за прізвищем або гуртком" aria-label="Пошук юнака" value="${esc(kurinQ)}"><div class="list" id="kurin-list">${rosterList()}</div><div><a class="btn sm" href="#user-new">+ Додати людину</a></div>`) : '');
  };

  let archiveAsk = false;
  P.user = (id) => {
    const j = findJ(id) || roster[0];
    const h = D.hurtky.find((x) => x.name === j.hurtok);
    const zv = isZv();
    const sub = (t, body, open) => `<details class="acc" ${open ? 'open' : ''}><summary><span class="t">${t}</span></summary><div class="body">${body}</div></details>`;
    return `<a class="crumb" href="#kurin">← КУРІНЬ</a>
      <div class="prof" style="margin-bottom:1.2rem"><span class="bigav">${esc(j.initials)}</span><div style="min-width:0;flex:1"><h2 style="margin:0;font:700 1.9rem/1.05 var(--display);text-transform:uppercase">${esc(j.last + ' ' + j.first)}</h2><p class="muted" style="margin:.3rem 0 0">Гурток «${esc(j.hurtok)}» · ${esc(j.degree)} · ${j.born} р.н.</p></div></div>
      <div class="stack">
      <section class="card"><h3>Дані</h3><dl class="kv"><div><dt>Дата народження</dt><dd>${(j.id.length % 27) + 1}.0${(j.born % 9) + 1}.${j.born}</dd></div><div><dt>Телефон</dt><dd>+380 67 ${100 + j.born % 900} ${10 + j.progress} ${30 + j.born % 60}</dd></div><div><dt>Email</dt><dd>${esc(j.first.toLowerCase())}.${j.born}@gmail.com</dd></div><div><dt>Місце проживання</dt><dd>Львів, Сихів</dd></div><div><dt>Місце навчання</dt><dd>Ліцей №${10 + j.born % 40}</dd></div></dl>
        <div class="row"><button type="button" class="btn sm">${zv ? 'Змінити ПІБ' : 'Змінити ПІБ (потребує затвердження)'}</button></div></section>
      <section class="card"><h3>Гурток</h3><form class="row" id="transfer-form"><select class="select" style="width:auto;flex:1 1 12rem" aria-label="Новий гурток">${D.hurtky.map((x) => `<option ${x.name === j.hurtok ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option>Без гуртка</option></select><button class="btn" type="submit">Перевести</button></form>
        <p class="small muted">Виховник: ${esc(h.vykhovnyk)}. ${zv ? '' : 'Переведення потребує затвердження звʼязковим.'}</p></section>
      <section class="card"><h3>Батьки та опікуни</h3><div class="guard"><div><span>Мама</span><b>Оксана ${esc(j.last)}</b><small class="mono">+380 50 ${200 + j.born % 700} 41 ${20 + j.progress % 70}</small></div><div><span>Тато</span><b>Ігор ${esc(j.last)}</b><small class="muted">Телефон і email ще не вказані</small></div></div><div><button type="button" class="btn sm">+ Додати контакт</button></div></section>
      <section class="card"><h3>Проба</h3><p>Проба учасника (Скобине крило): <b>${j.progress}%</b></p><div class="bar"><i style="width:${j.progress}%"></i></div><div class="row"><a class="btn sm" href="#proby">Відкрити точки</a>${zv ? '<button type="button" class="btn sm pri">Закрити пробу</button>' : ''}</div></section>
      <section class="card"><h3>Ступені</h3><div class="degrees">${[['Прихильник', '14.10.2024', 'done'], ['Учасник', j.degree !== 'Учасник' ? '03.05.2025' : 'ще не здобуто', j.degree !== 'Учасник' ? 'done' : 'cur'], ['Розвідувач', j.degree === 'Скоб' ? '21.04.2026' : 'ще не здобуто', j.degree === 'Скоб' ? 'done' : j.degree === 'Розвідувач' ? 'cur' : ''], ['Скоб', 'ще не здобуто', j.degree === 'Скоб' ? 'cur' : '']].map(([n, s, c]) => `<div class="deg ${c}"><b>${n}</b><span>${s}</span></div>`).join('')}</div></section>
      <section class="card"><h3>Історія</h3>
        ${sub('Вступ і присяга', `<dl class="kv"><div><dt>Вступ до УПЮ</dt><dd>01.10.${j.born + 11}</dd></div><div><dt>Пластова присяга</dt><dd>${j.degree === 'Учасник' ? '—' : '25.04.' + (j.born + 13)}</dd></div></dl>`, true)}
        ${sub('Табори', `<ul class="hist"><li><b>Осінній табір «Сокільська скеля»</b>, 2026 · учасник</li><li><b>Літній табір «Вовча тропа»</b>, 2025 · учасник</li></ul><div><button type="button" class="btn sm">+ Додати табір</button></div>`)}
        ${sub('ВФВ', '<ul class="hist"><li>12.09.2026 · норматив зараховано</li></ul><div><button type="button" class="btn sm">+ Додати ВФВ</button></div>')}
        ${sub('Вмілості', '<ul class="hist"><li><b>Таборовик</b> · Учасник · 2026, екзаменатор Ярема Олійник</li></ul><div><button type="button" class="btn sm">+ Додати вмілість</button></div>')}
        ${sub('Відзначення та перестороги', '<ul class="hist"><li><span class="stamp ok">Відзначення</span> 20.10.2026 · За чергування на кухні в таборі</li></ul><div><button type="button" class="btn sm">+ Додати запис</button></div>')}
        ${sub('Діловодство', '<p class="muted">Посад ще не було.</p><div><button type="button" class="btn sm">+ Додати посаду</button></div>')}
      </section>
      <section class="card"><h3>Архівація</h3><p class="small muted">Щоб архівувати юнака, спершу зніміть його з гуртка та посад.</p>
        ${archiveAsk ? `<div class="row"><span class="stamp late">${zv ? 'Архівувати? Юнак зникне зі списків.' : 'Надіслати запит на архівацію звʼязковому?'}</span><button type="button" class="btn sm danger" data-act="archive-yes">Підтвердити</button><button type="button" class="btn sm ghost" data-act="archive-ask">Скасувати</button></div>` : '<div><button type="button" class="btn sm danger" data-act="archive-ask">Архівувати</button></div>'}</section>
      </div>`;
  };

  P['user-new'] = () => {
    const zv = isZv();
    return head(zv ? 'Новий користувач' : 'Запит на створення юнака', zv ? 'Юнак або виховник зʼявиться в курені одразу' : 'Юнак зʼявиться після затвердження звʼязковим', '', '<a class="crumb" href="#kurin">← КУРІНЬ</a>') +
      `<form class="card" id="new-user-form" novalidate>
        ${zv ? '<label class="field"><span>Роль</span><select class="select" id="nu-role"><option>Юнак</option><option>Виховник</option></select></label>' : ''}
        <div class="grid2"><label class="field"><span>Імʼя</span><input class="input" id="nu-first"></label><label class="field"><span>Прізвище</span><input class="input" id="nu-last"></label></div>
        <div class="grid2"><label class="field"><span>Email</span><input class="input" type="email" id="nu-email"></label><label class="field"><span>Гурток</span><select class="select">${D.hurtky.map((h) => `<option ${h.name === session.hurtok ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label></div>
        ${zv ? '<label class="field"><span>Пароль (опційно, можна додати пізніше)</span><input class="input" type="password" autocomplete="new-password"></label>' : ''}
        <p id="nu-err" class="stamp late" hidden>Вкажіть імʼя і прізвище</p>
        <div class="row"><button class="btn pri" type="submit">${zv ? 'Створити' : 'Надіслати запит'}</button><a class="btn ghost" href="#kurin">Скасувати</a></div></form>`;
  };

  let invCat = 'Усі', addingItem = false, lendFor = null;
  const lendForm = (it) => `<form class="lend" data-lend="${it.id}" novalidate><b>Видати «${esc(it.name)}»</b>
    <label class="field"><span>Кому</span><select class="select" name="who"><option value="">Оберіть, кому видаєте</option><optgroup label="Гуртки">${D.hurtky.map((h) => `<option>Гурток «${esc(h.name)}»</option>`).join('')}</optgroup><optgroup label="Юнаки">${roster.map((j) => `<option>${esc(j.first + ' ' + j.last)}</option>`).join('')}</optgroup><optgroup label="Провід">${D.provid.map((r) => `<option>${esc(r.who.first + ' ' + r.who.last)} (${esc(r.role.toLowerCase())})</option>`).join('')}</optgroup></select></label>
    <div class="grid2"><label class="field"><span>Повернути до</span><input class="input" type="date" name="due" value="2026-11-19" min="2026-11-12"></label><label class="field"><span>Скільки, шт</span><input class="input" type="number" name="qty" min="1" max="${it.qty}" value="1"></label></div>
    <p class="stamp late" data-err hidden>Оберіть, кому видаєте, і дату повернення</p>
    <div class="row"><button class="btn sm pri" type="submit">Видати</button><button type="button" class="btn sm ghost" data-act="lend-cancel">Скасувати</button></div></form>`;
  P.inventory = () => {
    const items = D.inventory.filter((i) => invCat === 'Усі' || i.cat === invCat);
    const late = D.inventory.filter((i) => i.lent && i.lent.overdue).length;
    const st = (it) => it.lent ? (it.lent.overdue ? `<span class="out late">Прострочено · ${esc(it.lent.who)} · з ${D.fmtDue(it.lent.due)}</span>` : `<span class="out lent">Видано · ${esc(it.lent.who)} · до ${D.fmtDue(it.lent.due)}</span>`) : '<span class="out free">На складі</span>';
    return head('Облік реманенту', `${D.inventory.length} позицій · ${D.inventory.filter((i) => i.lent).length} видано${late ? ` · <b style="color:var(--late)">${late} прострочено</b>` : ''} · фото в Google Drive «${esc(D.kurin.drive.folder)}»`, `<button type="button" class="btn pri" data-act="item-add">${addingItem ? 'Сховати форму' : '+ Додати річ'}</button>`) +
      (addingItem ? `<form class="card" id="item-form" novalidate style="margin-bottom:1rem"><h3>Додати річ</h3><div class="grid2"><label class="field"><span>Назва</span><input class="input" id="it-name" placeholder="Наприклад, Пилка"></label><label class="field"><span>Кількість</span><input class="input" id="it-qty" type="number" min="1" value="1"></label></div>
        <div class="grid2"><label class="field"><span>Категорія</span><select class="select" id="it-cat">${D.CATS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label><label class="field"><span>Фото</span><input class="input" type="file" accept="image/*" multiple id="it-photos"></label></div>
        <label class="field"><span>Опис</span><input class="input" id="it-desc" placeholder="Стан, де лежить, особливості"></label><p id="it-err" class="stamp late" hidden>Вкажіть назву</p><div><button class="btn pri" type="submit">Додати річ</button></div></form>` : '') +
      `<div class="cats" style="margin-bottom:1rem">${['Усі', ...D.CATS].map((c) => `<button type="button" class="${c === invCat ? 'on' : ''}" data-act="inv-cat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="tags">${items.map((it) => `<article class="tag">
        <span class="code">ЧГ-307-${String(D.inventory.indexOf(it) + 1).padStart(3, '0')}</span>
        <h3>${esc(it.name)}</h3>
        ${D.carousel(it.photos, { label: it.name, ratio: '4/3', nav: 'dots' })}
        <dl class="spec"><dt>К-сть</dt><dd>${it.qty} шт</dd><dt>Місце</dt><dd>${esc(it.place)}</dd><dt>Стан</dt><dd>${esc(it.condition)}</dd></dl>
        ${st(it)}
        ${lendFor === it.id ? lendForm(it) : `<div class="row">${it.lent ? `<button type="button" class="btn sm pri" data-act="item-return" data-id="${it.id}">Повернуто</button>` : `<button type="button" class="btn sm pri" data-act="item-lend" data-id="${it.id}">Видати</button>`}<button type="button" class="btn sm">Редагувати</button></div>`}
      </article>`).join('')}</div>`;
  };

  P.suddivstvo = () => head('Суддівство', 'Книга судді: прогрес проб і ступенів синхронізується з таблицею') +
    `<div class="stack"><section class="card"><h3>Книга судді</h3><dl class="kv"><div><dt>Таблиця</dt><dd>Книга судді 2026 · Чорногора</dd></div><div><dt>Остання синхронізація</dt><dd>сьогодні, 08:00 (нічна)</dd></div><div><dt>Очікують запису</dt><dd>3 зміни</dd></div></dl>
      <div class="row"><button type="button" class="btn pri" data-act="sync">Записати зміни в таблицю зараз</button><button type="button" class="btn">Змінити таблицю</button></div></section>
      <a class="tile" href="#import" style="min-height:0">${ic('list')}<b>Імпортувати юнаків з таблиці</b><span>Нові юнаки і оновлення з Книги судді. Звʼязковий затверджує зміни.</span></a></div>`;

  P.import = () => {
    const rows = [['Ільків Нестор', 'Рисі', 'Новий'], ['Гаврилюк Арсен', 'Тури', 'Оновлення: дата ступеня'], ['Сорока Віталій', 'Вовки', 'Новий'], ['Кушнір Орест', 'Беркути', 'Без змін'], ['Пасічник Ярослав', 'Рисі', 'Оновлення: телефон мами']];
    return head('Імпорт з Книги судді', 'Перегляньте, що зміниться, перш ніж надсилати', '', '<a class="crumb" href="#suddivstvo">← СУДДІВСТВО</a>') +
      `<div class="card"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.95rem"><thead><tr>${['', 'Юнак', 'Гурток', 'Що зміниться'].map((t) => `<th style="text-align:left;font:.72rem var(--mono);text-transform:uppercase;color:var(--ink-2);padding:.5rem;border-bottom:2px solid var(--line)">${t}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(([n, h, s], i) => `<tr><td style="padding:.5rem;border-bottom:1px dashed var(--line)"><input type="checkbox" ${s === 'Без змін' ? 'disabled' : 'checked'} aria-label="Імпортувати ${esc(n)}" id="imp-${i}"></td><td style="padding:.5rem;border-bottom:1px dashed var(--line)"><b>${esc(n)}</b></td><td style="padding:.5rem;border-bottom:1px dashed var(--line)">${esc(h)}</td><td style="padding:.5rem;border-bottom:1px dashed var(--line)"><span class="stamp ${s === 'Новий' ? 'ok' : s === 'Без змін' ? 'mute' : ''}">${esc(s)}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button type="button" class="btn pri" data-act="import-go">${isZv() ? 'Імпортувати 4 рядки' : 'Надіслати 4 рядки на затвердження'}</button><a class="btn ghost" href="#suddivstvo">Скасувати</a></div></div>`;
  };

  let apdDone = '';
  P.pysarstvo = () => head('Писарство', 'АПД сходин і документи куреня в Google Drive') +
    `<form class="card" id="apd-form" novalidate><h3>Створити АПД</h3><p class="small muted">Документ створюється у Google Drive куреня, у папці «Писарство» → «АПД». Для кожного псевдо додаються розділи «Що було добре» та «Що можна покращити».</p>
      <label class="field"><span>Назва документа</span><input class="input" id="apd-name" value="АПД сходини 15.11"></label>
      <div class="field"><span>Юнаки куреня</span><div class="ranks" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))">${roster.slice(0, 10).map((j, i) => `<label class="rank" style="cursor:pointer" for="apd-${i}"><input type="checkbox" id="apd-${i}" checked><div><span>${esc(j.hurtok)}</span><b>${esc(j.first)}</b></div></label>`).join('')}</div></div>
      <div class="row"><input class="input" style="flex:1 1 12rem;width:auto" placeholder="Псевдо гостя (не в системі)" aria-label="Псевдо гостя"><button type="button" class="btn">Додати вручну</button></div>
      <div><button class="btn pri" type="submit">Створити</button></div>
      ${apdDone ? `<p class="stamp ok" role="status">Створено «${esc(apdDone)}» у Google Drive → Писарство → АПД</p>` : ''}</form>
    <h3 class="h">Останні документи</h3>
    <div class="list">${['АПД сходини 08.11', 'АПД осінній табір', 'АПД сходини 25.10'].map((t, i) => `<div class="li">${ic('doc', 'chev2')}<span class="grow"><b>${t}</b><small>${['8 листопада', '20 жовтня', '25 жовтня'][i]} · Назар Шевчук</small></span></div>`).join('')}</div>`;

  let txType = -1, editStart = false;
  P.treasury = () => {
    const bal = treasury.start + treasury.tx.reduce((s, t) => s + t.amt, 0);
    return head('Скарбниця', 'Готівка і кошти на рахунку куреня') +
      `<div class="grid2"><section class="card"><span class="mono small muted">ПОТОЧНИЙ БАЛАНС</span><span class="money">${money(bal)}</span><span class="small muted">Початковий баланс ${money(treasury.start)} <button type="button" class="btn sm ghost" data-act="start-edit">Змінити</button></span>
        ${editStart ? `<form class="row" id="start-form"><input class="input" id="start-val" type="number" value="${treasury.start}" style="flex:1;width:auto" aria-label="Початковий баланс"><button class="btn sm pri" type="submit">Зберегти</button></form><p class="small muted">Сума готівки й коштів на рахунку на момент, коли почали вести облік тут.</p>` : ''}</section>
      <form class="card" id="tx-form" novalidate><h3>Додати запис</h3><div class="seg" role="radiogroup" aria-label="Тип"><button type="button" role="radio" aria-checked="${txType < 0}" class="${txType < 0 ? 'on' : ''}" data-act="tx-type" data-t="-1">Витрата</button><button type="button" role="radio" aria-checked="${txType > 0}" class="${txType > 0 ? 'on' : ''}" data-act="tx-type" data-t="1">Прибуток</button></div>
        <div class="grid2"><label class="field"><span>Сума (грн)</span><input class="input" id="tx-amt" type="number" min="1" inputmode="decimal"></label><label class="field"><span>Опис</span><input class="input" id="tx-desc" placeholder="Напр. «вкладка за теренівку»"></label></div>
        <p id="tx-err" class="stamp late" hidden>Вкажіть суму більше нуля</p><div><button class="btn pri" type="submit">Додати</button></div></form></div>
      <h3 class="h">Історія операцій</h3>
      <div class="list">${treasury.tx.map((t) => `<div class="li"><span class="mono small" style="min-width:5.5rem">${fmtD(t.d)}</span><span class="grow"><b>${esc(t.t)}</b></span><span class="amt ${t.amt > 0 ? 'in' : 'outm'}">${t.amt > 0 ? '+' : '−'}${money(Math.abs(t.amt))}</span></div>`).join('')}</div>`;
  };

  P.prefs = () => {
    const theme = document.documentElement.dataset.theme || 'system';
    return head('Налаштування', esc(session.first + ' ' + session.last) + ' · ' + esc(session.roleLabel)) +
      `<div class="stack">
      ${isZv() ? `<section class="card"><h3>Швидкі дії</h3><div class="list"><a class="li" href="#approvals">${ic('doc', 'chev2')}<span class="grow"><b>Запити</b><small>Зміни даних юнаків, що чекають затвердження</small></span>${approvals.length ? `<span class="cnt">${approvals.length}</span>` : ''}<span class="chev" aria-hidden="true">›</span></a><a class="li" href="#audit">${ic('list', 'chev2')}<span class="grow"><b>Журнал дій</b><small>Хто що змінив у курені</small></span><span class="chev" aria-hidden="true">›</span></a></div></section>` : ''}
      <section class="card"><h3>Вигляд</h3>
        <div class="field"><span>Тема</span><div class="seg" role="radiogroup" aria-label="Тема">${[['system', 'Як у системі'], ['light', 'Світла'], ['dark', 'Темна']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${theme === k}" class="${theme === k ? 'on' : ''}" data-act="theme" data-t="${k}">${l}</button>`).join('')}</div></div>
        <label class="sw" for="push"><input type="checkbox" id="push" checked><span>Push-сповіщення<small>Про нові оголошення і запити</small></span></label></section>
      <section class="card"><h3>Фото профілю</h3><div class="prof"><span class="bigav">${esc(session.initials)}</span><div class="row"><button type="button" class="btn sm">Змінити фото</button><button type="button" class="btn sm danger">Видалити фото</button></div></div></section>
      <form class="card" data-save novalidate><h3>Особисті дані</h3><div class="grid2"><label class="field"><span>Імʼя</span><input class="input" value="${esc(session.first)}"></label><label class="field"><span>Прізвище</span><input class="input" value="${esc(session.last)}"></label><label class="field"><span>Псевдо</span><input class="input" value="${esc(session.nick || '')}"></label><label class="field"><span>Телефон</span><input class="input" type="tel" value="+380 67 123 45 67"></label><label class="field"><span>Дата народження</span><input class="input" type="date" value="2011-05-14"></label></div><div><button class="btn pri" type="submit">Зберегти</button></div></form>
      <form class="card" data-save="Пароль змінено." novalidate><h3>Пароль</h3><div class="grid2"><label class="field"><span>Поточний пароль</span><input class="input" type="password" autocomplete="current-password"></label><label class="field"><span>Новий пароль</span><input class="input" type="password" autocomplete="new-password"></label></div><div><button class="btn pri" type="submit">Змінити пароль</button></div></form>
      <form class="card" data-save="Перевірте пошту на новій адресі: там лист із посиланням для підтвердження." novalidate><h3>Email</h3><p class="small muted">Зараз: ${esc(session.email)}</p><div class="grid2"><label class="field"><span>Нова адреса</span><input class="input" type="email"></label><label class="field"><span>Пароль</span><input class="input" type="password" autocomplete="current-password"></label></div><div><button class="btn pri" type="submit">Змінити email</button></div></form>
      <div><button type="button" class="btn danger wide" data-act="logout">Вийти</button></div></div>`;
  };

  P.approvals = () => head('Запити на затвердження', 'Зміни, які виховники й суддя просять внести', '', '<a class="crumb" href="#prefs">← НАЛАШТУВАННЯ</a>') +
    (approvals.length ? `<div class="stack">${approvals.map((a) => `<article class="card"><div class="kick"><span class="stamp">${esc(a.type)}</span><span>${fmtD(a.when)}</span></div>
      <h3>${esc(a.subj)}</h3><dl class="order"><dt>Було</dt><dd>${esc(a.from)}</dd><dt>Стане</dt><dd>${esc(a.to)}</dd><dt>Запит</dt><dd>${esc(a.who)}</dd></dl>
      <div class="row"><button type="button" class="btn pri" data-act="approve" data-id="${a.id}">Затвердити</button><button type="button" class="btn danger" data-act="reject" data-id="${a.id}">Відхилити</button></div></article>`).join('')}</div>` : '<p class="empty">Немає запитів, що очікують.</p>');

  let auditCat = 'Усі';
  P.audit = () => {
    const cats = ['Усі', ...new Set(AUDIT.map((a) => a.cat))];
    const list = AUDIT.filter((a) => auditCat === 'Усі' || a.cat === auditCat);
    return head('Журнал дій', 'Хто що змінив у курені', '', '<a class="crumb" href="#prefs">← НАЛАШТУВАННЯ</a>') +
      `<div class="card" style="margin-bottom:1rem"><div class="grid2"><label class="field"><span>Тип дії</span><select class="select" id="audit-cat">${cats.map((c) => `<option ${c === auditCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label class="field"><span>Від</span><input class="input" type="date" value="2026-11-01"></label><label class="field"><span>До</span><input class="input" type="date" value="2026-11-12"></label><label class="field"><span>Хто діяв</span><select class="select"><option>Хто діяв: усі</option>${[...new Set(AUDIT.map((a) => a.who))].map((w) => `<option>${esc(w)}</option>`).join('')}</select></label></div></div>
      <div class="list">${list.map((a) => `<div class="li"><span class="mono small" style="min-width:6.5rem">${fmtD(a.t)}<br>${a.t.slice(11, 16)}</span><span class="grow"><b>${esc(a.text)}</b><small>${esc(a.who)}</small></span><span class="stamp mute">${esc(a.cat)}</span></div>`).join('')}</div>
      <div style="margin-top:1rem"><button type="button" class="btn wide">Завантажити ще</button></div>`;
  };

  P.me = () => {
    const pos = { INTENDANT: 'Інтендант' };
    return head('Моя сторінка', '') +
      `<div class="prof" style="margin-bottom:1.2rem"><span class="bigav">${esc(session.initials)}</span><div><h2 style="margin:0;font:700 1.8rem/1.05 var(--display);text-transform:uppercase">${esc(session.last + ' ' + session.first)}</h2><p class="muted" style="margin:.3rem 0 0">${session.nick ? '«' + esc(session.nick) + '» · ' : ''}${esc(session.roleLabel)}</p></div></div>
      <div class="stack"><section class="card"><h3>Мої гуртки</h3>${session.hurtok ? `<p>Гурток «${esc(session.hurtok)}»</p>` : '<p class="muted">Вас ще не прикріплено до жодного гуртка.</p>'}</section>
      <section class="card"><h3>Діловодство</h3>${session.positions.length ? session.positions.map((p) => `<p><span class="stamp ok">${pos[p]}</span> з січня 2026</p>`).join('') : '<p class="muted">Посад зараз немає</p>'}</section>
      <section class="card"><h3>Дані</h3><dl class="kv"><div><dt>Email</dt><dd>${esc(session.email)}</dd></div><div><dt>Телефон</dt><dd>+380 67 123 45 67</dd></div><div><dt>Проживання</dt><dd>Львів</dd></div><div><dt>Навчання</dt><dd>${session.role === 'JUNAK' ? 'Ліцей №52' : 'ЛНУ ім. Франка'}</dd></div></dl><div><a class="btn sm" href="#prefs">Змінити в налаштуваннях</a></div></section></div>`;
  };

  /* ================= router ================= */
  const JZ = ['JUNAK', 'ZVYAZKOVYI'];
  const ALLOWED = { 'my-hurtok': ['VYKHOVNYK'], plast: JZ, proby: JZ, ai: JZ, activity: JZ, 'news-new': ['ZVYAZKOVYI'], approvals: ['ZVYAZKOVYI'], audit: ['ZVYAZKOVYI'] };
  function parse(h) { if (h.startsWith('user-') && h !== 'user-new') return ['user', h.slice(5)]; return [h, null]; }
  function render(keepScroll) {
    const h = location.hash.slice(1);
    document.querySelectorAll('.sheet').forEach((s) => s.remove());
    if (!session) { root.innerHTML = h === 'forgot' ? forgotPage() : loginPage(); afterRender(); return; }
    let [page, param] = parse(h || 'news');
    if (page === 'login' || page === 'forgot' || !P[page]) page = 'news';
    if (ALLOWED[page] && !ALLOWED[page].includes(session.role)) page = 'news';
    const n = navModel();
    if (['inventory', 'suddivstvo', 'import', 'pysarstvo', 'treasury'].includes(page) && !n.dil.some((d) => active(d, page))) page = 'news';
    const y = window.scrollY;
    root.innerHTML = shell(page, P[page](param));
    afterRender();
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }
  function afterRender() { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }
  const rerender = () => render(true);
  window.addEventListener('hashchange', () => { archiveAsk = false; lendFor = null; render(false); });

  /* ================= events ================= */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'login-role') { loginRole = a.dataset.role; render(true); }
    else if (act === 'google') { session = USERS[loginRole]; save(); location.hash = 'news'; render(); toast('Вхід через Google (демо)'); }
    else if (act === 'more') moreSheet();
    else if (act === 'logout') { session = null; try { sessionStorage.removeItem('plast-role'); } catch (err) { /* ignore */ } location.hash = 'login'; render(); }
    else if (act === 'cal-view') { cal.view = a.dataset.v; rerender(); }
    else if (act === 'cal-add') { cal.adding = !cal.adding; rerender(); }
    else if (act === 'ask-ai') { ai.point = a.dataset.p; }
    else if (act === 'ai-conv') { ai.conv = +a.dataset.i; rerender(); }
    else if (act === 'ai-new') { ai.convs.unshift({ title: 'Нова розмова', msgs: [] }); ai.conv = 0; rerender(); }
    else if (act === 'act-role') { a.parentElement.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === a); b.setAttribute('aria-checked', String(b === a)); }); }
    else if (act === 'act-del') { activities.splice(+a.dataset.i, 1); rerender(); }
    else if (act === 'inv-cat') { invCat = a.dataset.c; rerender(); }
    else if (act === 'item-add') { addingItem = !addingItem; rerender(); }
    else if (act === 'item-lend') { lendFor = a.dataset.id; rerender(); const sel = document.querySelector(`[data-lend="${lendFor}"] select`); if (sel) sel.focus(); }
    else if (act === 'lend-cancel') { lendFor = null; rerender(); }
    else if (act === 'item-return') { const it = D.inventory.find((i) => i.id === a.dataset.id); it.lent = null; rerender(); toast(`«${it.name}» повернуто на склад`); }
    else if (act === 'sync') toast('Записано 3 зміни: 2 дати ступенів і 1 новий юнак');
    else if (act === 'import-go') { location.hash = 'suddivstvo'; toast(isZv() ? 'Імпортовано 4 рядки' : 'Запит надіслано звʼязковому'); }
    else if (act === 'tx-type') { txType = +a.dataset.t; rerender(); }
    else if (act === 'start-edit') { editStart = !editStart; rerender(); }
    else if (act === 'theme') { const t = a.dataset.t; if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; rerender(); }
    else if (act === 'approve' || act === 'reject') { const x = approvals.find((r) => r.id === a.dataset.id); approvals = approvals.filter((r) => r.id !== a.dataset.id); AUDIT.unshift({ t: '2026-11-12T10:05', who: session.first + ' ' + session.last, cat: 'Люди', text: `${act === 'approve' ? 'Затвердив' : 'Відхилив'} запит «${x.type}» для ${x.subj}` }); rerender(); toast(act === 'approve' ? 'Затверджено' : 'Відхилено'); }
    else if (act === 'archive-ask') { archiveAsk = !archiveAsk; rerender(); }
    else if (act === 'archive-yes') { archiveAsk = false; rerender(); toast(isZv() ? 'Юнака архівовано (демо)' : 'Запит на архівацію надіслано звʼязковому'); }
  });
  // locked proby stage cannot open
  document.addEventListener('toggle', (e) => { const d = e.target; if (d.matches && d.matches('details[data-locked]') && d.open) d.open = false; }, true);

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'login-email') { /* free edit */ }
    if (t.id === 'kurin-q') { kurinQ = t.value; document.getElementById('kurin-list').innerHTML = rosterList(); }
    if (t.id === 'skill-q') { skillQ = t.value; document.getElementById('skill-list').innerHTML = skillList(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'audit-cat') { auditCat = e.target.value; rerender(); } });

  function save() { try { sessionStorage.setItem('plast-role', session.role); } catch (err) { /* ignore */ } }
  document.addEventListener('submit', (e) => {
    const f = e.target; e.preventDefault();
    const val = (id) => (document.getElementById(id) || {}).value || '';
    const showErr = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
    if (f.id === 'login-form') {
      if (!val('login-email').includes('@') || !val('login-pass')) { showErr('login-err', true); return; }
      session = USERS[loginRole]; save(); location.hash = 'news'; render();
    } else if (f.id === 'forgot-form') { forgotSent = true; render(true); }
    else if (f.id === 'post-form') {
      const title = val('post-title').trim(), body = val('post-body').trim();
      if (!title || !body) { showErr('post-err', true); return; }
      D.news.unshift({ id: 'n' + Date.now(), pinned: document.getElementById('post-pin').checked, tag: val('post-tag'), author: { first: session.first, last: session.last, initials: session.initials }, role: session.roleLabel, date: '2026-11-12T10:00', title, body: body.split(/\n\s*\n/), photos: [], reactions: {}, mine: null });
      location.hash = 'news'; toast('Опубліковано');
    } else if (f.id === 'ev-form') {
      const t = val('ev-title').trim(); if (!t) return;
      EVENTS.push({ d: val('ev-date'), t, p: val('ev-place') || 'Деталі згодом' }); cal.adding = false; cal.view = 'next'; rerender(); toast('Подію додано');
    } else if (f.id === 'ai-form') {
      const t = val('ai-text').trim(); if (!t) return;
      const c = ai.convs[ai.conv]; c.msgs.push({ me: true, t }); if (c.title === 'Нова розмова') c.title = t.slice(0, 40);
      ai.typing = true; rerender();
      setTimeout(() => { ai.typing = false; c.msgs.push({ me: false, t: 'Пропоную план на тиждень:<ol><li>Прочитай вимоги точки і випиши, що вже вмієш.</li><li>Потренуйся двічі з кимось із гуртка.</li><li>Домовся з гуртковим про показ на найближчих сходинах.</li></ol>Якщо щось незрозуміло, запитай мене конкретніше.' }); if (location.hash === '#ai') rerender(); }, 1100);
    } else if (f.id === 'act-form') {
      const t = val('act-title').trim(); if (!t) return;
      const r = f.querySelector('[data-act="act-role"].on').dataset.r;
      activities.unshift({ t, role: r, d: val('act-desc') || '' }); rerender(); toast('Додано');
    } else if (f.id === 'new-user-form') {
      if (!val('nu-first').trim() || !val('nu-last').trim()) { showErr('nu-err', true); return; }
      location.hash = 'kurin'; toast(isZv() ? 'Користувача створено' : 'Запит створено. Юнак зʼявиться після затвердження звʼязковим.');
    } else if (f.id === 'item-form') {
      const name = val('it-name').trim(); if (!name) { showErr('it-err', true); return; }
      const cat = val('it-cat'), icon = { 'Табірне': 'tent', 'Кухня': 'pot', 'Інструмент': 'saw', 'Світло': 'lantern', 'Вузли та мотузки': 'rope', 'Безпека': 'aid' }[cat] || 'tent';
      D.inventory.unshift({ id: 'i' + Date.now(), name, cat, icon, hue: 50, qty: +val('it-qty') || 1, place: 'Склад', condition: 'Новий', desc: val('it-desc'), lent: null, photos: [D.photo(icon, 50, 0), D.photo(icon, 125, 1)] });
      addingItem = false; invCat = 'Усі'; rerender(); toast('Річ додано');
    } else if (f.hasAttribute('data-lend')) {
      const who = f.who.value, due = f.due.value;
      if (!who || !due) { f.querySelector('[data-err]').hidden = false; return; }
      const it = D.inventory.find((i) => i.id === f.dataset.lend); const q = +f.qty.value || 1;
      it.lent = { who: who + (q > 1 ? ` (${q} шт)` : ''), due }; lendFor = null; rerender(); toast(`«${it.name}» видано: ${who}, повернути до ${D.fmtDue(due)}`);
    } else if (f.id === 'apd-form') { apdDone = val('apd-name') || 'АПД'; rerender(); toast('Документ створено'); }
    else if (f.id === 'tx-form') {
      const amt = Math.round(+val('tx-amt')); if (!(amt > 0)) { showErr('tx-err', true); return; }
      treasury.tx.unshift({ d: '2026-11-12', amt: amt * txType, t: val('tx-desc') || (txType > 0 ? 'Прибуток' : 'Витрата') }); rerender(); toast('Запис додано');
    } else if (f.id === 'start-form') { treasury.start = Math.round(+val('start-val')) || 0; editStart = false; rerender(); toast('Збережено'); }
    else if (f.id === 'assign-form') toast('Посаду призначено (демо)');
    else if (f.id === 'transfer-form') toast(isZv() ? 'Юнака переведено' : 'Запит на переведення надіслано, очікує затвердження звʼязковим.');
    else if (f.hasAttribute('data-save')) toast(f.dataset.save || 'Збережено.');
  });

  try { if (!session && location.hash.slice(1) !== 'forgot') history.replaceState(null, '', '#login'); } catch (err) { /* ignore */ }
  render();
})();
