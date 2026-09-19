'use client';

import { useState } from 'react';
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
import { useGoogleDriveStatus } from '@/lib/queries/google-drive';

function PhotoCarousel({ item, canEdit, kurinId }: { item: InventoryItem; canEdit: boolean; kurinId: string }) {
  const [index, setIndex] = useState(0);
  const removePhoto = useRemoveInventoryPhoto(kurinId);
  const photo = item.photos[index];

  if (item.photos.length === 0) {
    return <p className="text-sm text-muted-foreground">Немає фото</p>;
  }

  return (
    <div className="space-y-2">
      <img src={photo.url} alt={item.name} className="h-40 w-full rounded object-cover" />
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
  const create = useCreateInventoryItem(kurinId);

  return (
    <div className="space-y-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва (наприклад, Пилка)" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Опис" />
      <Input
        type="number"
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Кількість"
      />
      <Input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
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
  const update = useUpdateInventoryItem(kurinId);
  const remove = useDeleteInventoryItem(kurinId);
  const addPhoto = useAddInventoryPhoto(kurinId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{item.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PhotoCarousel item={item} canEdit={canEdit} kurinId={kurinId} />
        {isEditing ? (
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
            {item.description && <p className="text-sm">{item.description}</p>}
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
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setNewPhoto(e.target.files?.[0] ?? null)}
              />
              <Button
                size="sm"
                disabled={!newPhoto || addPhoto.isPending}
                onClick={() => {
                  if (newPhoto) addPhoto.mutate({ itemId: item.id, photo: newPhoto }, { onSuccess: () => setNewPhoto(null) });
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
  const canEdit = session?.role === 'ZVYAZKOVYI' || !!session?.positions.includes('INTENDANT');
  const driveStatus = useGoogleDriveStatus(kurinId);
  const driveReady = !!driveStatus.data?.folderId;

  if (isLoading || driveStatus.isLoading) return <p>Завантаження...</p>;
  if (isError) return <p className="text-sm text-destructive">{accessErrorMessage(error) ?? 'Помилка завантаження.'}</p>;
  if (!kurinId) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Облік реманенту</h1>
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
      {canEdit && !driveReady && (
        <p className="text-sm text-muted-foreground">
          Спершу підключіть Google Drive і оберіть папку для реманенту у{' '}
          <a href="/kurin" className="underline">
            налаштуваннях куреня
          </a>
          .
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(items ?? []).map((item) => (
          <InventoryItemCard key={item.id} item={item} canEdit={canEdit} kurinId={kurinId} />
        ))}
      </div>
    </div>
  );
}
