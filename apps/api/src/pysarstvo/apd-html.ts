const SECTIONS = ['Що було добре:', 'Що можна покращити:'];

/** Drops control characters (they break Google Docs import) and trims. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * HTML that Drive converts into a Google Doc: the title as Heading 1, then
 * for every pseudo a Heading 2 with one Heading 3 + an empty bullet per
 * section as a writing placeholder.
 */
export function buildApdHtml(title: string, pseudos: string[]): string {
  const body = pseudos
    .map((pseudo) => {
      const sections = SECTIONS.map((heading) => `<h3>${escapeHtml(heading)}</h3><ul><li>&nbsp;</li></ul>`).join('');
      return `<h2>${escapeHtml(pseudo)}</h2>${sections}`;
    })
    .join('');
  return `<html><head><meta charset="utf-8"></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}
