const API_URL = 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'dev-admin-key';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'dev-admin-password-change-me';

/** Reads the captured welcome-invite mail for `email`, sets a password through the invite link, returns the session token. */
export async function acceptInviteFor(email: string, password = 'password123'): Promise<{ accessToken: string }> {
  const mailRes = await fetch(`${API_URL}/admin/test-mail?to=${encodeURIComponent(email)}`, {
    headers: {
      'x-admin-key': ADMIN_API_KEY,
      'x-admin-username': ADMIN_USERNAME,
      'x-admin-password': ADMIN_PASSWORD,
    },
  });
  if (!mailRes.ok) {
    throw new Error(`acceptInviteFor: test-mail lookup failed for ${email}: ${mailRes.status} ${await mailRes.text()}`);
  }
  const mail = (await mailRes.json()) as { type?: string; link?: string } | null;
  if (!mail || mail.type !== 'welcome-invite' || !mail.link) {
    throw new Error(`acceptInviteFor: no welcome-invite mail for ${email} (got ${JSON.stringify(mail)?.slice(0, 200)})`);
  }
  const token = new URL(mail.link).searchParams.get('token');
  const res = await fetch(`${API_URL}/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: password }),
  });
  if (!res.ok) {
    throw new Error(`acceptInviteFor: accept-invite failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { accessToken: string };
}
