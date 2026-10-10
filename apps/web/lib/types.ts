export type Role = 'JUNAK' | 'VYKHOVNYK' | 'ZVYAZKOVYI';

export interface CurrentUserPayload {
  userId: string;
  role: Role;
  kurinId: string;
  isKurinniy: boolean;
  positions: PositionType[];
  kurinNumber: string | null;
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
  photoUpdatedAt: string | null;
  mustChangePassword: boolean;
}

export interface UserDetail extends UserSummary {
  notes: string | null;
  phone: string | null;
  residence: string | null;
  studyPlace: string | null;
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

export interface TreasuryTransaction {
  id: string;
  kurinId: string;
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  description: string;
  occurredAt: string;
  createdAt: string;
}

export interface TreasurySummary {
  startingBalanceCents: number;
  currentBalanceCents: number;
  transactions: TreasuryTransaction[];
}

export interface JunakActivityEntry {
  id: string;
  title: string;
  occurredAt: string;
  role: 'PARTICIPANT' | 'PROVID';
  description: string | null;
  createdAt: string;
}

export interface KurinCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
}

export type GuardianRelation = 'MOTHER' | 'FATHER' | 'GUARDIAN';

export interface GuardianContact {
  id: string;
  name: string;
  phone: string;
  relation: GuardianRelation;
  /** Free-text clarification, only meaningful for relation GUARDIAN ("бабуся"). */
  role: string | null;
  email: string | null;
}

export type DegreeKey = 'PRYHYLNYK' | 'UCHASNYK' | 'ROZVIDUVACH' | 'SKOB';

export interface JunakDegrees {
  /** YYYY-MM-DD per degree, null when not earned yet. */
  dates: Record<DegreeKey, string | null>;
  current: DegreeKey | null;
  currentLabel: string | null;
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

export type AiMessageRole = 'USER' | 'ASSISTANT';

export interface AiMessage {
  role: AiMessageRole;
  content: string;
  probyPointId: string | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string | null;
  probyPointId: string | null;
  messages: AiMessage[];
}

export interface AiConversationSummary {
  id: string;
  title: string | null;
  probyPointId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendAiMessageResponse {
  reply: string;
  messages: AiMessage[];
}

export interface AdminProbyPoint {
  id: string;
  order: number;
  description: string;
  referenceText: string | null;
}

export interface AdminProbyCategory {
  id: string;
  name: string;
  points: AdminProbyPoint[];
}

export interface AdminProbyStage {
  id: string;
  order: number;
  name: string;
  categories: AdminProbyCategory[];
}

export interface AdminProbyProgram {
  id: string;
  version: 'OLD' | 'NEW';
  name: string;
  stages: AdminProbyStage[];
}

export interface AdminKurin {
  id: string;
  name: string;
  kurinNumber: string | null;
  gender: 'MALE' | 'FEMALE';
  stanytsia: string;
  probyProgramId: string;
  createdAt: string;
  userCount: number;
  hurtokCount: number;
}

export interface AdminReferenceSource {
  id: string;
  url: string;
  label: string;
  probyPointId: string | null;
  probyPoint: { id: string; description: string } | null;
  extractedText: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
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
  /** Only present on BULK_IMPORT_JUNAKY: `matchedUserId` -> that junak's current data, resolved server-side. */
  matchedJunaky?: Record<string, MatchedJunakSummary>;
}

export interface MatchedJunakSummary {
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  residence: string | null;
  studyPlace: string | null;
  skobDate: string | null;
  birthDate: string | null;
  hurtokName: string | null;
  kurinPositionTypes: PositionType[];
  hurtokPositionTypes: PositionType[];
}

/** One row of a BULK_IMPORT_JUNAKY request's `newData.rows`, as built by the import wizard. */
export interface BulkImportRow {
  rowIndex: number;
  matchedUserId?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  birthDate?: string;
  email: string;
  phone?: string;
  hurtokName?: string;
  kurinPositionTypes?: PositionType[];
  hurtokPositionTypes?: PositionType[];
  residence?: string;
  studyPlace?: string;
  skobDate?: string;
  guardians?: { name: string; phone?: string; email?: string; relation?: GuardianRelation }[];
  degreeDates?: { PRYHYLNYK?: string; UCHASNYK?: string; ROZVIDUVACH?: string };
}

export interface Kurin {
  id: string;
  name: string;
  kurinNumber: string | null;
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
  | 'DEGREE_SKOB_DATE'
  | 'CURRENT_DEGREE'
  | 'RESIDENCE'
  | 'STUDY_PLACE'
  | 'FATHER_NAME'
  | 'FATHER_PHONE'
  | 'FATHER_EMAIL'
  | 'MOTHER_NAME'
  | 'MOTHER_PHONE'
  | 'MOTHER_EMAIL'
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
  DEGREE_SKOB_DATE: 'Дата здобуття ступеня "Скоб"',
  CURRENT_DEGREE: 'Поточний ступінь (записується з застосунку)',
  RESIDENCE: 'Місце проживання',
  STUDY_PLACE: 'Місце навчання',
  FATHER_NAME: "Тато — ім'я",
  FATHER_PHONE: 'Тато — телефон',
  FATHER_EMAIL: 'Тато — email',
  MOTHER_NAME: "Мама — ім'я",
  MOTHER_PHONE: 'Мама — телефон',
  MOTHER_EMAIL: 'Мама — email',
  HURTOK_POSITION: 'Діловодство в гуртку',
  KURIN_POSITION: 'Діловодство в курені',
  GUARDIAN_1_NAME: "Опікун 1 — ім'я",
  GUARDIAN_1_PHONE: 'Опікун 1 — телефон',
  GUARDIAN_1_EMAIL: 'Опікун 1 — email',
  GUARDIAN_2_NAME: "Опікун 2 — ім'я",
  GUARDIAN_2_PHONE: 'Опікун 2 — телефон',
  GUARDIAN_2_EMAIL: 'Опікун 2 — email',
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

export interface JudgeBookSyncReport {
  linkedJunaky: number;
  syncedJunaky: number;
  updatedCells: number;
  unlinkedJunaky: number;
  skipped: { junakName: string; row: number; reason: string }[];
}

export interface JunakImportRowResult {
  row: number;
  junakId?: string;
  created?: boolean;
  succeededSteps: string[];
  error?: string;
}

export type ReactionEmoji = 'THUMBS_UP' | 'HEART' | 'CLAP' | 'WOW' | 'LAUGH' | 'SAD';

export interface Announcement {
  id: string;
  kurinId: string;
  title: string;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author: { id: string; firstName: string; lastName: string; nickname: string | null; photoUpdatedAt: string | null };
  images: { id: string }[];
  reactions: { userId: string; emoji: ReactionEmoji }[];
}
