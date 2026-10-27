export function personLabel(u: { firstName: string; lastName: string; nickname?: string | null }): string {
  return u.nickname?.trim() || `${u.firstName} ${u.lastName}`;
}
