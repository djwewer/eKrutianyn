export type Role = 'JUNAK' | 'VYKHOVNYK' | 'ZVYAZKOVYI';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
  kurinNumber: string;
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  role: Role;
  birthDate: string | null;
  kurinId: string;
  hurtokId: string | null;
  archivedAt: string | null;
}

export interface UserDetail extends UserSummary {
  notes: string | null;
  phone: string | null;
}

export interface Hurtok {
  id: string;
  kurinId: string;
  name: string;
  slug: string | null;
  number: string | null;
  foundedAt: string | null;
}

export type PositionScope = 'KURIN' | 'HURTOK';

export type PositionType =
  | 'KURINNYI'
  | 'SUDDIA'
  | 'PYSAR'
  | 'SKARBNYK'
  | 'INTENDANT'
  | 'KHORUNZHYI'
  | 'SMM'
  | 'HURTKOVYI';

export interface KurinPosition {
  id: string;
  scope: PositionScope;
  positionType: PositionType;
  hurtokId: string | null;
  assignedAt: string;
  user: UserSummary;
}

export interface InventoryItemPhoto {
  id: string;
  driveFileId: string;
  url: string;
}

export interface InventoryItem {
  id: string;
  kurinId: string;
  name: string;
  description: string | null;
  quantity: number;
  photos: InventoryItemPhoto[];
}

export interface GuardianContact {
  id: string;
  name: string;
  phone: string;
  role: string | null;
  email: string | null;
}

export interface ProbyPoint {
  id: string;
  order: number;
  description: string;
  categoryId: string;
}

export interface ProbyCategory {
  id: string;
  name: string;
  points: ProbyPoint[];
}

export interface ProbyStage {
  id: string;
  order: number;
  name: string;
  categories: ProbyCategory[];
}

export interface ProbyProgram {
  id: string;
  version: 'OLD' | 'NEW';
  name: string;
  stages: ProbyStage[];
}

export type ProgressStatus = 'NOT_DONE' | 'DONE';

export interface JunakProgress {
  id: string;
  junakId: string;
  pointId: string;
  status: ProgressStatus;
  confirmedById: string | null;
  confirmedAt: string | null;
  transferredFromPointId: string | null;
  point: ProbyPoint;
}

export type StageStatus = 'LOCKED' | 'OPEN' | 'CLOSED';

export interface JunakProgressResponse {
  points: JunakProgress[];
  stages: { stageId: string; status: StageStatus; hasDebt: boolean }[];
}

export interface HurtokMember extends UserSummary {
  positions: { positionType: PositionType; scope: PositionScope; hurtokId: string | null }[];
}

export interface HurtokMembers {
  hurtok: { id: string; name: string; slug: string | null; number: string | null; foundedAt: string | null; archivedAt: string | null };
  members: HurtokMember[];
}

export interface VykhovnykAssignment {
  id: string;
  vykhovnykId: string;
  hurtokId: string;
}

export type ApprovalActionType =
  | 'CHANGE_FULL_NAME'
  | 'CHANGE_BIRTH_DATE'
  | 'CHANGE_EMAIL'
  | 'CHANGE_HURTOK'
  | 'CREATE_JUNAK'
  | 'BULK_IMPORT_JUNAKY'
  | 'ARCHIVE_JUNAK';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest {
  id: string;
  initiatedById: string;
  junakId: string | null;
  actionType: ApprovalActionType;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown>;
  status: ApprovalStatus;
  approvedById: string | null;
  decidedAt: string | null;
  createdAt: string;
}

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

export interface GoogleDriveStatus {
  connected: boolean;
  email?: string;
  folderId?: string;
  folderName?: string;
}

export interface JunakImportStatus {
  connectedSpreadsheetId?: string;
  connectedSpreadsheetName?: string;
  mapping?: {
    columnMapping: { column: string; header: string; field: string }[];
    positionValueMapping: { rawValue: string; positionType: string | null }[];
  };
}

export type JunakImportField =
  | 'FIRST_LAST_NAME'
  | 'NICKNAME'
  | 'BIRTH_DATE'
  | 'HURTOK'
  | 'EMAIL'
  | 'PHONE'
  | 'DEGREE_PRYHYLNYK_DATE'
  | 'DEGREE_UCHASNYK_DATE'
  | 'DEGREE_ROZVIDUVACH_DATE'
  | 'HURTOK_POSITION'
  | 'KURIN_POSITION'
  | 'GUARDIAN_1_NAME'
  | 'GUARDIAN_1_PHONE'
  | 'GUARDIAN_1_EMAIL'
  | 'GUARDIAN_2_NAME'
  | 'GUARDIAN_2_PHONE'
  | 'GUARDIAN_2_EMAIL';

export const JUNAK_IMPORT_FIELD_LABELS: Record<JunakImportField, string> = {
  FIRST_LAST_NAME: "Ім'я та прізвище",
  NICKNAME: 'Псевдо',
  BIRTH_DATE: 'Дата народження',
  HURTOK: 'Гурток',
  EMAIL: 'Email',
  PHONE: 'Телефон',
  DEGREE_PRYHYLNYK_DATE: 'Дата здобуття ступеня "Прихильник"',
  DEGREE_UCHASNYK_DATE: 'Дата здобуття ступеня "Учасник"',
  DEGREE_ROZVIDUVACH_DATE: 'Дата здобуття ступеня "Розвідувач"',
  HURTOK_POSITION: 'Діловодство в гуртку',
  KURIN_POSITION: 'Діловодство в курені',
  GUARDIAN_1_NAME: "Контакт 1 — ім'я",
  GUARDIAN_1_PHONE: 'Контакт 1 — телефон',
  GUARDIAN_1_EMAIL: 'Контакт 1 — email',
  GUARDIAN_2_NAME: "Контакт 2 — ім'я",
  GUARDIAN_2_PHONE: 'Контакт 2 — телефон',
  GUARDIAN_2_EMAIL: 'Контакт 2 — email',
};

export interface JunakImportColumnMapping {
  column: string;
  header: string;
  field: JunakImportField;
}

export interface JunakImportPositionValueMapping {
  rawValue: string;
  positionType: string | null;
}

export interface JunakImportRowResult {
  row: number;
  junakId?: string;
  created?: boolean;
  succeededSteps: string[];
  error?: string;
}
