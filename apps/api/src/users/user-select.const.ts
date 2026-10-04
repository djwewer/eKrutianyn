export const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nickname: true,
  email: true,
  role: true,
  birthDate: true,
  kurinId: true,
  hurtokId: true,
  archivedAt: true,
  photoUpdatedAt: true,
  mustChangePassword: true,
} as const;

export const USER_SELECT_PUBLIC = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  photoUpdatedAt: true,
} as const;
