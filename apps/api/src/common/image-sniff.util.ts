const SIGNATURES: { mimeType: string; check: (buf: Buffer) => boolean }[] = [
  {
    mimeType: 'image/png',
    check: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    mimeType: 'image/jpeg',
    check: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mimeType: 'image/gif',
    check: (buf) =>
      buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a'),
  },
  {
    mimeType: 'image/webp',
    check: (buf) => buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
  },
];

// Never trust a client-supplied mimetype for a file we're about to re-serve
// from our own origin — it's trivially spoofable (e.g. an SVG renamed/labeled
// as image/png still contains executable <script>, and our server would
// serve it back with whatever Content-Type the client claimed). This checks
// the actual file bytes and only recognizes raster formats that can't carry
// script content, returning the real mimetype to store/serve, not the one
// the upload claimed.
export function detectSafeImageMimeType(buffer: Buffer): string | null {
  const match = SIGNATURES.find((sig) => sig.check(buffer));
  return match ? match.mimeType : null;
}
