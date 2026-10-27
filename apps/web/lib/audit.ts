export type AuditGroup = 'PROBY' | 'PEOPLE' | 'MONEY' | 'SETTINGS';

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
  PROBY: 'Проба',
  PEOPLE: 'Люди та ролі',
  MONEY: 'Гроші та майно',
  SETTINGS: 'Налаштування',
};

export interface AuditLogItem {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string } | null;
  subjectUserId: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor: string | null;
}

// Nominative names inside «…» avoid case-ending mistakes.
const POSITION_LABELS: Record<string, string> = {
  KURINNYI: 'курінний',
  SUDDIA: 'суддя',
  PYSAR: 'писар',
  SKARBNYK: 'скарбник',
  INTENDANT: 'інтендант',
  KHORUNZHYI: 'хорунжий',
  SMM: 'СММ',
  HURTKOVYI: 'гуртковий',
};

const DEGREE_LABELS: Record<string, string> = {
  PRYHYLNYK: 'Прихильник',
  UCHASNYK: 'Учасник',
  ROZVIDUVACH: 'Розвідувач',
  SKOB: 'Скоб',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  CHANGE_FULL_NAME: 'Зміна ПІБ',
  CHANGE_BIRTH_DATE: 'Зміна дати народження',
  CHANGE_EMAIL: 'Зміна електронної пошти',
  CHANGE_HURTOK: 'Зміна гуртка',
  CREATE_JUNAK: 'Створення юнака',
  BULK_IMPORT_JUNAKY: 'Масовий імпорт юнаків',
  ARCHIVE_JUNAK: 'Архівація юнака',
};

const PROGRAM_LABELS: Record<string, string> = { OLD: 'стара', NEW: 'нова' };

function s(details: Record<string, unknown> | null, key: string): string {
  const value = details && typeof details === 'object' ? details[key] : undefined;
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? '—' : String(value);
}

function lookup(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

function money(cents: unknown): string {
  const n = Number(cents);
  if (cents === null || cents === undefined || !Number.isFinite(n)) return '— грн';
  return `${(n / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн`;
}

function positionSuffix(d: Record<string, unknown> | null): string {
  const hurtok = s(d, 'hurtokName');
  return hurtok === '—' ? '' : ` (гурток «${hurtok}»)`;
}

function describeDecision(verb: string, d: Record<string, unknown> | null): string {
  const type = s(d, 'requestType');
  const label = type === '—' ? null : REQUEST_TYPE_LABELS[type];
  if (!label) return `${verb} запит на затвердження`;
  const subject = s(d, 'subjectName');
  const forPart = subject === '—' ? '' : ` для ${subject}`;
  const counts =
    type === 'BULK_IMPORT_JUNAKY' && d?.rows != null ? ` (рядків: ${s(d, 'rows')}, помилок: ${s(d, 'failed')})` : '';
  return `${verb} запит «${label}»${forPart}${counts}`;
}

/** One place that turns a stored event into a sentence; unknown actions and odd details degrade gracefully. */
export function describeAuditEvent(item: AuditLogItem): string {
  const d = item.details && typeof item.details === 'object' ? item.details : null;
  const txKind = s(d, 'type') === 'INCOME' ? 'прибуток' : 'витрату';
  switch (item.action) {
    case 'PROBY_POINT_CONFIRMED':
      return `Підтвердив точку «${s(d, 'pointTitle')}» для ${s(d, 'subjectName')}`;
    case 'PROBY_POINT_UNCONFIRMED':
      return `Скасував підтвердження точки «${s(d, 'pointTitle')}» для ${s(d, 'subjectName')}`;
    case 'PROBY_STAGE_CLOSED':
      return `Закрив пробу «${s(d, 'stageName')}» для ${s(d, 'subjectName')}`;
    case 'PROBY_STAGE_REOPENED':
      return `Перевідкрив пробу «${s(d, 'stageName')}» для ${s(d, 'subjectName')}`;
    case 'DEGREE_DATE_CHANGED':
      return `Змінив дату ступеня «${lookup(DEGREE_LABELS, s(d, 'degree'))}» для ${s(d, 'subjectName')} на ${s(d, 'date')}`;
    case 'KURIN_PROBY_PROGRAM_CHANGED':
      return `Змінив програму проби куреня: ${lookup(PROGRAM_LABELS, s(d, 'from'))} → ${lookup(PROGRAM_LABELS, s(d, 'to'))} (перенесено точок: ${s(d, 'transferredPoints')})`;
    case 'USER_CREATED':
      return `Створив користувача ${s(d, 'subjectName')}`;
    case 'USER_ARCHIVED':
      return `Архівував ${s(d, 'subjectName')}`;
    case 'USER_CONTACT_UPDATED':
      return `Змінив контактні дані ${s(d, 'subjectName')}`;
    case 'USER_HURTOK_CHANGED':
      return `Змінив гурток ${s(d, 'subjectName')}: «${s(d, 'from')}» → «${s(d, 'to')}»`;
    case 'POSITION_ASSIGNED':
      return `Призначив ${s(d, 'subjectName')} на посаду «${lookup(POSITION_LABELS, s(d, 'positionType'))}»${positionSuffix(d)}`;
    case 'POSITION_REMOVED':
      return `Зняв ${s(d, 'subjectName')} з посади «${lookup(POSITION_LABELS, s(d, 'positionType'))}»${positionSuffix(d)}`;
    case 'HURTOK_CREATED':
      return `Створив гурток «${s(d, 'hurtokName')}»`;
    case 'HURTOK_UPDATED':
      return `Змінив гурток «${s(d, 'hurtokName')}»`;
    case 'HURTOK_ARCHIVED':
      return `Архівував гурток «${s(d, 'hurtokName')}»`;
    case 'VYKHOVNYK_ASSIGNED':
      return `Прикріпив виховника ${s(d, 'subjectName')} до гуртка «${s(d, 'hurtokName')}»`;
    case 'VYKHOVNYK_UNASSIGNED':
      return `Відкріпив виховника ${s(d, 'subjectName')} від гуртка «${s(d, 'hurtokName')}»`;
    case 'GUARDIAN_CREATED':
      return `Додав контакт опікуна ${s(d, 'guardianName')} для ${s(d, 'subjectName')}`;
    case 'GUARDIAN_UPDATED':
      return `Змінив контакт опікуна ${s(d, 'guardianName')} для ${s(d, 'subjectName')}`;
    case 'GUARDIAN_DELETED':
      return `Видалив контакт опікуна ${s(d, 'guardianName')} для ${s(d, 'subjectName')}`;
    case 'APPROVAL_APPROVED':
      return describeDecision('Схвалив', d);
    case 'APPROVAL_REJECTED':
      return describeDecision('Відхилив', d);
    case 'TREASURY_TRANSACTION_CREATED':
      return `Додав у Скарбницю ${txKind} ${money(d?.amountCents)}: ${s(d, 'description')}`;
    case 'TREASURY_TRANSACTION_DELETED':
      return `Видалив зі Скарбниці ${txKind} ${money(d?.amountCents)}: ${s(d, 'description')}`;
    case 'TREASURY_STARTING_BALANCE_CHANGED':
      return `Змінив початковий баланс Скарбниці: ${money(d?.from)} → ${money(d?.to)}`;
    case 'INVENTORY_ITEM_CREATED':
      return d?.quantity != null
        ? `Додав у реманент «${s(d, 'itemName')}» (кількість: ${s(d, 'quantity')})`
        : `Додав у реманент «${s(d, 'itemName')}»`;
    case 'INVENTORY_ITEM_UPDATED':
      return `Змінив річ у реманенті «${s(d, 'itemName')}»`;
    case 'INVENTORY_ITEM_DELETED':
      return `Видалив з реманенту «${s(d, 'itemName')}»`;
    case 'INVENTORY_PHOTO_ADDED':
      return `Додав фото до речі «${s(d, 'itemName')}»`;
    case 'INVENTORY_PHOTO_REMOVED':
      return `Видалив фото з речі «${s(d, 'itemName')}»`;
    case 'DRIVE_CONNECTED':
      return `Підключив Google Drive (${s(d, 'email')})`;
    case 'DRIVE_DISCONNECTED':
      return 'Відключив Google Drive';
    case 'DRIVE_FOLDER_SET':
      return `Обрав головну папку куреня: «${s(d, 'folderName')}»`;
    case 'JUDGE_BOOK_CONNECTED':
      return `Підключив Книгу судді: «${s(d, 'spreadsheetName')}»`;
    case 'JUDGE_BOOK_IMPORTED':
      return `Імпортував юнаків з Книги судді (рядків: ${s(d, 'rows')}, з помилками: ${s(d, 'failed')})`;
    case 'JUDGE_BOOK_SYNCED':
      return `Записав дані в Книгу судді вручну (оновлено комірок: ${s(d, 'updated')}, пропущено: ${s(d, 'skipped')})`;
    case 'JUDGE_BOOK_SYNCED_NIGHTLY':
      return `Нічна синхронізація з Книгою судді (оновлено комірок: ${s(d, 'updated')}, пропущено: ${s(d, 'skipped')})`;
    case 'APD_CREATED':
      return `Створив АПД «${s(d, 'title')}» (псевдо: ${s(d, 'pseudoCount')})`;
    case 'ANNOUNCEMENT_PUBLISHED':
      return `Опублікував оголошення «${s(d, 'title')}»`;
    case 'ANNOUNCEMENT_UPDATED':
      return `Змінив оголошення «${s(d, 'title')}»`;
    case 'ANNOUNCEMENT_DELETED':
      return `Видалив оголошення «${s(d, 'title')}»`;
    default:
      return `Подія: ${item.action}`;
  }
}
