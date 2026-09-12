# Реальний вміст старої проби + вибір програми куреня — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load real, verbatim content for `ProbyProgramVersion.OLD` (mirroring the already-completed NEW-program content work), and replace the raw-UUID proby-program picker on the zvyazkovyi's `/kurin` page with a simple "Стара"/"Нова" choice that requires confirmation.

**Architecture:** A one-time TS seed script (mirroring `apps/api/src/scripts/seed-real-proby-content.ts` exactly, minus its safety guards) overwrites the OLD program's `ProbyStage`/`ProbyCategory`/`ProbyPoint` subtree with real content from an in-repo data file. Separately, `ChangeProbyProgramDto` moves from an opaque `newProgramId` UUID to a `version: ProbyProgramVersion` enum value, and `KurinsService` resolves the target program by version instead of by id. The frontend picker becomes a two-option radio choice with a native `window.confirm()` guard before submitting.

**Tech Stack:** NestJS + Prisma + PostgreSQL (`apps/api`), Next.js + TanStack Query (`apps/web`), Jest (unit + e2e), Playwright (frontend e2e).

## Global Constraints

- No Prisma schema changes anywhere in this plan — `ProbyProgram`/`ProbyStage`/`ProbyCategory`/`ProbyPoint`/`ProbyProgramVersion` are used exactly as they exist today.
- The OLD seed script performs **no safety-guard checks** (no `JunakProgress`/`PointMapping` count guards) before overwriting — this is a deliberate, explicit deviation from the NEW script's pattern (Andrii's call, 2026-09-12: "Стару пробу просто переписуємо, без жодних обмежень і перевірок"). Do not add them back "for safety" — that would contradict the approved design.
- All Ukrainian point text in Task 1 must be copied verbatim, character-for-character, from this plan into the data file — no paraphrasing, no "cleaning up" wording, no fixing perceived typos in the source text (the one deliberate letter correction, Г→Ґ for a category name in Stage 3, is explicitly called out in Task 1 and is the only intentional deviation from the source PDFs).
- `ChangeProbyProgramDto`'s change from `newProgramId: string` (UUID) to `version: ProbyProgramVersion` (enum) is an intentional breaking change to an internal-only endpoint (no external consumers) — do not add backward-compatibility shims for the old field name.
- `KurinsService.changeProbyProgram`'s new lookup (`findFirst({ where: { version } })`) intentionally does not enforce "exactly one program per version" — production only ever has one program per version today, and enforcing uniqueness is a separate, not-yet-scheduled backlog item ("Каталог проб — фіксовані програми" in `docs/backlog.md`). The existing test suite (both Jest e2e fixtures and the Playwright `seedProbyProgram` helper) freely creates multiple `ProbyProgram` rows of the same version as disposable per-test fixtures, so an "exactly one" guard would break most of the existing suite. Do not add such a guard in this plan.
- The local folder `ПРОБИ  старі/` (two spaces in the name) is never read, moved, or deleted by any script or task in this plan — Andrii manually cleans it up later after verifying the loaded content in the app.
- Every task's tests must be run and pass before moving to the next task. Where a task modifies `apps/api`, run `cd apps/api && npx tsc --noEmit` before considering it done.

---

## Task 1: Real content for the OLD proby program

**Files:**
- Create: `apps/api/src/scripts/real-proby-content-old.data.ts`
- Create: `apps/api/src/scripts/real-proby-content-old.data.spec.ts`
- Create: `apps/api/src/scripts/seed-real-proby-content-old.ts`

**Interfaces:**
- Consumes: nothing from other tasks (this task is fully self-contained).
- Produces: `REAL_PROBY_CONTENT_OLD: ProbyStageData[]` (exported from `real-proby-content-old.data.ts`), reusing the existing `ProbyStageData`/`ProbyCategoryData` interface shapes already defined in `apps/api/src/scripts/real-proby-content.data.ts` (do not redefine these interfaces — import them from that file). No other task depends on anything from this task; Tasks 2 and 3 are independent of this one.

### Step 1: Write the data file with the exact verbatim content

Create `apps/api/src/scripts/real-proby-content-old.data.ts`:

```ts
import type { ProbyStageData } from './real-proby-content.data';

export const REAL_PROBY_CONTENT_OLD: ProbyStageData[] = [
  {
    order: 1,
    name: 'Проба прихильника (Відзнака прихильника)',
    categories: [
      {
        name: 'Точки',
        points: [
          'Закінчив 11 років життя',
          'Розуміє по-українському.',
          'Вміє читати і писати по-українському.',
          'Ходить до української школи або школи українознавства чи на курси українознавства (там, де такі діють).',
          'Має пластовий однострій.',
          'Має пластовий посібник УПЮ.',
          'Знає Три Головні Обов\'язки Пластуна.',
          'Відбуває релігійну практику своєї віри.',
          'Знає, що є Пласт.',
          'Вміє по-пластовому привітатися.',
          'Знає, як виглядає пластова відзнака.',
          'Знає, хто є патроном куреня, хто в проводі його куреня, та своїх виховників.',
          'Платить членський внесок.',
        ],
      },
    ],
  },
  {
    order: 2,
    name: 'Проба учасника (Скобине крило)',
    categories: [
      {
        name: 'А Три головні обов\'язки пластунки',
        points: [
          'Знає на пам\'ять і пояснить Три Головні Обов\'язки Пластуна.',
          'Відбуває релігійну практику в своєму обряді.',
          'Знає на пам\'ять і пояснить 14 точок Пластового Закону.',
          'Знає і заспіває український державний гімн, намалює герб України і розкаже про його походження. Знає, як виглядає та що символізує український прапор, вміє його шанувати.',
          'Щоденно спілкується українською мовою та дбає про чистоту свого мовлення. Налаштує українську мову в своїх електронних пристроях та програмах, якими користується.',
          'Пояснить пластове розуміння доброго діла та як практикує його в щоденному житті. Зробить добре діло з гуртком.',
          'Знає головні географічні характеристики України (площа, населення, області, інше), головні події з новітньої історії України (Перші та другі визвольні змагання, дисидентський рух, відновлення незалежності, Майдани) та сучасного провідника Української держави.',
          'Знає історію і сучасність свого міста чи села.',
          'Знає про поселення українців поза межами України. Виконає проект «Пласт та українці у світі» (наприклад, доповнить чи виправить відповідну статтю у Вікіпедії).',
          'Добре навчається в школі та підтвердить це відповідним документом.',
          'На сходинах гуртка розповість про останню прочитану книгу позашкільної програми.',
        ],
      },
      {
        name: 'Б Пластова Ідея',
        points: [
          'Знає хто, коли і для чого заснував скаутський рух (Бейден Поуел) та Пласт (Іван Чмола, Петро Франко, Олександр Тисовський).',
          'Заспіває і пояснить Пластовий Обіт. Знає його авторів.',
          'Пояснить пластове гасло СКОБ та його символи.',
          'Знає та заспіває Пластовий Гімн та Гімн Закарпатських Пластунів, знає їх авторів.',
          'Намалює і пояснить пластову відзнаку, знає де її можна і треба носити та зображати. Знайомий із основними правилами бренд-буку Пласту.',
          'Знає хто і чому є патроном Пласту. Знає життєпис патрона Пласту.',
          'Знає життєпис патрона свого куреня та прикмети характеру, що зробили його гідним наслідування.',
        ],
      },
      {
        name: 'В Пластова організація',
        points: [
          'Знає та пояснить організацію гуртка, права та обов\'язки членів гуртка, гурткових діловодів та їх відзнаки. Успішно виконує своє гурткове діловодство.',
          'Знає організацію куреня та пояснить обов\'язки діловодів. Знає відзнаки курінних діловодів, хто є в проводі куреня. Може швидко із ними сконтактувати.',
          'Знає, хто є станичним/-ою і структуру станичного проводу. Знає, які відзнаки носять ці діловоди.',
          'Знає, які відзначення і перестороги надаються в Пласті. Знає відзнаки пластових відзначень.',
        ],
      },
      {
        name: 'Г Пластові заняття',
        points: [
          'Знає і заспіває не менше, ніж 4 народні та 4 пластові пісні, пояснить їх походження.',
          'Вміє надавати й виконувати впорядові накази в гуртку.',
          'Знає правила чесної гри і їх дотримується. Пояснить і проведе 3 гри з гуртком чи куренем. Пояснить їх призначення та користь.',
          'Читає пластові публікації та зробить допис на пластову тематику.',
          'Візьме участь у 3-х пластових заходах (спільному занятті з іншим гуртком, тереновій грі, спортивному змазі, інтелектуальному, мистецькому, майстерці чи іншому заході).',
          'Знає, які є види прогулянок (екскурсій) і візьме участь в одній з них зі своїм гуртком.',
        ],
      },
      {
        name: 'Ґ Життя в природі',
        points: [
          'Знає, чому треба дбати про довкілля і пояснить, як це сама робить.',
          'Знає по 10 рослин і 10 тварин своєї околиці, небезпечні і корисні рослини і тварини, розпізнає сліди не менше 6 тварин.',
          'Вміє збудувати гніздо для розпалення вогню; запалить його не більше, як трьома сірниками; правильно загасить і затре слід від вогню.',
          'Знає, який особистий виряд потрібен на одноденну прогульку і спакує наплечник.',
          'Знає, який особистий виряд потрібен на табір і спакує наплечник.',
          'Зав\'яже 6 вузлів та одне в\'язання, знає, коли їх застосовувати. Візьме участь у побудові піонірської споруди. Знає правила відповідальної піонірки.',
          'Знає, як правильно користуватись, зберігати та транспортувати ніж, сокиру, лопату, пилу.',
          'Вміє вибрати місце під шатро, розставити його та спакувати, затерти сліди свого перебування, згідно з правилами екологічного таборування.',
          'Відбуде одну гурткову чи курінну мандрівку в природі з нічлігом.',
          'Відбуде один курінний або окружний виховний табір за програмою першої проби.',
        ],
      },
      {
        name: 'Д Життєва зарадність',
        points: [
          'Вміє викликати лікаря, міліцію, пожежну охорону (рятувальників), газову службу. Може швидко дізнатись графік руху потрібного транспорту.',
          'Вміє надати допомогу у випадках: поранення, сонячного удару, опіку чи переохолодження/обмороження.',
          'Покаже сторони світу за допомогою компаса, сонця та зір. Вміє зорієнтувати карту на місцевості.',
          'Знає основні знаки на топографічній карті. Зайде у визначене на цій карті місце. Вміє користуватися сучасними способами навігації у місті та електронними картами.',
          'Вміє правильно користуватися різними засобами обміну інформацією: пошта (звичайна та електронна), Інтернет, телефон.',
          'Знає правила доброї поведінки та дотримується їх в житті. Візьме участь у гутірці про добру поведінку.',
          'Знає правила дорожнього руху для пішохода та велосипедиста.',
          'Володіє іноземною мовою на доступному рівні (щонайменше А2 за глобальною шкалою), щоб пояснити особисті потреби, відрекомендуватися та відповісти на запитання про себе чи інших людей. Візьме участь у діалозі на довільну тему іноземною мовою.',
          'Знає правила ведення дискусії. Візьме участь у дискусії на довільну тему.',
        ],
      },
      {
        name: 'Е Тіловиховання',
        points: [
          'Знає основні вправи щоденної руханки та практикує її щодення. Регулярно, принаймні двічі на тиждень, відвідує спортивну секцію або займається рухливими іграми/спортом.',
          'Вміє плавати та пропливе будь-яким стилем 50 метрів.',
          'Здобуде ВФВ свого віку (за бажанням).',
        ],
      },
      {
        name: 'Є Юнацькі вмілості',
        points: [
          'Знає, де знайти перелік пластових вмілостей, як їх здавати та де пришивати здобуті.',
          'Здобуде пластову вмілість «Перша Медична допомога І».',
          'Здобуде 5 пластових вмілостей Першої Проби (серед яких рекомендовано «Домашню зарадність І»).',
        ],
      },
    ],
  },
  {
    order: 3,
    name: 'Проба розвідувача (Скобиний хват)',
    categories: [
      {
        name: 'А Три головні обов\'язки пластуна',
        points: [
          'Візьме участь у дискусії про Три Головні Обов\'язки Пластуна, де подасть приклади застосування їх в особистому житті.',
          'Знає церковний обряд, традиції та головні свята свого віровизнання. Знає основні засади інших світових релігій.',
          'Візьме участь у дискусії про Пластовий закон, де подасть приклади застосування його в особистому житті.',
          'Знає історію української національної символіки.',
          'Доведе, що читає україномовні (в т.ч. пластові) книжки, журнали і газети, електронні видання регіонального та національного рівня.',
          'Підготує і виконає проект для плекання українських національних релігійних традицій, залучаючи до реалізації свій гурток або курінь (День святого Миколая, Андрія, Маланка, Вертеп, Гаївки, Свято Весни, Купала тощо).',
          'Підготує і виконає соціальний (суспільний) проект пластового доброго діла, залучаючи до реалізації свій гурток або курінь.',
          'Підготує і виконає проект громадянського (національно-патріотичного) виховання, залучаючи до реалізації свій гурток або курінь (Повстанська Ватра на Покрову, Листопадовий чин, акція «Пам\'ятай про Крути» тощо).',
          'Знає права та обов\'язки громадянина України згідно Конституції.',
          'Підтвердить успішність свого навчання в школі (гімназії, ліцеї, коледжі) відповідним документом.',
        ],
      },
      {
        name: 'Б Пластова ідея та організація',
        points: [
          'Візьме участь у дискусії, в якій пояснить чому належить до Пласту.',
          'Знає в загальному історію Пласту в його шести етапах, а саме: 1911-1920; 1920-1930; 1930-1945; 1945-1950; 1950-1990; 1990-по сьогодні.',
          'Веде успішно діловодство гурткового або курінне діловодство або допомагає підбратчиком/сестричкою в новацтві щонайменше 6 місяців.',
          'Знає, з яких частин складається Крайова Організація і світовий Пласт, назве головних членів Станичної, Крайової, Головної старшини. Вміє розрізняти їх відзнаки.',
          'Вміє надавати та виконувати впорядові накази в курені.',
          'Візьме участь в організації або організує теренову гру.',
          'Пояснить, як підготувати і провести гутірку і що потрібно, щоб її успішно провести. Підготує гутірку з використанням електронної презентації.',
          'Підготує і проведе з гуртком серію сходин з гутірками, іграми, піснями, майстерками, впорядом та іншими елементами пластових сходин.',
          'Організує гурток або команду від куреня на станичний/окружний або крайовий захід: спортивний чи мистецький змаг, теренову гру, табір тощо.',
          'Організує з гуртком або куренем одну прогулянку (екскурсію).',
        ],
      },
      {
        name: 'В Пластові заняття',
        points: [
          'Знає і заспіває щонайменше 5 пластових, 5 стрілецьких і повстанських, 5 обрядових і 5 сучасних українських пісень. Знає їх походження.',
          'Знає екологічну ситуацію свого регіону та екологічні проблеми України.',
          'Знає основні природоохоронні об\'єкти своєї держави та своєї області, найбільш поширені види рослин і тварин України, небезпеки від них. Знайде і опише або зафіксує хоча б 10 слідів тварин.',
        ],
      },
      {
        name: 'Г Життя в природі',
        points: [
          'Візьме участь у змаганні з лисячого бігу (спортивному орієнтуванні).',
          'Знає, які є роди ватер, вміє збудувати ватру, запалити не більше, як двома сірниками, загасити і затерти сліди від вогню.',
          'Зварить на польовій кухні обід з двох страв.',
          'Зав\'яже 10 вузлів і 2 в\'язання, знає, як і коли їх застосовувати. Організує з гуртком/куренем будівництво таборової споруди.',
          'Збудує в природі кухню, знає що робити з відпадками. Знає, які споруди мають бути на таборовій кухні та де вони повинні знаходитися.',
          'Організує з гуртком дві гурткові або курінні мандрівки з нічлігом.',
          'Відбуде успішно виховний окружний/крайовий табір.',
        ],
      },
      {
        // Джерело (2_skobynyy-hvat_hl_chb.pdf) друкує цю категорію під літерою
        // "Г" вдруге (друкарська помилка макета — та сама категорія помилок,
        // що й у чоловічому файлі НОВОЇ програми). Виправлено на послідовну
        // літеру "Ґ".
        name: 'Ґ Життєва зарадність',
        points: [
          'Успішно пройде курс долікарської медичної допомоги (пластовий або інший - наприклад, Мальтійської служби допомоги) та представить відповідний документ.',
          'Орієнтується в своїй області, знає головні об\'єкти і шляхи сполучення, знайде на місцевості місце, вказане на карті.',
          'Вміє правильно користуватись інструментами підвищення ефективності (офіс, онлайн календар). Вміє планувати свій час за допомогою електронних календарів.',
          'Складе кошторис та фінансовий звіт одної із запропонованих акцій (курінна мандрівка, табір).',
          'Володіє іноземною мовою на доступному рівні (щонайменше В1 за глобальною шкалою), і для цього виконає наступні вимоги (одну на вибір): А. Представить власний життєпис на гурткових сходинах; Б. Організує гутірку (дискусію) на обрану тему; В. Візьме участь у тренінгу (школі) іноземною мовою; Г. Розповість про прочитану книгу іноземною мовою.',
        ],
      },
      {
        name: 'Д Тіловиховання',
        points: [
          'Дбає про своє здоров\'я. Проведе руханку з гуртком або куренем.',
          'Здобуде ВФВ свого віку (за бажанням).',
        ],
      },
      {
        name: 'Е Юнацькі вмілості',
        points: [
          'Здобуде 5 пластових вмілостей Другої проби (рекомендовано: «Картографія», «Домашня зарадність-2», вмілості спеціалізацій).',
        ],
      },
    ],
  },
];
```

### Step 2: Write the failing unit test for the data shape

Create `apps/api/src/scripts/real-proby-content-old.data.spec.ts`:

```ts
import { REAL_PROBY_CONTENT_OLD } from './real-proby-content-old.data';

describe('REAL_PROBY_CONTENT_OLD', () => {
  it('has 3 stages in order 1, 2, 3', () => {
    expect(REAL_PROBY_CONTENT_OLD).toHaveLength(3);
    expect(REAL_PROBY_CONTENT_OLD.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('has the expected stage names', () => {
    expect(REAL_PROBY_CONTENT_OLD.map((s) => s.name)).toEqual([
      'Проба прихильника (Відзнака прихильника)',
      'Проба учасника (Скобине крило)',
      'Проба розвідувача (Скобиний хват)',
    ]);
  });

  it('Stage 1 has exactly 1 category with 13 points', () => {
    const stage = REAL_PROBY_CONTENT_OLD[0];
    expect(stage.categories).toHaveLength(1);
    expect(stage.categories[0].name).toBe('Точки');
    expect(stage.categories[0].points).toHaveLength(13);
  });

  it('Stage 2 has exactly 8 categories totalling 53 points', () => {
    const stage = REAL_PROBY_CONTENT_OLD[1];
    expect(stage.categories).toHaveLength(8);
    expect(stage.categories.map((c) => c.points.length)).toEqual([11, 7, 4, 6, 10, 9, 3, 3]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(53);
  });

  it('Stage 3 has exactly 7 categories totalling 38 points, with the corrected Ґ letter', () => {
    const stage = REAL_PROBY_CONTENT_OLD[2];
    expect(stage.categories).toHaveLength(7);
    expect(stage.categories.map((c) => c.name)).toEqual([
      'А Три головні обов\'язки пластуна',
      'Б Пластова ідея та організація',
      'В Пластові заняття',
      'Г Життя в природі',
      'Ґ Життєва зарадність',
      'Д Тіловиховання',
      'Е Юнацькі вмілості',
    ]);
    expect(stage.categories.map((c) => c.points.length)).toEqual([10, 10, 3, 7, 5, 2, 1]);
    const total = stage.categories.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(38);
  });

  it('has 104 points in total across all stages', () => {
    const total = REAL_PROBY_CONTENT_OLD.reduce(
      (sum, stage) => sum + stage.categories.reduce((s, c) => s + c.points.length, 0),
      0,
    );
    expect(total).toBe(104);
  });
});
```

### Step 3: Run the test to verify it fails

Run: `cd apps/api && npx jest real-proby-content-old.data.spec.ts`
Expected: FAIL — `Cannot find module './real-proby-content-old.data'` (the data file doesn't exist as a module target yet if you write the test before the data file; if you wrote the data file first per Step 1, this test should instead PASS immediately — in that case just run it to confirm PASS and move to Step 4 without expecting a failure. Either order is fine; the important thing is both files exist and the test passes before Step 4).

### Step 4: Confirm the test passes

Run: `cd apps/api && npx jest real-proby-content-old.data.spec.ts`
Expected: PASS, 6 tests.

### Step 5: Write the seed script

Create `apps/api/src/scripts/seed-real-proby-content-old.ts`:

```ts
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { REAL_PROBY_CONTENT_OLD } from './real-proby-content-old.data';

const prisma = new PrismaClient();

async function main() {
  const programs = await prisma.probyProgram.findMany({
    where: { version: ProbyProgramVersion.OLD },
  });
  if (programs.length !== 1) {
    throw new Error(
      `Expected exactly one ProbyProgram with version=OLD, found ${programs.length}. Aborting without changes.`,
    );
  }
  const program = programs[0];

  await prisma.probyPoint.deleteMany({ where: { category: { stage: { programId: program.id } } } });
  await prisma.probyCategory.deleteMany({ where: { stage: { programId: program.id } } });
  await prisma.probyStage.deleteMany({ where: { programId: program.id } });

  for (const stage of REAL_PROBY_CONTENT_OLD) {
    await prisma.probyStage.create({
      data: {
        programId: program.id,
        order: stage.order,
        name: stage.name,
        categories: {
          create: stage.categories.map((category) => ({
            name: category.name,
            points: {
              create: category.points.map((description, index) => ({
                order: index + 1,
                description,
              })),
            },
          })),
        },
      },
    });
  }

  const stageCount = await prisma.probyStage.count({ where: { programId: program.id } });
  const categoryCount = await prisma.probyCategory.count({ where: { stage: { programId: program.id } } });
  const pointCount = await prisma.probyPoint.count({ where: { category: { stage: { programId: program.id } } } });

  console.log(
    `Seeded program ${program.id} (${program.name}): ${stageCount} stages, ${categoryCount} categories, ${pointCount} points.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Note this deliberately omits the `JunakProgress`/`PointMapping` guard checks present in `seed-real-proby-content.ts` — see Global Constraints.

### Step 6: Verify the script runs cleanly against the local dev database

Run: `cd apps/api && npx ts-node src/scripts/seed-real-proby-content-old.ts`
Expected: prints `Seeded program <id> (<name>): 3 stages, 16 categories, 104 points.` with no errors. If it throws "Expected exactly one ProbyProgram with version=OLD, found 0" because your local dev DB has no OLD program at all, first create one via the admin endpoint (`POST /admin/proby-programs` with `{"version": "OLD", "name": "Стара програма"}`) using the existing admin-key flow, then re-run.

### Step 7: Commit

```bash
git add apps/api/src/scripts/real-proby-content-old.data.ts apps/api/src/scripts/real-proby-content-old.data.spec.ts apps/api/src/scripts/seed-real-proby-content-old.ts
git commit -m "feat: add real content and seed script for OLD proby program"
```

---

## Task 2: Version-based proby-program selection (backend)

**Files:**
- Modify: `apps/api/src/kurins/dto/change-proby-program.dto.ts`
- Modify: `apps/api/src/kurins/kurins.service.ts`
- Modify: `apps/api/src/kurins/kurins.controller.ts`
- Modify: `apps/api/test/kurins-proby-program.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `PATCH /kurins/:id/proby-program` now accepts `{ version: 'OLD' | 'NEW' }` instead of `{ newProgramId: string }`. `GET /kurins/me` (and any other call to `KurinsService.findById`) now returns an additional `probyProgram: { version: 'OLD' | 'NEW' }` object alongside the existing flat `probyProgramId` field (which stays, unchanged, for now). Task 3's frontend work consumes both of these exact shapes.

### Step 1: Update the existing e2e tests to the new DTO shape

Modify `apps/api/test/kurins-proby-program.e2e-spec.ts` — every `.send({ newProgramId: newTree.program.id })` becomes `.send({ version: ProbyProgramVersion.NEW })` (the version of the program these tests want to switch *to*; all 6 tests in this file switch from an `OLD`-version tree to a `NEW`-version tree, so every occurrence changes the same way). Concretely, replace all 6 occurrences of:

```ts
      .send({ newProgramId: newTree.program.id })
```

with:

```ts
      .send({ version: ProbyProgramVersion.NEW })
```

`ProbyProgramVersion` is already imported at the top of this file (line 5: `import { PrismaClient, Role, ProbyProgramVersion, ProgressStatus, ProgressAction } from '@prisma/client';`), so no new import is needed. Each test in this file still creates its own isolated `oldTree`/`newTree` pair via `createProbyProgramTree` inside a database that gets wiped by `cleanDatabase` in `beforeEach` (see the file's existing `beforeEach` hook) — so at the moment each test calls the endpoint, there is exactly one `OLD`-version and one `NEW`-version `ProbyProgram` row in the whole test database, making `findFirst({ where: { version } })` in the service (Step 2 below) fully deterministic for these tests. Do not change any other part of this file — the assertions (`response.body.probyProgramId`, `newProgress?.status`, etc.) all still hold since they read the *result* of the change, not the request shape.

### Step 2: Run the e2e tests to verify they fail

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurins-proby-program`
Expected: FAIL — the DTO still only accepts `newProgramId`, so `version` is stripped by the `ValidationPipe`'s `whitelist: true` and `newProgramId` is `undefined`, causing a 400 (missing required `@IsUUID` field) instead of the expected 200/403 responses.

### Step 3: Update the DTO

Modify `apps/api/src/kurins/dto/change-proby-program.dto.ts`. Read the current file first (it currently exports a class with a single `@IsUUID() newProgramId: string;` field). Replace its entire contents with:

```ts
import { IsEnum } from 'class-validator';
import { ProbyProgramVersion } from '@prisma/client';

export class ChangeProbyProgramDto {
  @IsEnum(ProbyProgramVersion)
  version: ProbyProgramVersion;
}
```

### Step 4: Update the service

Modify `apps/api/src/kurins/kurins.service.ts`. Two changes:

1. In `findById`, add an `include` so the response carries the program's version:

```ts
  async findById(kurinId: string) {
    const kurin = await this.prisma.kurin.findUnique({
      where: { id: kurinId },
      include: { probyProgram: { select: { version: true } } },
    });
    if (!kurin) {
      throw new NotFoundException('Kurin not found');
    }
    return kurin;
  }
```

2. In `changeProbyProgram`, change the method signature's second parameter from `newProgramId: string` to `version: ProbyProgramVersion`, and change how the target program is located. The rest of the method (the `junaky`/`doneOldEntries`/mapping/upsert loop and the final update) stays exactly as-is — only the parameter and the lookup line change:

```ts
  async changeProbyProgram(kurinId: string, version: ProbyProgramVersion, actorId: string) {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: kurinId } });
    if (!kurin) throw new NotFoundException('Kurin not found');

    const newProgram = await this.prisma.probyProgram.findFirst({ where: { version } });
    if (!newProgram) throw new NotFoundException('Proby program not found');

    if (kurin.probyProgramId === newProgram.id) {
      return kurin;
    }

    const oldProgramId = kurin.probyProgramId;
    const junaky = await this.prisma.user.findMany({
      where: { kurinId, role: Role.JUNAK },
      select: { id: true },
    });

    for (const junak of junaky) {
      const doneOldEntries = await this.prisma.junakProgress.findMany({
        where: {
          junakId: junak.id,
          status: ProgressStatus.DONE,
          point: { category: { stage: { programId: oldProgramId } } },
        },
      });

      for (const entry of doneOldEntries) {
        const mapping = await this.prisma.pointMapping.findFirst({
          where: {
            OR: [{ oldPointId: entry.pointId }, { newPointId: entry.pointId }],
          },
        });
        if (!mapping) continue;

        const targetPointId =
          mapping.oldPointId === entry.pointId ? mapping.newPointId : mapping.oldPointId;

        const existingTarget = await this.prisma.junakProgress.findUnique({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
        });

        await this.prisma.junakProgress.upsert({
          where: { junakId_pointId: { junakId: junak.id, pointId: targetPointId } },
          update: {},
          create: {
            junakId: junak.id,
            pointId: targetPointId,
            status: ProgressStatus.DONE,
            confirmedById: entry.confirmedById,
            confirmedAt: entry.confirmedAt,
            transferredFromPointId: entry.pointId,
          },
        });

        if (!existingTarget) {
          await this.prisma.progressAuditLog.create({
            data: {
              junakId: junak.id,
              pointId: targetPointId,
              action: ProgressAction.CONFIRM,
              actorId,
            },
          });
        }
      }
    }

    return this.prisma.kurin.update({
      where: { id: kurinId },
      data: { probyProgramId: newProgram.id },
    });
  }
```

Add `ProbyProgramVersion` to the existing `@prisma/client` import at the top of the file (currently `import { ProgressAction, ProgressStatus, Role } from '@prisma/client';` — add `ProbyProgramVersion` to that same import list).

### Step 5: Update the controller

Modify `apps/api/src/kurins/kurins.controller.ts` — the `changeProbyProgram` method currently calls `this.kurinsService.changeProbyProgram(id, dto.newProgramId, user.userId)`. Change the argument to `dto.version`:

```ts
  @Roles(Role.ZVYAZKOVYI)
  @Patch(':id/proby-program')
  changeProbyProgram(
    @Param('id') id: string,
    @Body() dto: ChangeProbyProgramDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (id !== user.kurinId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return this.kurinsService.changeProbyProgram(id, dto.version, user.userId);
  }
```

No other lines in this file change.

### Step 6: Run the e2e tests to verify they pass

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand kurins-proby-program`
Expected: PASS, all 6 tests.

### Step 7: Run the full backend test suites and typecheck

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/api && DATABASE_URL_TEST="postgresql://plast:plast@localhost:5432/plast_test" npx jest --config ./test/jest-e2e.json --runInBand`
Expected: all suites pass (no regressions in other files).

Run: `cd apps/api && npx jest`
Expected: all unit suites pass, including the new `real-proby-content-old.data.spec.ts` from Task 1 if that task's commit already landed.

### Step 8: Commit

```bash
git add apps/api/src/kurins/dto/change-proby-program.dto.ts apps/api/src/kurins/kurins.service.ts apps/api/src/kurins/kurins.controller.ts apps/api/test/kurins-proby-program.e2e-spec.ts
git commit -m "feat: select kurin proby program by version instead of raw program id"
```

---

## Task 3: Frontend — version-based program picker with confirmation

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/queries/kurin.ts`
- Modify: `apps/web/app/kurin/page.tsx`
- Modify: `apps/web/e2e/kurin-settings.spec.ts`

**Interfaces:**
- Consumes: the backend contract from Task 2 — `GET /kurins/me` returns `{ ..., probyProgram: { version: 'OLD' | 'NEW' } }`; `PATCH /kurins/:id/proby-program` accepts `{ version: 'OLD' | 'NEW' }`. This task must be done after Task 2's backend changes exist (either already merged, or you're implementing against the contract described in Task 2's Interfaces section — the exact shape is fixed there and won't change).
- Produces: nothing consumed by later tasks (this is the last task in this plan).

### Step 1: Update the frontend `Kurin` type

Modify `apps/web/lib/types.ts`. Find the `Kurin` interface (currently ending with `probyProgramId: string;`) and replace that one field with a nested object:

```ts
export interface Kurin {
  id: string;
  name: string;
  kurinNumber: string;
  gender: 'MALE' | 'FEMALE';
  stanytsia: string;
  probyProgram: {
    version: 'OLD' | 'NEW';
  };
}
```

### Step 2: Update the query hook

Modify `apps/web/lib/queries/kurin.ts`. Change `useChangeProbyProgram`'s mutation function argument type from `string` to the version union, and change the request body key from `newProgramId` to `version`:

```ts
export function useChangeProbyProgram(kurinId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: 'OLD' | 'NEW') =>
      apiFetch<Kurin>(`/kurins/${kurinId}/proby-program`, {
        method: 'PATCH',
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kurin', 'me'] });
    },
  });
}
```

No other function in this file changes.

### Step 3: Redesign the `/kurin` page's program picker

Modify `apps/web/app/kurin/page.tsx`. Read the current file first — it has a `newProgramId` state string, a text `<Input>`, and a raw `Поточна програма: {kurin.probyProgramId}` line inside the "Програма проб" `Card`. Replace the whole "Програма проб" `Card` block, and the now-unused `newProgramId` state, as follows.

Remove this line near the top of the component:

```tsx
  const [newProgramId, setNewProgramId] = useState('');
```

Replace the entire "Програма проб" `Card` (from `<Card>` through its closing `</Card>`, the second `Card` in the file) with:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Програма проб</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Поточна програма: {kurin.probyProgram.version === 'OLD' ? 'Стара' : 'Нова'}
          </p>
          {canChangeProgram && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="programOld"
                  name="probyProgramVersion"
                  value="OLD"
                  checked={selectedVersion === 'OLD'}
                  onChange={() => setSelectedVersion('OLD')}
                />
                <Label htmlFor="programOld">Стара програма</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="programNew"
                  name="probyProgramVersion"
                  value="NEW"
                  checked={selectedVersion === 'NEW'}
                  onChange={() => setSelectedVersion('NEW')}
                />
                <Label htmlFor="programNew">Нова програма</Label>
              </div>
              <Button
                disabled={selectedVersion === kurin.probyProgram.version || changeProgram.isPending}
                onClick={() => {
                  const label = selectedVersion === 'OLD' ? 'СТАРУ' : 'НОВУ';
                  if (window.confirm(`Змінити програму проби куреня на ${label}? Це вплине на прогрес усіх юнаків.`)) {
                    changeProgram.mutate(selectedVersion);
                  }
                }}
              >
                Змінити програму
              </Button>
              {changeProgram.isError && (
                <p className="text-sm text-destructive">{accessErrorMessage(changeProgram.error)}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
```

Add a new state variable, initialized from the loaded kurin, right after the existing `useState` declarations (next to where `newProgramId` used to be declared):

```tsx
  const [selectedVersion, setSelectedVersion] = useState<'OLD' | 'NEW'>('OLD');

  useEffect(() => {
    if (kurin) {
      setSelectedVersion(kurin.probyProgram.version);
    }
  }, [kurin]);
```

This requires importing `useEffect` — check the top of the file; if `useEffect` is not already imported from `'react'`, add it to the existing `import { useState } from 'react';` line, making it `import { useEffect, useState } from 'react';`.

### Step 4: Typecheck the frontend

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. (This will fail if `useEffect` wasn't imported, or if the `Kurin` type's `probyProgram` field doesn't match how it's used — fix accordingly before proceeding.)

### Step 5: Update the Playwright e2e test

Modify `apps/web/e2e/kurin-settings.spec.ts`. Read the current file first — it seeds an `oldProgram` and a `newProgram` (both created via `seedProbyProgram`, which always creates a `version: 'OLD'` `ProbyProgram` under the hood regardless of the JS variable's name — this is a pre-existing quirk of that test helper, unrelated to this plan), attaches the kurin to `oldProgram.id`, then fills a text field with `newProgram.id` and asserts the resulting `probyProgramId`.

Because Task 2's backend now selects a target program by **version**, not by a specific program's id, and because dozens of other Playwright spec files in this suite also call `seedProbyProgram` (which always creates additional `version: 'OLD'` programs) against the same shared dev database across a whole test run, there is no reliable way for this test to assert that switching to "Нова" lands on any *specific* program's id — many `NEW`-version programs already exist in that shared database by the time this test runs (including the real seeded one from the Task 1-equivalent NEW subproject). The redesigned UI doesn't expose program identity to the user anyway (only "Стара"/"Нова"), so the test should only assert the **version label**, not a specific program id. Replace the whole test with:

```ts
import { test, expect } from '@playwright/test';
import { seedProbyProgram, seedKurinWithZvyazkovyi } from './helpers/seed';
import { loginAs } from './helpers/auth';

test('lets zvyazkovyi view kurin settings and change the proby program', async ({ page }) => {
  const { program: oldProgram } = await seedProbyProgram(['Стара точка']);
  const { zvyazkovyiEmail, zvyazkovyiPassword, kurin } = await seedKurinWithZvyazkovyi(oldProgram.id);

  await loginAs(page, zvyazkovyiEmail, zvyazkovyiPassword);
  await page.goto('/kurin');

  await expect(page.getByText(kurin.name)).toBeVisible();
  await expect(page.getByText('Поточна програма: Стара')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Нова програма').check();
  await page.getByRole('button', { name: 'Змінити програму' }).click();

  await expect(page.getByText('Поточна програма: Нова')).toBeVisible();
});
```

Note the `page.once('dialog', (dialog) => dialog.accept())` registered *before* the click that triggers `window.confirm()` — Playwright auto-dismisses native dialogs unless a handler is registered first, so the handler must be set up ahead of the action that opens the dialog. This is the first use of `window.confirm()` handling in this test suite; there is no other precedent file to match against.

### Step 6: Run the Playwright test

Run: `cd apps/web && npx playwright test kurin-settings`
Expected: PASS.

### Step 7: Run the full Playwright suite

Run: `cd apps/web && npx playwright test`
Expected: all tests pass (no regressions — in particular, `kurin-number.spec.ts` and any other spec touching `/kurin` should be unaffected since they don't interact with the proby-program picker).

### Step 8: Commit

```bash
git add apps/web/lib/types.ts apps/web/lib/queries/kurin.ts apps/web/app/kurin/page.tsx apps/web/e2e/kurin-settings.spec.ts
git commit -m "feat: redesign kurin proby-program picker as a stara/nova choice with confirmation"
```
