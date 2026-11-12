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
import { PageHeader } from '@/components/ui/page-header';
import { PhotoCarousel } from '@/components/photo-carousel';
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
        {driveConnected && <p className="text-sm text-ok">Google Drive підключено.</p>}
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
  const removePhoto = useRemoveInventoryPhoto(kurinId);

  return (
    <article className="inv-tag">
      <h3 className="m-0 pr-5 font-display text-[1.3rem] leading-[1.15] font-semibold tracking-[.02em] uppercase">
        {item.name}
      </h3>
      {item.photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Немає фото</p>
      ) : (
        <PhotoCarousel
          photos={item.photos.map((p) => ({ id: p.id, src: p.url, alt: item.name }))}
          label={item.name}
          ratio="4/3"
          renderSlideExtra={(photo) =>
            canEdit ? (
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={removePhoto.isPending}
                onClick={() => removePhoto.mutate({ itemId: item.id, photoId: photo.id })}
              >
                Видалити це фото
              </Button>
            ) : null
          }
        />
      )}
      <div className="space-y-3">
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
      </div>
    </article>
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
      <PageHeader title="Облік реманенту" subtitle={`${(items ?? []).length} позицій`} />
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-[1.1rem]">
        {(items ?? []).map((item) => (
          <InventoryItemCard key={item.id} item={item} canEdit={canEdit} kurinId={kurinId} />
        ))}
      </div>
    </div>
  );
}
