'use client';

import { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Не вдалося завантажити зображення.')));
    image.src = src;
  });
}

async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не вдалося обрізати зображення.'));
    }, 'image/png');
  });
}

export function PhotoCropDialog({
  file,
  onOpenChange,
  onSave,
  isSaving,
  errorMessage,
}: {
  /** The just-selected file to crop; the dialog is open whenever this is non-null. */
  file: File | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the cropped, fixed-size square image ready to upload. */
  onSave: (photo: File) => void;
  isSaving: boolean;
  errorMessage?: string | null;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);

  // Object URLs are a pure, cheap-to-recompute view of `file`, so derive the
  // URL during render instead of mirroring it into state via an effect; the
  // effect below only handles the side effect of revoking it on change/unmount.
  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Reset the crop/zoom state whenever a new file arrives, following React's
  // "adjusting state when a prop changes" pattern (done during render, not in
  // an effect, since it is purely a response to `file` changing identity).
  const [resetForFile, setResetForFile] = useState<File | null>(null);
  if (file !== resetForFile) {
    setResetForFile(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropError(null);
  }

  async function handleSave() {
    if (!imageUrl || !croppedAreaPixels) return;
    setCropError(null);
    try {
      const blob = await cropToBlob(imageUrl, croppedAreaPixels);
      onSave(new File([blob], 'photo.png', { type: 'image/png' }));
    } catch {
      setCropError('Не вдалося обрізати зображення.');
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Обрізати фото</DialogTitle>
        {imageUrl && (
          <div className="relative h-72 w-full overflow-hidden rounded-md bg-muted" data-testid="photo-crop-area">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
            />
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="photo-crop-zoom" className="text-sm text-muted-foreground">
            Масштаб
          </label>
          <input
            id="photo-crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        {(cropError || errorMessage) && <p className="text-sm text-destructive">{cropError ?? errorMessage}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Скасувати
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving || !croppedAreaPixels}>
            {isSaving ? 'Завантаження...' : 'Зберегти'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
