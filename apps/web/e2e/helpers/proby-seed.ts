const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';

export async function createHurtok(zvyazkovyiToken: string, name: string) {
  const res = await fetch(`${API_URL}/hurtky`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function createUserAs(zvyazkovyiToken: string, dto: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    throw new Error(`createUserAs failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function loginForToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const { accessToken } = await res.json();
  return accessToken;
}

export async function confirmPointAs(vykhovnykToken: string, junakId: string, pointId: string) {
  const res = await fetch(`${API_URL}/junaky/${junakId}/progress/${pointId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${vykhovnykToken}` },
  });
  if (!res.ok) {
    throw new Error(`confirmPointAs failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function assignVykhovnyk(zvyazkovyiToken: string, vykhovnykId: string, hurtokId: string) {
  const res = await fetch(`${API_URL}/vykhovnyk-assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zvyazkovyiToken}` },
    body: JSON.stringify({ vykhovnykId, hurtokId }),
  });
  if (!res.ok) {
    throw new Error(`assignVykhovnyk failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
