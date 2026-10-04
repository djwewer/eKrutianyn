'use client';

import { useEffect, useState, useRef } from 'react';
import { useOwnProfile, useUpdateOwnProfile, useChangePassword, useRequestEmailChange, useUpdateOwnPhoto, useRemoveOwnPhoto } from '@/lib/queries/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { PhotoCropDialog } from '@/components/photo-crop-dialog';
import { getInitials } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';

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
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Налаштування</h1>

      {forcedPasswordChange && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
              <Button type="button" size="sm" variant="ghost" disabled={removePhoto.isPending} onClick={() => removePhoto.mutate()}>
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
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Ім'я</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Прізвище</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Нікнейм</Label>
              <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">Дата народження</Label>
              <Input
                id="birthDate"
                type="date"
                className="text-sm"
                value={birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            {updateProfile.isError && <p className="text-sm text-destructive">Не вдалося зберегти зміни.</p>}
            {updateProfile.isSuccess && <p className="text-sm text-muted-foreground">Збережено.</p>}
            <Button type="submit" disabled={updateProfile.isPending}>
              Зберегти
            </Button>
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
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Поточний пароль</Label>
              <Input
                id="currentPassword"
                data-testid="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
              <p className="text-sm text-destructive">Не вдалося змінити пароль. Перевірте поточний пароль.</p>
            )}
            {changePassword.isSuccess && <p className="text-sm text-muted-foreground">Пароль змінено.</p>}
            <Button type="submit" disabled={changePassword.isPending}>
              Змінити пароль
            </Button>
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
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newEmail">Нова адреса</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
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
                <p className="text-sm text-destructive">
                  Не вдалося змінити email. Перевірте пароль або чи ця адреса вже не зайнята.
                </p>
              )}
              <Button type="submit" disabled={requestEmailChange.isPending}>
                Змінити email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
