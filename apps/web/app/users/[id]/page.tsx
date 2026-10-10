'use client';

import { use, useState, useEffect } from 'react';
import { useUser, useUpdateContactInfo, useUpdateHurtok, useArchiveUser } from '@/lib/queries/users';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import {
  useGuardianContacts,
  useAddGuardianContact,
  useUpdateGuardianContact,
  useRemoveGuardianContact,
} from '@/lib/queries/guardian-contacts';
import {
  useProbyProgram,
  useJunakProgress,
  useConfirmPoint,
  useUnconfirmPoint,
  useCloseStage,
  useReopenStage,
} from '@/lib/queries/proby';
import type { GuardianContact, GuardianRelation, ProbyCategory, UserDetail, CurrentUserPayload } from '@/lib/types';
import { JunakDegreesCard } from '@/components/junak-degrees-card';
import { ROLE_LABELS } from '@/lib/role-labels';
import { accessErrorMessage } from '@/lib/error-message';
import { ApiError } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const RELATION_LABELS: Record<GuardianRelation, string> = {
  MOTHER: 'Мама',
  FATHER: 'Тато',
  GUARDIAN: 'Опікун',
};

function GuardianRelationSelect({
  value,
  onChange,
  taken = [],
  id,
}: {
  value: GuardianRelation;
  onChange: (relation: GuardianRelation) => void;
  /** Relations already used by another contact (mother/father can each be used once). */
  taken?: GuardianRelation[];
  id?: string;
}) {
  return (
    <select
      id={id}
      aria-label="Хто це"
      value={value}
      onChange={(e) => onChange(e.target.value as GuardianRelation)}
      className="w-full rounded-md border px-3 py-2 text-sm"
    >
      {(Object.keys(RELATION_LABELS) as GuardianRelation[]).map((relation) => (
        <option key={relation} value={relation} disabled={relation !== value && taken.includes(relation)}>
          {RELATION_LABELS[relation]}
        </option>
      ))}
    </select>
  );
}

function guardianErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status !== 403) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) return message;
  }
  return accessErrorMessage(error) ?? 'Не вдалося зберегти контакт.';
}

function GuardianContactRow({
  contact,
  junakId,
  takenByOthers,
}: {
  contact: GuardianContact;
  junakId: string;
  takenByOthers: GuardianRelation[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [relation, setRelation] = useState<GuardianRelation>(contact.relation);
  const [role, setRole] = useState(contact.role ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const update = useUpdateGuardianContact(junakId);
  const remove = useRemoveGuardianContact(junakId);

  if (isEditing) {
    return (
      <div className="space-y-2 border-b py-2 last:border-b-0">
        <GuardianRelationSelect value={relation} onChange={setRelation} taken={takenByOthers} />
        {relation === 'GUARDIAN' && (
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Хто саме (бабуся, тітка...)" />
        )}
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!name || update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: contact.id,
                  name,
                  phone,
                  relation,
                  role: relation === 'GUARDIAN' ? role || null : null,
                  email: email || null,
                },
                { onSuccess: () => setIsEditing(false) },
              )
            }
          >
            Зберегти
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
            Скасувати
          </Button>
        </div>
        {update.isError && <p className="text-sm text-destructive">{guardianErrorText(update.error)}</p>}
      </div>
    );
  }

  const contactLine = [contact.phone, contact.email].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-b-0" data-testid="guardian-row">
      <div>
        <p className="font-medium">
          {RELATION_LABELS[contact.relation]}
          {contact.relation === 'GUARDIAN' && contact.role && ` (${contact.role})`}: {contact.name}
        </p>
        <p className="text-muted-foreground">{contactLine || 'Телефон і email ще не вказані'}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
          Редагувати
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => remove.mutate(contact.id)}
          disabled={remove.isPending}
        >
          Видалити
        </Button>
      </div>
    </div>
  );
}

function AddGuardianContactForm({ junakId, existing }: { junakId: string; existing: GuardianContact[] }) {
  const takenRelations = existing
    .map((c) => c.relation)
    .filter((relation): relation is GuardianRelation => relation === 'MOTHER' || relation === 'FATHER');
  // The usual case is mother, then father — preselect whichever is still missing.
  const suggested: GuardianRelation = !takenRelations.includes('MOTHER')
    ? 'MOTHER'
    : !takenRelations.includes('FATHER')
      ? 'FATHER'
      : 'GUARDIAN';
  const [relation, setRelation] = useState<GuardianRelation | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const add = useAddGuardianContact(junakId);
  const effectiveRelation = relation ?? suggested;

  return (
    <div className="space-y-2 pt-2">
      <GuardianRelationSelect value={effectiveRelation} onChange={setRelation} taken={takenRelations} />
      {effectiveRelation === 'GUARDIAN' && (
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Хто саме (бабуся, тітка...)" />
      )}
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон (можна додати пізніше)" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (можна додати пізніше)" />
      <Button
        size="sm"
        disabled={!name || add.isPending}
        onClick={() =>
          add.mutate(
            {
              name,
              phone: phone || undefined,
              relation: effectiveRelation,
              role: effectiveRelation === 'GUARDIAN' ? role || undefined : undefined,
              email: email || undefined,
            },
            {
              onSuccess: () => {
                setName('');
                setPhone('');
                setRole('');
                setEmail('');
                setRelation(null);
              },
            },
          )
        }
      >
        Додати контакт
      </Button>
      {add.isError && <p className="text-sm text-destructive">{guardianErrorText(add.error)}</p>}
    </div>
  );
}

/** "Закрити пробу" with the date the degree was actually earned (defaults to today). */
function CloseStageControl({ onClose, disabled }: { onClose: (date: string) => void; disabled: boolean }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label="Дата здобуття ступеня"
        value={date}
        max={todayIso}
        onChange={(e) => setDate(e.target.value)}
        className="w-40"
      />
      <Button size="sm" variant="outline" disabled={disabled || !date} onClick={() => onClose(date)}>
        Закрити пробу
      </Button>
    </div>
  );
}

function ProbyCategorySection({
  category,
  doneByPointId,
  canConfirm,
  onConfirm,
  onUnconfirm,
}: {
  category: ProbyCategory;
  doneByPointId: Set<string>;
  canConfirm: boolean;
  onConfirm: (pointId: string) => void;
  onUnconfirm: (pointId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const doneCount = category.points.filter((p) => doneByPointId.has(p.id)).length;

  return (
    <div className="border-b py-2 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between text-left font-semibold"
      >
        <span>
          {category.name} ({doneCount}/{category.points.length})
        </span>
        <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <ul className="mt-2 space-y-1 pl-4">
          {category.points
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((point) => {
              const done = doneByPointId.has(point.id);
              return (
                <li key={point.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span aria-hidden>{done ? '✅' : '⬜'}</span> {point.description}
                  </span>
                  {canConfirm &&
                    (done ? (
                      <Button variant="outline" size="sm" onClick={() => onUnconfirm(point.id)}>
                        Зняти
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => onConfirm(point.id)}>
                        Підтвердити
                      </Button>
                    ))}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

function ArchiveUserCard({
  user,
  session,
}: {
  user: UserDetail;
  session: CurrentUserPayload | null | undefined;
}) {
  const archiveUser = useArchiveUser(user.id);
  const createRequest = useCreateApprovalRequest();
  const [requestSent, setRequestSent] = useState(false);

  if (user.archivedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Архівація</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Архівовано {new Date(user.archivedAt).toLocaleDateString('uk-UA')}
        </CardContent>
      </Card>
    );
  }

  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI' && user.role !== 'ZVYAZKOVYI';
  const canRequestArchive =
    user.role === 'JUNAK' && (session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA'));
  if (!isZvyazkovyi && !canRequestArchive) {
    return null;
  }

  if (user.role === 'JUNAK' && user.hurtokId !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Архівація</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Щоб архівувати юнака, спершу зніміть його з гуртка та посад.
        </CardContent>
      </Card>
    );
  }

  if (requestSent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Архівація</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Запит на архівацію надіслано, очікує затвердження зв&apos;язковим.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Архівація</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          disabled={archiveUser.isPending || createRequest.isPending}
          onClick={() => {
            if (
              !window.confirm(
                `Архівувати юнака ${user.firstName} ${user.lastName}? Він втратить доступ до входу. Перш ніж архівувати, спершу зніміть юнака з гуртка та всіх посад.`,
              )
            ) {
              return;
            }
            if (isZvyazkovyi) {
              archiveUser.mutate();
            } else {
              createRequest.mutate(
                { actionType: 'ARCHIVE_JUNAK', junakId: user.id, newData: {} },
                { onSuccess: () => setRequestSent(true) },
              );
            }
          }}
        >
          Архівувати
        </Button>
        {archiveUser.isError && (
          <p className="text-sm text-destructive">
            {accessErrorMessage(archiveUser.error) ?? 'Не вдалося архівувати.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: user, isLoading } = useUser(id);
  const { data: session } = useSession();
  const updateContactInfo = useUpdateContactInfo(id);
  const createRequest = useCreateApprovalRequest();
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [residence, setResidence] = useState('');
  const [studyPlace, setStudyPlace] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [nameRequestSent, setNameRequestSent] = useState(false);
  const [hurtokRequestSent, setHurtokRequestSent] = useState(false);

  // Whoever keeps the Книга судді: zvyazkovyi, kurinniy and the kurin's суддя.
  const canEditContactInfo =
    (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA')) &&
    user?.role === 'JUNAK' &&
    !user?.archivedAt;
  const {
    data: guardianContacts,
    isError,
    error,
  } = useGuardianContacts(id, { enabled: !!canEditContactInfo });

  const isJunak = user?.role === 'JUNAK';
  const { data: probyProgram } = useProbyProgram();
  const {
    data: junakProgress,
    isError: isJunakProgressError,
    error: junakProgressError,
  } = useJunakProgress(isJunak ? id : undefined);
  const confirmPoint = useConfirmPoint(id);
  const unconfirmPoint = useUnconfirmPoint(id);
  const closeStage = useCloseStage(id);
  const reopenStage = useReopenStage(id);
  const canConfirmProby = session?.role === 'VYKHOVNYK' || session?.role === 'ZVYAZKOVYI';

  const canDirectlyMoveHurtok = session?.role === 'ZVYAZKOVYI' && isJunak && !user?.archivedAt;
  const canRequestMoveHurtok =
    isJunak && !user?.archivedAt && (session?.isKurinniy || (session?.positions ?? []).includes('SUDDIA'));
  const canMoveHurtok = canDirectlyMoveHurtok || canRequestMoveHurtok;
  const { data: hurtky } = useHurtky();
  const updateHurtok = useUpdateHurtok(id);
  const [selectedHurtokId, setSelectedHurtokId] = useState('');

  useEffect(() => {
    setSelectedHurtokId(user?.hurtokId ?? '');
  }, [user?.hurtokId]);

  useEffect(() => {
    if (user) {
      setNotes(user.notes ?? '');
      setPhone(user.phone ?? '');
      setResidence(user.residence ?? '');
      setStudyPlace(user.studyPlace ?? '');
    }
  }, [user]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!user) return <p>Не знайдено.</p>;

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">
        {user.lastName} {user.firstName}
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Дані</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Email: {user.email}</p>
          <p>Роль: {ROLE_LABELS[user.role]}</p>
          {user.birthDate && <p>Дата народження: {new Date(user.birthDate).toLocaleDateString('uk-UA')}</p>}
          {isJunak && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="hurtok">Гурток</Label>
              {canMoveHurtok ? (
                hurtokRequestSent ? (
                  <p className="text-sm text-muted-foreground">
                    Запит на переведення надіслано, очікує затвердження зв&apos;язковим.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      id="hurtok"
                      value={selectedHurtokId}
                      onChange={(e) => setSelectedHurtokId(e.target.value)}
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                    >
                      <option value="">Без гуртка</option>
                      {(hurtky ?? []).map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={selectedHurtokId === (user.hurtokId ?? '') || updateHurtok.isPending || createRequest.isPending}
                      onClick={async () => {
                        if (canDirectlyMoveHurtok) {
                          updateHurtok.mutate(selectedHurtokId || null);
                          return;
                        }
                        try {
                          await createRequest.mutateAsync({
                            actionType: 'CHANGE_HURTOK',
                            junakId: user.id,
                            newData: { hurtokId: selectedHurtokId || null },
                          });
                          setHurtokRequestSent(true);
                        } catch {
                          /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                        }
                      }}
                    >
                      Перевести
                    </Button>
                  </div>
                )
              ) : (
                <p>{hurtky?.find((h) => h.id === user.hurtokId)?.name ?? 'Без гуртка'}</p>
              )}
              {updateHurtok.isError && (
                <p className="text-sm text-destructive">
                  {accessErrorMessage(updateHurtok.error) ?? 'Не вдалося перевести юнака.'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Контакти</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="residence">Місце проживання</Label>
            <Input
              id="residence"
              value={residence}
              onChange={(e) => setResidence(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="studyPlace">Місце навчання</Label>
            <Input
              id="studyPlace"
              value={studyPlace}
              onChange={(e) => setStudyPlace(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Нотатки</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          {canEditContactInfo && (
            <Button onClick={() => updateContactInfo.mutate({ notes, phone, residence, studyPlace })}>
              Зберегти
            </Button>
          )}
        </CardContent>
      </Card>
      {canEditContactInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Батьки та опікуни</CardTitle>
          </CardHeader>
          <CardContent>
            {isError && (
              <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження опікунів.'}</p>
            )}
            {(guardianContacts ?? []).map((contact) => (
              <GuardianContactRow
                key={contact.id}
                contact={contact}
                junakId={id}
                takenByOthers={(guardianContacts ?? [])
                  .filter((other) => other.id !== contact.id)
                  .map((other) => other.relation)}
              />
            ))}
            <AddGuardianContactForm junakId={id} existing={guardianContacts ?? []} />
          </CardContent>
        </Card>
      )}
      {isJunak && !user.archivedAt && (
        <JunakDegreesCard
          junakId={id}
          canEdit={!!canEditContactInfo || session?.role === 'VYKHOVNYK'}
        />
      )}
      {isJunak && probyProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Проба</CardTitle>
          </CardHeader>
          <CardContent>
            {isJunakProgressError && (
              <p className="text-sm text-destructive">
                {accessErrorMessage(junakProgressError) ?? 'Помилка завантаження проби.'}
              </p>
            )}
            {!isJunakProgressError &&
              (() => {
                const doneByPointId = new Set(
                  (junakProgress?.points ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
                );
                const statusByStageId = new Map(
                  (junakProgress?.stages ?? []).map((s) => [s.stageId, s.status]),
                );
                const hasDebtByStageId = new Map(
                  (junakProgress?.stages ?? []).map((s) => [s.stageId, s.hasDebt]),
                );
                return probyProgram.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => {
                    const status = statusByStageId.get(stage.id);
                    const hasDebt = hasDebtByStageId.get(stage.id) ?? false;
                    if (status === 'LOCKED' || status === undefined) {
                      return (
                        <div key={stage.id} className="mb-4 last:mb-0 opacity-50">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground">
                            🔒 {stage.name}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Розблокується після закриття попередньої проби
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div key={stage.id} className="mb-4 last:mb-0">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground">{stage.name}</h3>
                          {canConfirmProby &&
                            (status === 'CLOSED' ? (
                              <Button size="sm" variant="outline" onClick={() => reopenStage.mutate(stage.id)}>
                                🔓 Перевідкрити пробу
                              </Button>
                            ) : hasDebt ? (
                              <span className="text-xs text-muted-foreground">
                                Закрито (є непідтверджені точки)
                              </span>
                            ) : (
                              <CloseStageControl
                                disabled={closeStage.isPending}
                                onClose={(date) => closeStage.mutate({ stageId: stage.id, date })}
                              />
                            ))}
                        </div>
                        {stage.categories.map((category) => (
                          <ProbyCategorySection
                            key={category.id}
                            category={category}
                            doneByPointId={doneByPointId}
                            canConfirm={canConfirmProby && status !== 'CLOSED'}
                            onConfirm={(pointId) => confirmPoint.mutate(pointId)}
                            onUnconfirm={(pointId) => unconfirmPoint.mutate(pointId)}
                          />
                        ))}
                      </div>
                    );
                  });
              })()}
          </CardContent>
        </Card>
      )}
      {session?.isKurinniy && user.role === 'JUNAK' && !user.archivedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Змінити ПІБ (потребує затвердження)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nameRequestSent ? (
              <p>Запит надіслано, очікує затвердження зв&apos;язковим.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="newFirstName">Нове ім&apos;я</Label>
                  <Input
                    id="newFirstName"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder={user.firstName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newLastName">Нове прізвище</Label>
                  <Input
                    id="newLastName"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder={user.lastName}
                  />
                </div>
                <Button
                  onClick={async () => {
                    try {
                      await createRequest.mutateAsync({
                        actionType: 'CHANGE_FULL_NAME',
                        junakId: user.id,
                        newData: {
                          firstName: newFirstName || user.firstName,
                          lastName: newLastName || user.lastName,
                        },
                      });
                      setNameRequestSent(true);
                    } catch {
                      /* handled by MutationCache.onError for 401; other errors just stop-and-not-navigate */
                    }
                  }}
                >
                  Надіслати запит
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <ArchiveUserCard user={user} session={session} />
    </div>
  );
}
