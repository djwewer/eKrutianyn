'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUploadAnnouncementImage } from '@/lib/queries/announcements';

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
  const uploadImage = useUploadAnnouncementImage(kurinId);

  const editor = useEditor({
    extensions: [StarterKit, Link, TiptapImage],
    content: initialContent ?? '<p></p>',
    immediatelyRender: false,
  });

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    const uploaded = await uploadImage.mutateAsync(file);
    setImageIds((prev) => [...prev, uploaded.id]);
    editor.chain().focus().setImage({ src: `/api/backend/kurins/${kurinId}/announcements/images/${uploaded.id}` }).run();
  }

  function handleSubmit() {
    if (!editor) return;
    onSubmit({ title: title.trim(), content: editor.getJSON(), imageIds });
  }

  return (
    <div className="space-y-4">
      <Input placeholder="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <div className="flex flex-wrap gap-2 rounded-md border border-border p-2">
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBold().run()}>
          Жирний
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleItalic().run()}>
          Курсив
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          Список
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          Нумерований список
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            const url = window.prompt('URL посилання:');
            if (url) editor?.chain().focus().setLink({ href: url }).run();
          }}
        >
          Посилання
        </Button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent-soft">
          Картинка
          <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        </label>
      </div>
      <div className="min-h-40 rounded-md border border-border p-3">
        <EditorContent editor={editor} />
      </div>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <Button disabled={!title.trim() || isSaving} onClick={handleSubmit}>
        {submitLabel}
      </Button>
    </div>
  );
}
