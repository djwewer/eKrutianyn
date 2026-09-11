'use client';

import { use, useState, useEffect } from 'react';
import { useUser, useUpdateContactInfo, useUpdateHurtok } from '@/lib/queries/users';
import { useHurtky } from '@/lib/queries/hurtky';
import { useSession } from '@/lib/session-client';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import {
  useGuardianContacts,
  useAddGuardianContact,
  useUpdateGuardianContact,
  useRemoveGuardianContact,
} from '@/lib/queries/guardian-contacts';
import { useProbyProgram, useJunakProgress, useConfirmPoint, useUnconfirmPoint } from '@/lib/queries/proby';
import type { GuardianContact, ProbyCategory } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/role-labels';
import { accessErrorMessage } from '@/lib/error-message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function GuardianContactRow({
  contact,
  junakId,
}: {
  contact: GuardianContact;
  junakId: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  const [role, setRole] = useState(contact.role ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const update = useUpdateGuardianContact(junakId);
  const remove = useRemoveGuardianContact(junakId);

  if (isEditing) {
    return (
      <div className="space-y-2 border-b py-2 last:border-b-0">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Роль (мама, тато...)" />
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!name || !phone || update.isPending}
            onClick={() =>
              update.mutate(
                { id: contact.id, name, phone, role: role || null, email: email || null },
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
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-b-0">
      <div>
        <p className="font-medium">
          {contact.name}
          {contact.role && ` (${contact.role})`}
        </p>
        <p className="text-muted-foreground">
          {contact.phone}
          {contact.email && ` · ${contact.email}`}
        </p>
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

function AddGuardianContactForm({ junakId }: { junakId: string }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const add = useAddGuardianContact(junakId);

  return (
    <div className="space-y-2 pt-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ім'я" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
      <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Роль (мама, тато...)" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <Button
        size="sm"
        disabled={!name || !phone || add.isPending}
        onClick={() =>
          add.mutate(
            { name, phone, role: role || undefined, email: email || undefined },
            {
              onSuccess: () => {
                setName('');
                setPhone('');
                setRole('');
                setEmail('');
              },
            },
          )
        }
      >
        Додати опікуна
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

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: user, isLoading } = useUser(id);
  const { data: session } = useSession();
  const updateContactInfo = useUpdateContactInfo(id);
  const createRequest = useCreateApprovalRequest();
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [nameRequestSent, setNameRequestSent] = useState(false);

  const canEditContactInfo =
    (session?.role === 'ZVYAZKOVYI' || session?.isKurinniy) && user?.role === 'JUNAK';
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
  const canConfirmProby = session?.role === 'VYKHOVNYK' || session?.role === 'ZVYAZKOVYI';

  const canMoveHurtok = session?.role === 'ZVYAZKOVYI' && isJunak;
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
                    disabled={selectedHurtokId === (user.hurtokId ?? '') || updateHurtok.isPending}
                    onClick={() => updateHurtok.mutate(selectedHurtokId || null)}
                  >
                    Перевести
                  </Button>
                </div>
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
            <Label htmlFor="notes">Нотатки</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEditContactInfo}
            />
          </div>
          {canEditContactInfo && (
            <Button onClick={() => updateContactInfo.mutate({ notes, phone })}>
              Зберегти
            </Button>
          )}
        </CardContent>
      </Card>
      {canEditContactInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Опікуни</CardTitle>
          </CardHeader>
          <CardContent>
            {isError && (
              <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження опікунів.'}</p>
            )}
            {(guardianContacts ?? []).map((contact) => (
              <GuardianContactRow key={contact.id} contact={contact} junakId={id} />
            ))}
            <AddGuardianContactForm junakId={id} />
          </CardContent>
        </Card>
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
                  (junakProgress ?? []).filter((p) => p.status === 'DONE').map((p) => p.pointId),
                );
                return probyProgram.stages
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => (
                    <div key={stage.id} className="mb-4 last:mb-0">
                      <h3 className="mb-2 text-sm font-bold uppercase text-muted-foreground">{stage.name}</h3>
                      {stage.categories.map((category) => (
                        <ProbyCategorySection
                          key={category.id}
                          category={category}
                          doneByPointId={doneByPointId}
                          canConfirm={canConfirmProby}
                          onConfirm={(pointId) => confirmPoint.mutate(pointId)}
                          onUnconfirm={(pointId) => unconfirmPoint.mutate(pointId)}
                        />
                      ))}
                    </div>
                  ));
              })()}
          </CardContent>
        </Card>
      )}
      {session?.isKurinniy && user.role === 'JUNAK' && (
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
    </div>
  );
}
