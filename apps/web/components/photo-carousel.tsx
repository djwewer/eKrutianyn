'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type CarouselPhoto = { id: string; src: string; alt?: string };

function Carousel({
  photos,
  label,
  ratio,
  startIndex = 0,
  inLightbox = false,
  renderSlideExtra,
  onIndexChange,
  onOpen,
  rootRef,
}: {
  photos: CarouselPhoto[];
  label: string;
  ratio: string;
  startIndex?: number;
  inLightbox?: boolean;
  renderSlideExtra?: (photo: { id: string; src: string }, index: number) => React.ReactNode;
  onIndexChange?: (index: number) => void;
  onOpen?: (index: number, slide: HTMLButtonElement) => void;
  rootRef?: React.Ref<HTMLDivElement>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const multi = photos.length > 1;
  const current = Math.min(index, photos.length - 1);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track && startIndex > 0) track.scrollLeft = startIndex * track.clientWidth;
  }, [startIndex]);

  const go = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track) return;
      const n = photos.length;
      const target = (i + n) % n;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({ left: target * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    },
    [photos.length],
  );

  function sync() {
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== index) {
      setIndex(i);
      onIndexChange?.(i);
    }
  }

  // Lightbox: arrow keys step the carousel from anywhere in the dialog.
  useEffect(() => {
    if (!inLightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const track = trackRef.current;
      if (!track) return;
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      go(i + (e.key === 'ArrowRight' ? 1 : -1));
      e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inLightbox, go]);

  const extra = renderSlideExtra && photos[current] ? renderSlideExtra(photos[current], current) : null;

  return (
    <div ref={rootRef} className="cz cz--dots" style={{ '--cz-ratio': ratio } as React.CSSProperties}>
      <div className="cz-stage">
        <div
          ref={trackRef}
          className="cz-track"
          tabIndex={0}
          aria-roledescription="карусель"
          aria-label={label}
          onScroll={sync}
          onKeyDown={(e) => {
            if (inLightbox) return;
            if (e.key === 'ArrowRight') {
              go(current + 1);
              e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
              go(current - 1);
              e.preventDefault();
            }
          }}
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className="cz-slide"
              aria-label={`Відкрити фото ${i + 1} з ${photos.length}`}
              onClick={(e) => !inLightbox && onOpen?.(i, e.currentTarget)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={`${p.alt ?? label} ${i + 1}`} loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
        {multi && (
          <>
            <button type="button" className="cz-btn cz-prev" aria-label="Попереднє фото" onClick={() => go(current - 1)}>
              ‹
            </button>
            <button type="button" className="cz-btn cz-next" aria-label="Наступне фото" onClick={() => go(current + 1)}>
              ›
            </button>
          </>
        )}
      </div>
      {multi && (
        <div className="cz-dots">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`cz-dot${i === current ? ' on' : ''}`}
              aria-label={`Фото ${i + 1}`}
              aria-current={i === current ? 'true' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}

function Lightbox({
  photos,
  label,
  startIndex,
  onClose,
}: {
  photos: CarouselPhoto[];
  label: string;
  startIndex: number;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('lb-lock');
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('lb-lock');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button ref={closeRef} type="button" className="lb-close" aria-label="Закрити" onClick={onClose}>
        ×
      </button>
      <div className="lb-inner">
        <Carousel photos={photos} label={label} ratio="4/3" startIndex={startIndex} inLightbox />
      </div>
    </div>,
    document.body,
  );
}

export function PhotoCarousel({
  photos,
  label,
  ratio = '4/3',
  renderSlideExtra,
  onIndexChange,
}: {
  photos: CarouselPhoto[];
  label: string;
  ratio?: string;
  renderSlideExtra?: (photo: { id: string; src: string }, index: number) => React.ReactNode;
  onIndexChange?: (index: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(null);
    // Return focus to the slide that opened the lightbox (it may have been re-rendered).
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
  }, []);

  return (
    <>
      <Carousel
        photos={photos}
        label={label}
        ratio={ratio}
        renderSlideExtra={renderSlideExtra}
        onIndexChange={onIndexChange}
        rootRef={rootRef}
        onOpen={(i, slide) => {
          openerRef.current = slide;
          setOpen(i);
        }}
      />
      {open !== null && <Lightbox photos={photos} label={label} startIndex={open} onClose={close} />}
    </>
  );
}
