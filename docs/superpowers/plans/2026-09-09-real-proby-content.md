# Реальний вміст проби (Нова програма) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `ProbyProgram(version=NEW)` catalog with the real, official Пласт proba content (128 points across 3 stages and 16 categories), via a one-time seed script.

**Architecture:** A typed data file holds the fully-transcribed content (verified against 7 source PDFs). A standalone script, run manually (never automatically), asserts the existing NEW program's tree is safe to replace (no real progress or mappings reference it), deletes its current placeholder subtree, and inserts the real one via nested Prisma creates. No Prisma schema changes — `ProbyProgram → ProbyStage → ProbyCategory → ProbyPoint` already fits this content exactly.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, unchanged). `ts-node` (already a devDependency) for local runs; the compiled script (via the existing `nest build`) for the production run, since the production Docker image excludes devDependencies.

## Global Constraints

- **No Prisma schema changes in this plan.** The design spec (`docs/superpowers/specs/2026-09-09-proby-content-design.md`) confirms the existing model fits without modification.
- **The script must never run automatically.** Not wired into `prisma migrate deploy`, the Docker `CMD`, or CI. It is a manually-invoked, one-time data load.
- **The safety check is load-bearing, not optional.** Before deleting the NEW program's existing `ProbyStage` tree, the script must assert that zero `JunakProgress` rows and zero `PointMapping` rows reference any of its current points. If either count is nonzero, the script must throw and abort without deleting anything — this is what protects real user progress if this script is ever mistakenly re-run after the placeholder is no longer empty.
- **`ProbyProgramVersion.OLD` and `PointMapping` are untouched** — out of scope per the design spec. The script only ever touches the single program with `version: NEW`.
- Git hygiene: every commit uses exact file paths in `git add`, never `-A` or `.`.

---

### Task 1: Seed data file, seed script, local verification

**Files:**
- Create: `apps/api/src/scripts/real-proby-content.data.ts`
- Create: `apps/api/src/scripts/seed-real-proby-content.ts`

**Interfaces:**
- Consumes: `PrismaClient`, `ProbyProgramVersion` from `@prisma/client` (existing, generated from `apps/api/prisma/schema.prisma`). Existing model shape: `ProbyProgram { id, version, name, stages: ProbyStage[] }`, `ProbyStage { id, programId, order, name, categories: ProbyCategory[] }`, `ProbyCategory { id, stageId, name, points: ProbyPoint[] }`, `ProbyPoint { id, categoryId, order, description }`, `JunakProgress { pointId, transferredFromPointId, ... }`, `PointMapping { oldPointId, newPointId, ... }`.
- Produces: nothing consumed by later tasks — this is the only task in this plan.

- [ ] **Step 1: Write the seed data file**

Create `apps/api/src/scripts/real-proby-content.data.ts`:

```ts
export interface ProbyCategoryData {
  name: string;
  points: string[];
}

export interface ProbyStageData {
  order: number;
  name: string;
  categories: ProbyCategoryData[];
}

export const REAL_PROBY_CONTENT: ProbyStageData[] = [
  {
    order: 1,
    name: 'Проба прихильника (Відзнака прихильника)',
    categories: [
      {
        name: 'Точки',
        points: [
          "Я розумію та вмію розмовляти українською мовою. Поясню важливість плекання української мови пластунами. Ходжу до української школи або школи українознавства чи на курси українознавства",
          'Я маю пластовий однострій відповідних кольорів',
          'Я знаю де і яку інформацію про Пласт знайти',
          "Я знаю і дотримуюся Трьох Головних Обов'язків пластуна та пластунки",
          'Я поясню свою віру в Бога. Я вмію заспівати "Отче наш" та "Царю Небесний"',
          'Я знаю, що таке Пласт та можу пояснити, що він мені дає',
          'Я вмію по-пластовому привітатися',
          'Я візьму участь у щонайменше 6 сходинах свого пластового гуртка та в одній одноденній прогулянці гуртка чи куреня',
          'Я знаю, як виглядає пластова відзнака та що вона символізує',
          'Я знаю, хто є патроном Пласту та куреня',
          'Я знаю членів свого гуртка, свого впорядника та зв\'язкового. Вмію з ними швидко сконтактувати',
          'Я розумію суть вкладки та вчасно її сплачую',
          'Я приведу батьків на батьківські збори',
        ],
      },
    ],
  },
  {
    order: 2,
    name: 'Проба учасника (Скобине крило)',
    categories: [
      {
        name: "А. Три головні обов'язки",
        points: [
          "Я знаю на пам'ять і поясню Три Головні Обов'язки пластуна",
          'Я відбуваю релігійну практику свого обряду',
          'Я знаю особливості різних течій християнства для комфортного співіснування',
          'Я розумію духовні засади своєї віри в Пласті і повсякденному житті',
          'Я вивчаю культурну спадщину свого народу для національної самоідентифікації',
          'Я розумію важливість історії для становлення української нації',
          'Я знаю що таке інклюзивне суспільство і розумію його важливість',
          'Я проявляю співчуття до інших',
        ],
      },
      {
        name: 'Б. Пластова Ідея',
        points: [
          'Я знаю пластову символіку та атрибути',
          'Я вмію заспівати Пластовий Обіт під час складання Пластової Присяги',
          'Я знаю життєпис патрона Пласту для гідного його наслідування',
          'Я можу заспівати пластові гімни на пластових заходах, проявляю пошану до них',
          'Я, в загальному, знаю про історію Пласту',
          'Я знаю хто, коли і для чого заснував скаутський рух (Бейден Поуел) та Пласт (Іван Чмола, Петро Франко, Олександр Тисовський)',
        ],
      },
      {
        name: 'В. Пластова організація',
        points: [
          'Я знаю, які існують пластові відзнаки та відзначення',
          'Я знаю структуру свого гуртка та куреня',
          'Я знаю, які існують спеціалізації в Пласті',
        ],
      },
      {
        name: 'Г. Пластові заняття',
        points: [
          'Я відвідую культурні заходи для свого загального розвитку',
          'Я беру участь у мандрівках і таборах для гарту свого тіла та духу',
          'Я генерую ідеї в команді в різний спосіб',
          'Я складаю план проекту перед його втіленням',
          'Я відбуду одну одноденну та багатоденну мандрівки',
          'Я відбуду одну спеціалізовану мандрівку',
          'Я зіграю в одну теренову гру',
          'Я відбуду один курінний/окружний табір',
        ],
      },
      {
        name: 'Ґ. Життя в природі',
        points: [
          'Я візьму участь у приготуванні одного повноцінного прийому їжі для гуртка на польовій або звичайній кухні',
          'Я вмію користуватись картами та іншими засобами навігації щоб орієнтуватись на місцевості',
          'Я вмію розпалити вогонь не більше ніж з 3 сірників та вмію прибрати за собою сліди і замаскувати місце свого відпочинку на природі',
          'Я можу продемонструвати свої вміння та навички користування сокирою, пилкою, лопатою та ножем. Знаю техніку безпеки поводження з ними',
          "Я можу продемонструвати застосування 6 вузлів та 3 в'язань",
          'Я дбаю про екологію у своїй місцевості',
          'Я можу пояснити для чого я дбаю про навколишнє середовище',
          'Я розумію концепцію Zero Waste та втілюю її в повсякденному житті',
        ],
      },
      {
        name: 'Д. Життєва зарадність',
        points: [
          'Я знаю, де знайти інформацію про медичну систему та профілактику захворювань',
          'Я знаю та вмію визначати та відстоювати свої особисті кордони, поважаю кордони інших задля своєї безпеки',
          'Я знаю свої права та обов\'язки для того, щоб вміти захистити себе',
          'Я знаю та користуюсь правилами етикету у повсякденному житті',
          'Я знаю основні емоції як вони проявляються і вмію їх розпізнавати в інших',
          'Я вмію визначати і описувати свої емоції, розумію тригери які їх викликають',
          'Я аналізую свої емоції, щоб краще пізнати себе',
          'Я вмію ефективно взаємодіяти з оточуючими і заводити приятельські стосунки',
          'Я вмію осмисленого користування соцмережами і медіаресурсами',
          'Я знаю правила безпечного постингу і споживання інформації і веду безпечний спосіб життя в інтернеті',
          'Я вмію ефективно організувати свій час і простір',
          'Я ставлю перед собою цілі та досягаю їх, можу обирати цілі, які мають позитивний вплив на оточуючих',
          'Я вмію розрізнити, що веде мене до успіху, а що віддаляє',
          'Я проявляю лідерські якості для того, щоб вести свій гурток і моє оточення до кращого',
          'Я ставлюся відповідально до батьківських та своїх коштів та заощаджень',
        ],
      },
      {
        name: 'Е. Тіловиховання',
        points: [
          'Я знаю і практикую збалансоване харчування в повсякденному житті для того, щоб бути здоровим',
          'Я знаю і практикую фізичну активність, яка позитивно впливає на мій фізичний розвиток',
          'Я знаю особливості статевого розвитку хлопців і дівчат, розумію як відбувається репродукція',
          'Я розвиваю щоденні звички фізичного навантаження, щоб відповідати критеріям ВФВ. Щоденно роблю ранкову руханку',
        ],
      },
      {
        name: 'Є. Вмілості',
        points: [
          'Я здобуду вмілість Табірництво',
          'Я здобуду вмілість Перо 1',
          'Я здобуду вмілість ПМД 1',
          'Я розвиваю мінімум одну спортивну вмілість першої проби для покращення своїх фізичних можливостей',
          'Я здобуду мінімум одну спортивну вмілість першої проби',
        ],
      },
    ],
  },
  {
    order: 3,
    name: 'Проба розвідувача (Скобиний хват)',
    categories: [
      {
        name: "А. Три головні обов'язки",
        points: [
          'Я знаю та дотримуюсь 14 точок Пластового закону та можу їх пояснити',
          'Я візьму участь у трьох заходах на тему плекання національних релігійних традицій',
          'Я поширюю культурні традиції свого регіону для національної самоідентифікації',
          'Я розумію 10 заповідей Божих та засади інших релігій',
          'Я розумію роль релігії у становленні української нації',
          'Я пропагую національно-патріотичні цінності у своєму середовищі',
          'Я орієнтуюсь в сучасній культурі для власного саморозвитку',
          "Я розумію важливість роботи на благо громади для поширення сили, слави, багатства й простору Української Держави",
        ],
      },
      {
        name: 'Б. Пластова Ідея та організація',
        points: [
          "Я знаю провід свого куреня, станиці, округу та краю, їхні обов'язки та відзнаки для того щоб, розуміти зони відповідальностей та обов'язки різних членів проводу Пласту та знати до кого звернутися при потребі",
        ],
      },
      {
        name: 'В. Пластова організація',
        points: [
          'Я впроваджую в пластуванні заходи для досягнення цілей сталого розвитку',
          'Я пройду крайовий/окружний спеціалізований табір',
          'Я візьму участь у змаганнях з мандрівництва',
          'Я візьму участь у, як мінімум, двох спеціалізованих заходах',
        ],
      },
      {
        name: 'Г. Пластові заняття',
        points: [
          'Я знаю як скласти індивідуальну аптечку для міста, мандрівки, табору, їх відмінності та застосування',
          'Я знаю і можу показати та розказати про 10 дерев, 10 рослин та 10 грибів а саме: знаю лікарське значення рослин, та можу відрізнити отруйні гриби від їстівних',
          'Я знаю як дрібних так і великих тварин своєї місцевості та можу фотографувати їх сліди для того щоб знати основні характеристики тварин своєї місцевості',
          'Я вмію облаштувати місце для самостійної ночівлі, розпалити вогонь навіть в дощову погоду, а також збудувати примітивну пастку для тварини для того щоб при можливості пережити ніч в лісі, включаючи приготування їжі та сон',
          'Я розумію як будуються, розпалюються ватри та їх специфіку, можу це продемонструвати',
        ],
      },
      {
        name: 'Д. Тіловиховання',
        points: [
          'Я підготую збалансоване меню на тиждень для своєї родини і реалізую його',
          'Я дізнаюсь і поділюся здобутою інформацією про існуючі проблеми з харчування у людей',
          'Я знаю про шкідливі звички, їх наслідки так як з ними боротись',
          'Я розроблю план свого фізичного розвитку та втілю його в життя',
          'Я вмію проплисти мінімум 50 метрів, 2 різними стилями',
          'Я знаю методи контрацепції і як ними користуватись (за дозволом батьків)',
        ],
      },
      {
        name: 'Е. Вмілості',
        points: [
          'Я здобув(ла) вмілість Мандрівництво',
          'Я здобув(ла) вмілість Маскування 2',
          'Я здобув(ла) вмілість Картографія',
          'Я здобув(ла) хоча б одну спеціалізаційну вмілість, на свій вибір',
          'Я здобув(ла) мінімум одну спортивну вмілість другої проби для покращення своїх фізичних можливостей',
        ],
      },
      {
        name: 'Ґ. Життєва зарадність',
        points: [
          'Я орієнтуюся в актуальних подіях, що відбуваються в Україні та світі',
          'Я дбаю про розвиток свого креативного мислення',
          'Я вмію логічно і аргументовано доносити свою думку, базуючись на фактах і доказах, щоб досягати своєї мети та якісно презентувати себе чи свій проект',
          'Я вмію та знаю як відрізнити судження від факту',
          'Я знаю будь-яку іноземну мову (крім російської) на рівні простого спілкування',
          "Я знаю і вмію приготувати традиційні страви своєї сім'ї, щоб налагодити стосунки з сім'єю і підтримати тяглість традицій",
          'Я усвідомлюю свої уподобання в одязі та вмію доречно до ситуації підібрати вбрання щоб використовувати одяг як засіб самовираження',
          'Я можу вирішувати конфліктні ситуації для того, щоб моє середовище спілкування стало більш комфортним',
          'Я знаю що таке агресія та шляхи її подолання для того, щоб убезпечити себе та оточуючих від небажаних наслідків',
          'Я знаю що таке характер та темперамент. Для того, щоб розпізняти поведінку оточуючих',
          'Я вмію проживати щастя для покращення настрою та життя як свого, так і оточуючих',
          'Я ознайомлена з концепцією цілей сталого розвитку як соціально свідомий громадянин',
          'Я знаю що таке інклюзивний підхід та розумію його важливість для комфортного співіснування',
          'Я маю захоплення поза Пластом, щоб реалізувати свій творчий потенціал',
          'Я можу підтримати свого друга чи подругу у складних ситуаціях',
          'Я знаю різні комунікативні стилі і вмію застосовувати їх у відповідних ситуаціях',
          'Я розумію свою соціальну роль та її важливість для суспільства, щоб дотримуватися відповідних норм субординації у різних життєвих ситуаціях',
          'Я розумію як влаштована правова держава, щоб відстоювати свої права та виконувати обов\'язки',
          'Я вмію визначити свою аудиторію та налагодити з нею комунікацію щоб реалізувати свої ідеї та доносити інформацію',
          'Я здатна реалістично оцінити свої можливості та будувати відповідно до них плани для досягнення своєї мети',
          'Я знаю що мене мотивує і демотивує, щоб бути ефективним',
          'Я знаю в чому я компетентний, і в чому я хочу бути компетентним для того щоб пізнати себе',
          'Я вивчаю свій характер для розуміння себе та оточуючих',
          'Я вмію писати звернення, листи, та резюме, для реалізації власних проектів',
          'Я вмію планувати свій час та знаю інструменти які мені в цьому допоможуть',
          'Я вмію організовувати проект та аналізувати його результати',
          'Я вмію відслідковувати свої витрати та надходження для оптимізації своїх фінансів',
          'Я моніторю свій час у соц. мережах',
          'Я вмію відстоювати свою думку і робити висновки з конфліктних ситуацій',
        ],
      },
    ],
  },
];
```

- [ ] **Step 2: Write the seed script**

Create `apps/api/src/scripts/seed-real-proby-content.ts`:

```ts
import { PrismaClient, ProbyProgramVersion } from '@prisma/client';
import { REAL_PROBY_CONTENT } from './real-proby-content.data';

const prisma = new PrismaClient();

async function main() {
  const programs = await prisma.probyProgram.findMany({
    where: { version: ProbyProgramVersion.NEW },
  });
  if (programs.length !== 1) {
    throw new Error(
      `Expected exactly one ProbyProgram with version=NEW, found ${programs.length}. Aborting without changes.`,
    );
  }
  const program = programs[0];

  const progressCount = await prisma.junakProgress.count({
    where: {
      OR: [
        { point: { category: { stage: { programId: program.id } } } },
        { transferredFromPoint: { category: { stage: { programId: program.id } } } },
      ],
    },
  });
  if (progressCount > 0) {
    throw new Error(
      `Refusing to proceed: ${progressCount} JunakProgress row(s) already reference points under program ${program.id}. This program is no longer an empty placeholder — do not run this script against it.`,
    );
  }

  const mappingCount = await prisma.pointMapping.count({
    where: {
      OR: [
        { oldPoint: { category: { stage: { programId: program.id } } } },
        { newPoint: { category: { stage: { programId: program.id } } } },
      ],
    },
  });
  if (mappingCount > 0) {
    throw new Error(
      `Refusing to proceed: ${mappingCount} PointMapping row(s) already reference points under program ${program.id}.`,
    );
  }

  await prisma.probyPoint.deleteMany({ where: { category: { stage: { programId: program.id } } } });
  await prisma.probyCategory.deleteMany({ where: { stage: { programId: program.id } } });
  await prisma.probyStage.deleteMany({ where: { programId: program.id } });

  for (const stage of REAL_PROBY_CONTENT) {
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

- [ ] **Step 3: Run against the local dev database**

From `apps/api/`, export the local `DATABASE_URL` from `.env` and run the script with `ts-node`:

```bash
cd apps/api
set -a && source .env && set +a
npx ts-node src/scripts/seed-real-proby-content.ts
```

Expected output: `Seeded program <uuid> (<name>): 3 stages, 16 categories, 128 points.`

If the script throws `Expected exactly one ProbyProgram with version=NEW, found 0` — the local dev database has no NEW program yet; this is a real environment-setup gap, not something to work around in the script. Report it rather than adjusting the script's assertion.

- [ ] **Step 4: Spot-check the loaded content**

Run this quick verification query to confirm the three stage names and per-stage point counts:

```bash
cd apps/api
set -a && source .env && set +a
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.probyStage.findMany({
  where: { program: { version: 'NEW' } },
  orderBy: { order: 'asc' },
  include: { categories: { include: { points: true } } },
}).then((stages) => {
  for (const s of stages) {
    const pointCount = s.categories.reduce((sum, c) => sum + c.points.length, 0);
    console.log(\`\${s.order}. \${s.name} — \${s.categories.length} categories, \${pointCount} points\`);
  }
}).finally(() => prisma.\$disconnect());
"
```

Expected output (three lines):
```
1. Проба прихильника (Відзнака прихильника) — 1 categories, 13 points
2. Проба учасника (Скобине крило) — 8 categories, 57 points
3. Проба розвідувача (Скобиний хват) — 7 categories, 58 points
```

If any count doesn't match, the data file has an error — compare against this plan's Step 1 content directly (do not guess at a fix; the content in Step 1 is the verified source of truth).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/real-proby-content.data.ts apps/api/src/scripts/seed-real-proby-content.ts
git commit -m "feat: add real proby content and one-time seed script for NEW program"
```

---

## Виконання на продакшн-базі (не автоматично, окрема ручна дія після деплою)

Postgres на VPS не проброшений на хост — доступний лише всередині мережі docker compose. Продакшн-образ також не має `ts-node` (`npm ci --omit=dev` у фінальному стейджі Dockerfile) — але `nest build` компілює все з `apps/api/src/`, включно з `src/scripts/`, у `dist/scripts/*.js`, тож після звичайного редеплою (`git pull && docker compose up -d --build`) скомпільований скрипт вже є всередині контейнера і його можна запустити звичайним `node`, без жодних змін у Dockerfile:

```bash
cd /opt/plast-api/repo && git pull
cd /opt/plast-api && docker compose up -d --build
docker compose exec api node dist/scripts/seed-real-proby-content.js
```

Очікуваний вивід: той самий рядок `Seeded program <uuid> (<name>): 3 stages, 16 categories, 128 points.`, що й локально.

Після цього — ручна перевірка Andrii в застосунку (сторінка `/proby` як зв'язковий чи виховник реального куреня): назви трьох рівнів і кількість пунктів виглядають правильно. **Лише після цього** Andrii сам вирішує видалити локальну папку `Проби НОВІ/` — це не автоматична дія цього плану.
