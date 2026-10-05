'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session-client';
import {
  useInventory,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useAddInventoryPhoto,
  useRemoveInventoryPhoto,
} from '@/lib/queries/inventory';
import type { InventoryItem } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accessErrorMessage } from '@/lib/error-message';
import { useGoogleDriveStatus, useSetGoogleDriveFolder, fetchGoogleDrivePickerToken } from '@/lib/queries/google-drive';
import { openGoogleDriveFolderPicker } from '@/lib/google-picker';

function GoogleDriveCard({
  kurinId,
  isZvyazkovyi,
  driveStatus,
  driveConnected,
  driveError,
}: {
  kurinId: string;
  isZvyazkovyi: boolean;
  driveStatus: { connected: boolean; email?: string; folderName?: string } | undefined;
  driveConnected: boolean;
  driveError: boolean;
}) {
  const setDriveFolder = useSetGoogleDriveFolder(kurinId);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function handlePickFolder() {
    setPickerError(null);
    try {
      const accessToken = await fetchGoogleDrivePickerToken(kurinId);
      await openGoogleDriveFolderPicker(accessToken, (folderId, folderName) => {
        setDriveFolder.mutate({ folderId, folderName });
      });
    } catch {
      setPickerError('Не вдалося відкрити вибір папки. Спробуйте підключити Google Drive повторно.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {driveConnected && <p className="text-sm text-green-600 dark:text-green-400">Google Drive підключено.</p>}
        {driveError && (
          <p className="text-sm text-destructive">Не вдалося підключити Google Drive. Спробуйте ще раз.</p>
        )}
        {driveStatus?.connected ? (
          <>
            <p className="text-sm">Підключено як: {driveStatus.email}</p>
            <p className="text-sm">
              Папка для реманенту:{' '}
              {driveStatus.folderName ?? <span className="text-muted-foreground">не обрана</span>}
            </p>
            {isZvyazkovyi && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handlePickFolder}>
                  {driveStatus.folderName ? 'Змінити папку' : 'Обрати папку для реманенту'}
                </Button>
              </div>
            )}
            {pickerError && <p className="text-sm text-destructive">{pickerError}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Google Drive не підключено.
            {isZvyazkovyi ? ' Підключіть його в налаштуваннях куреня, на сторінці «Курінь».' : ' Зверніться до звʼязкового куреня.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PhotoCarousel({ item, canEdit, kurinId }: { item: InventoryItem; canEdit: boolean; kurinId: string }) {
  const [index, setIndex] = useState(0);
  const removePhoto = useRemoveInventoryPhoto(kurinId);
  const photo = item.photos[index];

  if (item.photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Немає фото</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded">
        <img
          src={photo.url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-110 object-cover blur-xl"
        />
        <img src={photo.url} alt={item.name} className="relative size-full object-contain" />
      </div>
      {item.photos.length > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndex((index - 1 + item.photos.length) % item.photos.length)}
          >
            ◂
          </Button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {item.photos.length}
          </span>
          <Button size="sm" variant="outline" onClick={() => setIndex((index + 1) % item.photos.length)}>
            ▸
          </Button>
        </div>
      )}
      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          disabled={removePhoto.isPending}
          onClick={() => {
            removePhoto.mutate({ itemId: item.id, photoId: photo.id });
            setIndex(0);
          }}
        >
          Видалити це фото
        </Button>
      )}
    </div>
  );
}

function AddItemForm({ kurinId }: { kurinId: string }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [photos, setPhotos] = useState<File[]>([]);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const create = useCreateInventoryItem(kurinId);

  return (
    <div className="space-y-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Назва (наприклад, Пилка)"
        maxLength={50}
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Опис"
        maxLength={200}
      />
      <Input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Кількість"
      />
      <input
        ref={photosInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => photosInputRef.current?.click()}>
        {photos.length > 0 ? `Обрано фото: ${photos.length}` : 'Додати фото'}
      </Button>
      <Button
        size="sm"
        disabled={!name || create.isPending}
        onClick={() =>
          create.mutate(
            { name, description: description || undefined, quantity: Number(quantity), photos },
            {
              onSuccess: () => {
                setName('');
                setDescription('');
                setQuantity('1');
                setPhotos([]);
              },
            },
          )
        }
      >
        Додати річ
      </Button>
      {create.isError && (
        <p className="text-sm text-destructive">{accessErrorMessage(create.error) ?? 'Не вдалося додати річ.'}</p>
      )}
    </div>
  );
}

function InventoryItemCard({ item, canEdit, kurinId }: { item: InventoryItem; canEdit: boolean; kurinId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? '');
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const newPhotoInputRef = useRef<HTMLInputElement>(null);
  const update = useUpdateInventoryItem(kurinId);
  const remove = useDeleteInventoryItem(kurinId);
  const addPhoto = useAddInventoryPhoto(kurinId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{item.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PhotoCarousel item={item} canEdit={canEdit} kurinId={kurinId} />
        {isEditing ? (
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { itemId: item.id, name, description: description || undefined, quantity: Number(quantity) },
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
        ) : (
          <>
            {item.description && <p className="text-xs break-words text-muted-foreground">{item.description}</p>}
            <p className="text-sm text-muted-foreground">Кількість: {item.quantity}</p>
          </>
        )}
        {canEdit && !isEditing && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Редагувати
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove.mutate(item.id)} disabled={remove.isPending}>
                Видалити
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={newPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-w-0 flex-1 shrink truncate"
                onClick={() => newPhotoInputRef.current?.click()}
              >
                {newPhoto ? newPhoto.name : 'Обрати фото'}
              </Button>
              <Button
                size="sm"
                className="shrink-0"
                disabled={!newPhoto || addPhoto.isPending}
                onClick={() => {
                  if (newPhoto)
                    addPhoto.mutate(
                      { itemId: item.id, photo: newPhoto },
                      { onSuccess: () => setNewPhoto(null) },
                    );
                }}
              >
                Додати фото
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const kurinId = session?.kurinId;
  const { data: items, isLoading, isError, error } = useInventory(kurinId);
  const isZvyazkovyi = session?.role === 'ZVYAZKOVYI';
  const canEdit = isZvyazkovyi || !!session?.positions.includes('INTENDANT');
  const driveStatus = useGoogleDriveStatus(canEdit ? kurinId : undefined);
  const driveReady = !!driveStatus.data?.folderId;
  const searchParams = useSearchParams();
  const driveConnected = searchParams.get('driveConnected') === '1';
  const driveError = searchParams.get('driveError') === '1';

  if (isLoading || (canEdit && driveStatus.isLoading)) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Облік реманенту</h1>
      {canEdit && (
        <GoogleDriveCard
          kurinId={kurinId}
          isZvyazkovyi={isZvyazkovyi}
          driveStatus={driveStatus.data}
          driveConnected={driveConnected}
          driveError={driveError}
        />
      )}
      {canEdit && driveReady && (
        <Card>
          <CardHeader>
            <CardTitle>Додати річ</CardTitle>
          </CardHeader>
          <CardContent>
            <AddItemForm kurinId={kurinId} />
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(items ?? []).map((item) => (
          <InventoryItemCard key={item.id} item={item} canEdit={canEdit} kurinId={kurinId} />
        ))}
      </div>
    </div>
  );
}
