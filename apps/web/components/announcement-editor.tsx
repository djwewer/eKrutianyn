'use client';

import { useState, type ReactNode } from 'react';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  SquareCode,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  Link2,
  Table as TableIcon,
  Image as ImageIcon,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useUploadAnnouncementImage } from '@/lib/queries/announcements';

export const ANNOUNCEMENT_EDITOR_EXTENSIONS = [
  StarterKit,
  TiptapImage,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({ nested: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(active && 'bg-accent-soft text-accent-text')}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px self-center bg-border" />;
}

export function AnnouncementEditor({
  kurinId,
  initialTitle,
  initialContent,
  submitLabel,
  isSaving,
  errorMessage,
  onSubmit,
}: {
  kurinId: string;
  initialTitle: string;
  initialContent: Record<string, unknown> | null;
  submitLabel: string;
  isSaving: boolean;
  errorMessage: string | null;
  onSubmit: (data: { title: string; content: Record<string, unknown>; imageIds: string[] }) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const uploadImage = useUploadAnnouncementImage(kurinId);

  const editor = useEditor({
    extensions: ANNOUNCEMENT_EDITOR_EXTENSIONS,
    content: initialContent ?? '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'announcement-content min-h-32 focus:outline-none' },
    },
  });

  const state = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor as Editor | null;
      if (!e) return null;
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        alignLeft: e.isActive({ textAlign: 'left' }),
        alignCenter: e.isActive({ textAlign: 'center' }),
        alignRight: e.isActive({ textAlign: 'right' }),
        alignJustify: e.isActive({ textAlign: 'justify' }),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        blockquote: e.isActive('blockquote'),
        code: e.isActive('code'),
        codeBlock: e.isActive('codeBlock'),
        link: e.isActive('link'),
      };
    },
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setImageError(null);
    try {
      const uploaded = await uploadImage.mutateAsync(file);
      setImageIds((prev) => [...prev, uploaded.id]);
      editor.chain().focus().setImage({ src: `/api/backend/kurins/${kurinId}/announcements/images/${uploaded.id}` }).run();
    } catch {
      setImageError('Не вдалося завантажити зображення.');
    }
  }

  function handleSubmit() {
    if (!editor) return;
    onSubmit({ title: title.trim(), content: editor.getJSON(), imageIds });
  }

  return (
    <div className="space-y-4">
      <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1.5">
        <ToolbarButton label="Скасувати" active={false} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 className={cn('size-4', !state?.canUndo && 'opacity-40')} />
        </ToolbarButton>
        <ToolbarButton label="Повторити" active={false} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 className={cn('size-4', !state?.canRedo && 'opacity-40')} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="Заголовок 1" active={state?.h1} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Заголовок 2" active={state?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Заголовок 3" active={state?.h3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="Жирний" active={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Курсив" active={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Підкреслений" active={state?.underline} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Закреслений" active={state?.strike} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="По лівому краю" active={state?.alignLeft} onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="По центру" active={state?.alignCenter} onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="По правому краю" active={state?.alignRight} onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="По ширині" active={state?.alignJustify} onClick={() => editor?.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="Маркований список" active={state?.bulletList} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Нумерований список" active={state?.orderedList} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Список завдань" active={state?.taskList} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <ListChecks className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton label="Цитата" active={state?.blockquote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Код" active={state?.code} onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Блок коду" active={state?.codeBlock} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
          <SquareCode className="size-4" />
        </ToolbarButton>
        <ToolbarButton label="Розділювач" active={false} onClick={() => editor?.chain().focus().setHorizontalRule().run()}>
          <Minus className="size-4" />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          label="Посилання"
          active={state?.link}
          onClick={() => {
            const url = window.prompt('URL посилання:');
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          }}
        >
          <Link2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Таблиця"
          active={false}
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="size-4" />
        </ToolbarButton>
        <label
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground hover:bg-muted"
          title="Картинка"
        >
          <ImageIcon className="size-4" />
          <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        </label>
      </div>

      <div className="rounded-lg border border-border p-3">
        <EditorContent editor={editor} />
      </div>
      {imageError && <p className="text-sm text-destructive">{imageError}</p>}
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button disabled={!title.trim() || isSaving} onClick={handleSubmit}>
        {submitLabel}
      </Button>
    </div>
  );
}
