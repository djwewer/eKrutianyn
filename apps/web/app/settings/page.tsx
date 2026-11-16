'use client';

import { useEffect, useState, useRef } from 'react';
import { useOwnProfile, useUpdateOwnProfile, useChangePassword, useRequestEmailChange, useUpdateOwnPhoto, useRemoveOwnPhoto } from '@/lib/queries/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { PageHeader } from '@/components/ui/page-header';
import { RowList } from '@/components/ui/row-list';
import { ROLE_LABELS } from '@/lib/role-labels';
import { PhotoCropDialog } from '@/components/photo-crop-dialog';
import { PushNotificationToggle } from '@/components/push-notification-toggle';
import { getInitials } from '@/lib/utils';
import { localDateKey } from '@/lib/dates';
import { ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { useSession } from '@/lib/session-client';
import { useLogout } from '@/lib/use-logout';
import { useApprovalRequests } from '@/lib/queries/approval-requests-list';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const quickActionClass =
  'flex items-center gap-[.8rem] border-b border-dashed border-line px-[.9rem] py-[.65rem] transition-colors last:border-b-0 hover:bg-sky-soft';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && typeof error.body === 'object' && error.body) {
    const message = (error.body as { message?: string | string[] }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && message.length > 0) return message.join(' ');
  }
  return fallback;
}

export default function SettingsPage() {
  const { data: profile, isLoading } = useOwnProfile();
  const { data: session } = useSession();
  const logout = useLogout();
  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const { data: pending } = useApprovalRequests('PENDING', { enabled: isZvyazkovyi });
  const updateProfile = useUpdateOwnProfile();
  const changePassword = useChangePassword();
  const requestEmailChange = useRequestEmailChange();
  const updatePhoto = useUpdateOwnPhoto();
  const removePhoto = useRemoveOwnPhoto();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoToCrop, setPhotoToCrop] = useState<File | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailRequestSent, setEmailRequestSent] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setNickname(profile.nickname ?? '');
      setPhone(profile.phone ?? '');
      setBirthDate(profile.birthDate ? profile.birthDate.slice(0, 10) : '');
    }
  }, [profile]);

  if (isLoading) return <p>Завантаження...</p>;
  if (!profile) return <p>Не знайдено.</p>;

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({
        firstName,
        lastName,
        nickname,
        phone,
        birthDate: birthDate || undefined,
      });
    } catch {
      // isError below shows the message
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await changePassword.mutateAsync({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      // isError below shows the message
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await requestEmailChange.mutateAsync({ newEmail, currentPassword: emailPassword });
      setEmailRequestSent(true);
    } catch {
      // isError below shows the message
    }
  }

  const forcedPasswordChange = profile.mustChangePassword;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Налаштування"
        subtitle={`${profile.firstName} ${profile.lastName}${session?.role ? ` · ${ROLE_LABELS[session.role]}` : ''}`}
      />

      <Card>
        <CardContent>
          <RowList>
            <Link href="/me" className={quickActionClass}>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <b className="text-base leading-tight">Мій профіль</b>
                <small className="text-[.82rem] text-ink-2">Ваші дані, посади та історія</small>
              </span>
              <span className="text-xl text-ink-2" aria-hidden="true">›</span>
            </Link>
          </RowList>
        </CardContent>
      </Card>

      {isZvyazkovyi && (
        <Card>
          <CardHeader>
            <CardTitle>Швидкі дії</CardTitle>
          </CardHeader>
          <CardContent>
            <RowList>
              <Link href="/approval-requests" className={quickActionClass}>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <b className="text-base leading-tight">Запити</b>
                  <small className="text-[.82rem] text-ink-2">Зміни даних юнаків, що чекають затвердження</small>
                </span>
                {pending && pending.length > 0 && (
                  <span className="rounded-full bg-signal px-[.4rem] font-mono text-[.66rem] leading-[1.4] text-white dark:text-navy-ink">{pending.length}</span>
                )}
                <span className="text-xl text-ink-2" aria-hidden="true">›</span>
              </Link>
              <Link href="/audit-log" className={quickActionClass}>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <b className="text-base leading-tight">Журнал дій</b>
                  <small className="text-[.82rem] text-ink-2">Хто що змінив у курені</small>
                </span>
                <span className="text-xl text-ink-2" aria-hidden="true">›</span>
              </Link>
            </RowList>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Вигляд</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-[.75rem]">
          <div className="grid gap-[.3rem]">
            <Label>Тема</Label>
            <div>
              <ThemeToggle />
            </div>
          </div>
          {!forcedPasswordChange && <PushNotificationToggle />}
        </CardContent>
      </Card>

      {forcedPasswordChange && (
        <p className="rounded-[6px] border-2 border-late bg-late-soft p-3 text-sm text-late">
          Вам призначили тимчасовий пароль. Перш ніж продовжити, встановіть власний пароль нижче.
        </p>
      )}

      {!forcedPasswordChange && (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Фото профілю</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar
            initials={getInitials(profile.firstName, profile.lastName)}
            photoUrl={profile.photoUpdatedAt ? `/api/backend/users/${profile.id}/photo?v=${profile.photoUpdatedAt}` : null}
            className="size-16 text-base"
          />
          <div className="flex flex-col gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  updatePhoto.reset();
                  setPhotoToCrop(file);
                }
                e.target.value = '';
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={updatePhoto.isPending} onClick={() => photoInputRef.current?.click()}>
              {profile.photoUpdatedAt ? 'Змінити фото' : 'Завантажити фото'}
            </Button>
            {profile.photoUpdatedAt && (
              <Button type="button" size="sm" variant="destructive" disabled={removePhoto.isPending} onClick={() => removePhoto.mutate()}>
                Видалити фото
              </Button>
            )}
            {removePhoto.isError && (
              <p className="text-sm text-destructive">
                {apiErrorMessage(removePhoto.error, 'Не вдалося видалити фото.')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <PhotoCropDialog
        file={photoToCrop}
        onOpenChange={(open) => {
          if (!open && !updatePhoto.isPending) setPhotoToCrop(null);
        }}
        isSaving={updatePhoto.isPending}
        errorMessage={updatePhoto.isError ? apiErrorMessage(updatePhoto.error, 'Не вдалося завантажити фото.') : null}
        onSave={(croppedPhoto) => {
          updatePhoto.mutate(croppedPhoto, {
            onSuccess: () => setPhotoToCrop(null),
          });
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Особисті дані</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-[.3rem]">
              <Label htmlFor="firstName">Ім'я</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="grid gap-[.3rem]">
              <Label htmlFor="lastName">Прізвище</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="grid gap-[.3rem]">
              <Label htmlFor="nickname">Псевдо</Label>
              <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div className="grid gap-[.3rem]">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-[.3rem]">
              <Label htmlFor="birthDate">Дата народження</Label>
              <Input
                id="birthDate"
                type="date"
                className="text-sm"
                value={birthDate}
                max={localDateKey(new Date())}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            {updateProfile.isError && <p className="text-sm sm:col-span-2 text-destructive">Не вдалося зберегти зміни.</p>}
            {updateProfile.isSuccess && <p className="text-sm sm:col-span-2 text-muted-foreground">Збережено.</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={updateProfile.isPending}>
                Зберегти
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Пароль</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-[.3rem]">
              <Label htmlFor="currentPassword">Поточний пароль</Label>
              <Input
                id="currentPassword"
                data-testid="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-[.3rem]">
              <Label htmlFor="newPassword">Новий пароль</Label>
              <Input
                id="newPassword"
                data-testid="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            {changePassword.isError && (
              <p className="text-sm text-destructive sm:col-span-2">Не вдалося змінити пароль. Перевірте поточний пароль.</p>
            )}
            {changePassword.isSuccess && <p className="text-sm sm:col-span-2 text-muted-foreground">Пароль змінено.</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={changePassword.isPending}>
                Змінити пароль
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!forcedPasswordChange && (
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">Поточний: {profile.email}</p>
          {emailRequestSent ? (
            <p className="text-sm text-muted-foreground">
              Перевірте пошту на новій адресі — там лист із посиланням для підтвердження.
            </p>
          ) : (
            <form onSubmit={handleEmailSubmit} className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-[.3rem]">
                <Label htmlFor="newEmail">Нова адреса</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-[.3rem]">
                <Label htmlFor="emailPassword">Поточний пароль</Label>
                <Input
                  id="emailPassword"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                />
              </div>
              {requestEmailChange.isError && (
                <p className="text-sm text-destructive sm:col-span-2">
                  Не вдалося змінити email. Перевірте пароль або чи ця адреса вже не зайнята.
                </p>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={requestEmailChange.isPending}>
                  Змінити email
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      )}

      <Button type="button" variant="destructive" className="w-full" onClick={logout}>
        Вийти
      </Button>
    </div>
  );
}
