export type AdminCredentials = { key: string; username: string; password: string };

export function adminHeaders(credentials: AdminCredentials): Record<string, string> {
  return {
    'x-admin-key': credentials.key,
    'x-admin-username': credentials.username,
    'x-admin-password': credentials.password,
  };
}
