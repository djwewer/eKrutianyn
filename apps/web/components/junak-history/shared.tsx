'use client';

import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function HistoryCard({
  title,
  testId,
  addLabel,
  onAdd,
  extra,
  children,
}: {
  title: string;
  testId: string;
  addLabel?: string;
  /** Omitted when the viewer can't edit — then there is no add button. */
  onAdd?: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={testId} data-testid={testId}>
      <AccordionTrigger>
        <span>{title}</span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 text-sm">
          {(extra || (onAdd && addLabel)) && (
            <span className="flex flex-wrap items-center gap-2">
              {extra}
              {onAdd && addLabel && (
                <Button size="sm" variant="outline" onClick={onAdd}>
                  <Plus aria-hidden />
                  {addLabel}
                </Button>
              )}
            </span>
          )}
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

export function RowActions({
  label,
  onEdit,
  onDelete,
  disabled,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      <Button size="icon-sm" variant="ghost" aria-label={`Змінити: ${label}`} onClick={onEdit}>
        <Pencil aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Видалити: ${label}`}
        disabled={disabled}
        onClick={() => {
          if (window.confirm(`Видалити «${label}»?`)) onDelete();
        }}
      >
        <Trash2 aria-hidden />
      </Button>
    </span>
  );
}

export function DialogActions({
  onCancel,
  onSubmit,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>
        Скасувати
      </Button>
      <Button disabled={disabled} onClick={onSubmit}>
        Зберегти
      </Button>
    </div>
  );
}
