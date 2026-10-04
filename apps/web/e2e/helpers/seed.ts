const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
      'x-admin-username': ADMIN_USERNAME,
      'x-admin-password': ADMIN_PASSWORD,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Admin seed request failed: ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function seedProbyProgram(pointDescriptions: string[] = ['Точка 1']) {
  const program = await adminPost<{ id: string; name: string }>('/admin/proby-programs', {
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

export async function seedKurinWithZvyazkovyi(
  probyProgramId: string,
  options?: { driveFolderId?: string; driveRefreshToken?: string; driveConnectedEmail?: string },
) {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const kurinNumber = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `zvyazkovyi-${uniqueSuffix}@example.com`;
  const password = 'password123';
  const kurin = await adminPost<{ id: string; name: string; kurinNumber: string }>('/admin/kurins', {
    name: `Курінь ${uniqueSuffix}`,
    kurinNumber,
    gender: 'MALE',
    stanytsia: 'Тестова станиця',
    probyProgramId,
    zvyazkovyi: { firstName: 'Зв\'язковий', lastName: 'Тестовий', email, password },
    ...(options?.driveFolderId ? { driveFolderId: options.driveFolderId } : {}),
    ...(options?.driveRefreshToken ? { driveRefreshToken: options.driveRefreshToken } : {}),
    ...(options?.driveConnectedEmail ? { driveConnectedEmail: options.driveConnectedEmail } : {}),
  });

  // The admin-created zvyazkovyi carries mustChangePassword:true (same as a
  // real onboarded account), which would make every other e2e spec using
  // this fixture immediately get redirected to /settings on first navigation.
  // Clear it here, the same way a real first login would, so downstream
  // specs see a normal, already-onboarded account.
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Seed login failed for ${email}: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { accessToken } = (await loginRes.json()) as { accessToken: string };
  const changePasswordRes = await fetch(`${API_URL}/users/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword: password, newPassword: password }),
  });
  if (!changePasswordRes.ok) {
    throw new Error(`Seed password-clear failed for ${email}: ${changePasswordRes.status} ${await changePasswordRes.text()}`);
  }
  const zvyazkovyiId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf-8')).sub as string;

  const zvyazkovyi = { id: zvyazkovyiId, email };
  return { kurin, zvyazkovyi, zvyazkovyiEmail: email, zvyazkovyiPassword: password };
}
