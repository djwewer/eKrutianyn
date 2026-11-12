import type { JSONContent } from '@tiptap/core';

export type AnnouncementImage = { id: string; src: string; alt?: string };

/**
 * Pulls every `image` node out of a Tiptap document (recursively), returning
 * them in document order. Blocks left empty by the removal are dropped;
 * blocks that were already empty are kept.
 */
export function splitAnnouncementImages(doc: JSONContent): {
  doc: JSONContent;
  images: AnnouncementImage[];
} {
  const images: AnnouncementImage[] = [];

  function walk(node: JSONContent): JSONContent {
    if (!node.content) return node;
    const next: JSONContent[] = [];
    for (const child of node.content) {
      if (child.type === 'image') {
        const src = child.attrs?.src;
        if (typeof src === 'string' && src) {
          const alt = typeof child.attrs?.alt === 'string' && child.attrs.alt ? child.attrs.alt : undefined;
          images.push({ id: `img-${images.length}-${src}`, src, ...(alt ? { alt } : {}) });
        }
        continue;
      }
      const walked = walk(child);
      // A container (paragraph, blockquote, ...) that only held images is dropped.
      if (child.content && child.content.length > 0 && walked.content?.length === 0) continue;
      next.push(walked);
    }
    return { ...node, content: next };
  }

  return { doc: walk(doc), images };
}
