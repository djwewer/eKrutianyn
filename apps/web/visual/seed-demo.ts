import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { seedKurinWithZvyazkovyi, seedProbyProgram } from '../e2e/helpers/seed';
import {
  assignVykhovnyk,
  confirmPointAs,
  createHurtok,
  createOnboardedUserAs,
  loginForToken,
} from '../e2e/helpers/proby-seed';

export type Role = 'JUNAK' | 'VYKHOVNYK' | 'ZVYAZKOVYI';

export type DemoIds = {
  users: Record<Role, { email: string; password: string; id: string }>;
  kurinId: string;
  kurinNumber: number;
  hurtokSlug: string;
  junakId: string;
  /** Optional demo extras that failed to seed (load-bearing steps throw instead). */
  skipped: string[];
};

const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';
const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ?? 'postgresql://plast:plast@localhost:5432/plast_test';

/** Run one OPTIONAL seed extra; a failure is recorded in `skipped`. Load-bearing steps must not use this. */
async function step<T>(skipped: string[], label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    skipped.push(`${label}: ${(err as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

async function api<T = unknown>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function adminPatch(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
      'x-admin-username': ADMIN_USERNAME,
      'x-admin-password': ADMIN_PASSWORD,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} -> ${res.status} ${await res.text()}`);
}

// ---- tiny solid-colour PNG (no dependencies) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Tiptap JSON helpers ----
const text = (t: string, bold = false) => ({ type: 'text', text: t, ...(bold ? { marks: [{ type: 'bold' }] } : {}) });
const para = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...content: object[]) => ({ type: 'doc', content });

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString();

export async function seedDemo(): Promise<DemoIds> {
  const skipped: string[] = [];
  const { program, points } = await seedProbyProgram(
    ['Знаю історію Пласту', 'Вмію ставити намет', 'Знаю вузли', 'Вмію розпалити вогонь', 'Орієнтуюсь за компасом', 'Надаю першу допомогу'],
  );
  const { kurin, zvyazkovyi, zvyazkovyiEmail, zvyazkovyiPassword } = await seedKurinWithZvyazkovyi(program.id);

  // Name the kurin «Чорногора»; pick a numeric kurin number (retry on collision).
  let kurinNumber = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    kurinNumber = 300 + Math.floor(Math.random() * 6000);
    try {
      await adminPatch(`/admin/kurins/${kurin.id}`, { name: 'Чорногора', kurinNumber: String(kurinNumber) });
      break;
    } catch (err) {
      if (attempt === 9) throw err;
    }
  }

  const zToken = await loginForToken(zvyazkovyiEmail, zvyazkovyiPassword);
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // ---- hurtky and people ----
  const berkuty = (await createHurtok(zToken, 'Беркути')) as { id: string; slug: string };
  const rysi = (await createHurtok(zToken, 'Рисі')) as { id: string; slug: string };

  const vykhovnyk = await createOnboardedUserAs(zToken, {
    firstName: 'Ярема', lastName: 'Олійник', email: `yarema-${tag}@example.com`, role: 'VYKHOVNYK',
  });
  await assignVykhovnyk(zToken, vykhovnyk.user.id, berkuty.id);

  const intendant = await createOnboardedUserAs(zToken, {
    firstName: 'Данило', lastName: 'Гнатюк', email: `danylo-${tag}@example.com`, role: 'JUNAK', hurtokId: berkuty.id,
  });
  await api(zToken, 'POST', '/kurin-positions', {
    userId: intendant.user.id, scope: 'KURIN', positionType: 'INTENDANT',
  });

  const extraJunaky = [
    ['Марко', 'Кравець', berkuty.id], ['Іван', 'Поліщук', rysi.id], ['Роман', 'Гуменюк', rysi.id],
  ] as const;
  const junakIds: string[] = [];
  for (const [i, [firstName, lastName, hurtokId]] of extraJunaky.entries()) {
    const u = await createOnboardedUserAs(zToken, {
      firstName, lastName, email: `junak${i + 1}-${tag}@example.com`, role: 'JUNAK', hurtokId,
    });
    junakIds.push(u.user.id);
  }

  // ---- proby: confirm 2 points for the first extra junak (in Беркути) ----
  const vToken = await loginForToken(vykhovnyk.email, vykhovnyk.password);
  for (const p of points.slice(0, 2)) await confirmPointAs(vToken, junakIds[0], p.id);

  // ---- announcements ----
  const base = `/kurins/${kurin.id}/announcements`;
  const created: { id: string }[] = [];
  created.push(
    await api<{ id: string }>(zToken, 'POST', base, {
      title: 'Осінній вишкіл на Чорногорі',
      imageIds: [],
      content: doc(
        para(text('Друзі, цієї суботи йдемо у короткий вишкіл. Що потрібно знати:')),
        { type: 'bulletList', content: ['Збір о 8:30 на вокзалі', 'Тепле вбрання і дощовик', 'Обід беремо з собою'].map((t) => ({ type: 'listItem', content: [para(text(t))] })) },
        { type: 'blockquote', content: [
          para(text('Коли:', true), text(' субота, 9:00-17:00')),
          para(text('Де:', true), text(' Підгірне, стежка до водоспаду')),
          para(text('Форма:', true), text(' польова, з хустиною')),
        ] },
      ),
    }),
  );

  const colours: [number, number, number][] = [[74, 143, 224], [47, 122, 62], [217, 82, 11]];
  const imageIds: string[] = [];
  for (const c of colours) {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(solidPng(640, 400, c))], { type: 'image/png' }), 'demo.png');
    const res = await fetch(`${API_URL}${base}/images`, { method: 'POST', headers: { Authorization: `Bearer ${zToken}` }, body: form });
    if (!res.ok) throw new Error(`image upload -> ${res.status} ${await res.text()}`);
    imageIds.push(((await res.json()) as { id: string }).id);
  }
  const img = (id: string) => ({ type: 'image', attrs: { src: `/api/backend/kurins/${kurin.id}/announcements/images/${id}` } });
  created.push(
    await api<{ id: string }>(zToken, 'POST', base, {
      title: 'Фото з літнього табору',
      imageIds,
      content: doc(para(text('Кілька кадрів з табору, дякуємо всім за участь.')), ...imageIds.map(img)),
    }),
  );
  created.push(
    await api<{ id: string }>(zToken, 'POST', base, {
      title: 'Збори в четвер',
      imageIds: [],
      content: doc(para(text('Збори гуртків цього четверга о 18:30 у пластовій домівці.'))),
    }),
  );

  // Reactions are a cosmetic extra: tolerated, reported via `skipped`.
  await step(skipped, 'reactions', async () => {
    const reactions = [[0, 'THUMBS_UP'], [0, 'HEART'], [1, 'WOW']] as const;
    const tokens = [zToken, vToken, await loginForToken(intendant.email, intendant.password)];
    for (const [i, [idx, emoji]] of reactions.entries()) {
      await api(tokens[i], 'POST', `${base}/${created[idx].id}/reactions`, { emoji });
    }
  });

  // ---- calendar ----
  const year = new Date().getFullYear();
  const events: [string, string, string, string?][] = [
    ['Збори куреня', 'Щотижневі збори', iso(5)],
    ['Вишкіл у горах', 'Триденний вишкіл', iso(20), iso(22)],
    ['Різдвяний вертеп', 'Репетиція та показ', iso(45)],
    ['Весняний табір', 'Підготовка до табору', iso(150)],
    ['Звітні збори', 'Підсумки року', `${year - 1}-10-12T15:00:00.000Z`],
    ['Новорічна ватра', 'Святкова ватра', `${year - 1}-12-28T17:00:00.000Z`],
    ['Лижний вихід', 'Прогулянка у Славську', `${year}-02-14T08:00:00.000Z`],
    ['Великодній гайвок', 'Весняні забави', `${year}-04-12T11:00:00.000Z`],
  ];
  for (const [title, description, startDate, endDate] of events) {
    await api(zToken, 'POST', `/kurins/${kurin.id}/calendar-events`, { title, description, startDate, ...(endDate ? { endDate } : {}) });
  }

  // ---- inventory (photos inserted directly: no Drive in e2e) ----
  // Photo count per item, keyed by item name (not array position).
  const items: [name: string, quantity: number, description: string, photos: number][] = [
    ['Намет «Карпати-4»', 3, 'Чотиримісний, двошаровий', 3],
    ['Тент 3×4 м', 4, 'З розтяжками', 1],
    ['Казанок 8 л', 5, 'Алюмінієвий, з кришкою', 0],
  ];
  const photoValues: string[] = [];
  let photoNo = 0;
  for (const [name, quantity, description, photos] of items) {
    const form = new FormData();
    form.append('name', name);
    form.append('quantity', String(quantity));
    form.append('description', description);
    const res = await fetch(`${API_URL}/kurins/${kurin.id}/inventory`, { method: 'POST', headers: { Authorization: `Bearer ${zToken}` }, body: form });
    if (!res.ok) throw new Error(`inventory item "${name}" -> ${res.status} ${await res.text()}`);
    const itemId = ((await res.json()) as { id: string }).id;
    for (let k = 0; k < photos; k++) {
      photoNo++;
      const fid = `demo-${((photoNo - 1) % 3) + 1}`;
      photoValues.push(`(gen_random_uuid(), '${itemId}', '${fid}', 'https://drive.google.com/thumbnail?id=${fid}&sz=w1000', now() + interval '${photoNo} seconds')`);
    }
  }
  if (!/_test(\?|$)/.test(new URL(DATABASE_URL_TEST).pathname.slice(1))) {
    throw new Error(`Refusing to write photos: database name in ${DATABASE_URL_TEST} must end with _test`);
  }
  execFileSync('psql', [
    DATABASE_URL_TEST, '-v', 'ON_ERROR_STOP=1', '-c',
    `INSERT INTO "InventoryItemPhoto" (id, "itemId", "driveFileId", url, "createdAt") VALUES ${photoValues.join(',')}`,
  ], { stdio: 'pipe' });

  // ---- treasury ----
  await api(zToken, 'PATCH', `/kurins/${kurin.id}/treasury/starting-balance`, { startingBalanceCents: 1_500_000 });
  for (const [type, amountCents, description, offset] of [
    ['INCOME', 420_000, 'Членські внески, жовтень', -20],
    ['EXPENSE', 185_000, 'Купівля тентів', -12],
    ['EXPENSE', 64_000, 'Аптечка табірна', -3],
  ] as const) {
    await api(zToken, 'POST', `/kurins/${kurin.id}/treasury/transactions`, { type, amountCents, description, occurredAt: iso(offset) });
  }

  if (skipped.length) console.warn(`[seed-demo] skipped optional items: ${skipped.join('; ')}`);

  return {
    users: {
      ZVYAZKOVYI: { email: zvyazkovyiEmail, password: zvyazkovyiPassword, id: zvyazkovyi.id },
      VYKHOVNYK: { email: vykhovnyk.email, password: vykhovnyk.password, id: vykhovnyk.user.id },
      JUNAK: { email: intendant.email, password: intendant.password, id: intendant.user.id },
    },
    kurinId: kurin.id,
    kurinNumber,
    hurtokSlug: berkuty.slug,
    junakId: junakIds[0],
    skipped,
  };
}
