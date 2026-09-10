'use client';

import { use, useState, useEffect } from 'react';
import { useUser, useUpdateContactInfo } from '@/lib/queries/users';
import { useSession } from '@/lib/session-client';
import { useCreateApprovalRequest } from '@/lib/queries/approval-requests';
import {
  useGuardianContacts,
  useAddGuardianContact,
  useUpdateGuardianContact,
  useRemoveGuardianContact,
} from '@/lib/queries/guardian-contacts';
import type { GuardianContact } from '@/lib/types';
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
          {user.birthDate && <p>Дата народження: {user.birthDate}</p>}
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
