const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function seedProbyProgram(pointDescriptions: string[] = ['Точка 1']) {
  const program = await adminPost<{ id: string }>('/admin/proby-programs', {
    version: 'OLD',
    name: `Програма ${Date.now()}`,
  });
  const stage = await adminPost<{ id: string }>(`/admin/proby-programs/${program.id}/stages`, {
    order: 1,
    name: 'Ступінь 1',
  });
  const category = await adminPost<{ id: string }>(`/admin/proby-stages/${stage.id}/categories`, {
    name: 'Категорія 1',
  });
  const points = [];
  for (let i = 0; i < pointDescriptions.length; i++) {
    points.push(
      await adminPost<{ id: string }>(`/admin/proby-categories/${category.id}/points`, {
        order: i + 1,
        description: pointDescriptions[i],
      }),
    );
  }
  return { program, stage, category, points };
}

export async function seedKurinWithZvyazkovyi(probyProgramId: string) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurin = await adminPost<{ id: string }>('/admin/kurins', {
    name: `Курінь ${uniqueSuffix}`,
    kurinNumber: '1',
    gender: 'MALE',
    stanytsia: 'Тестова станиця',
    probyProgramId,
  });
  const email = `zvyazkovyi-${uniqueSuffix}@example.com`;
  const password = 'password123';
  const zvyazkovyi = await adminPost<{ id: string; email: string }>('/admin/kurins/zvyazkovyi', {
    firstName: 'Зв\'язковий',
    lastName: 'Тестовий',
    email,
    password,
    kurinId: kurin.id,
  });
  return { kurin, zvyazkovyi, zvyazkovyiEmail: email, zvyazkovyiPassword: password };
}
