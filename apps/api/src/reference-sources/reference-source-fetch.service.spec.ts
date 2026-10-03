import { ReferenceSourceFetchService } from './reference-source-fetch.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReferenceSourceFetchService', () => {
  let service: ReferenceSourceFetchService;
  let prisma: {
    referenceSource: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    prisma = {
      referenceSource: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new ReferenceSourceFetchService(prisma as unknown as PrismaService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('extractText', () => {
    it('strips script, style, and nav/header/footer noise and collapses whitespace', () => {
      const html = `
        <html>
          <head><style>.a{color:red}</style></head>
          <body>
            <nav>Menu</nav>
            <header>Site Header</header>
            <script>console.log('x')</script>
            <main>  Гімн   Пласту\n\n  Цвіт України  </main>
            <footer>Footer text</footer>
          </body>
        </html>
      `;
      const text = service.extractText(html);
      expect(text).toBe('Гімн Пласту Цвіт України');
    });

    it('truncates very long extracted text to the configured max length', () => {
      const longText = 'a'.repeat(20_000);
      const html = `<body>${longText}</body>`;
      const text = service.extractText(html);
      expect(text.length).toBe(8_000);
    });
  });

  describe('fetchAndExtract', () => {
    it('fetches the URL and extracts its text on a 200 response', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '<body>Hello</body>' });
      const text = await service.fetchAndExtract('https://example.com/page');
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/page', expect.objectContaining({ signal: expect.anything() }));
      expect(text).toBe('Hello');
    });

    it('throws when the response is not ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
      await expect(service.fetchAndExtract('https://example.com/missing')).rejects.toThrow('404');
    });
  });

  describe('refreshOne', () => {
    it('updates extractedText, lastFetchedAt, and clears lastError on success', async () => {
      prisma.referenceSource.findUnique.mockResolvedValue({ id: 's1', url: 'https://example.com/page' });
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '<body>Content</body>' });

      await service.refreshOne('s1');

      expect(prisma.referenceSource.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { extractedText: 'Content', lastFetchedAt: expect.any(Date), lastError: null },
      });
    });

    it('records lastError and keeps the existing extractedText cached on failure', async () => {
      prisma.referenceSource.findUnique.mockResolvedValue({ id: 's1', url: 'https://example.com/down' });
      fetchMock.mockRejectedValue(new Error('network fail'));

      await service.refreshOne('s1');

      expect(prisma.referenceSource.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { lastError: 'network fail' },
      });
    });

    it('does nothing when the source no longer exists', async () => {
      prisma.referenceSource.findUnique.mockResolvedValue(null);
      await service.refreshOne('missing');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.referenceSource.update).not.toHaveBeenCalled();
    });
  });

  describe('refreshAll', () => {
    it('tallies successes and failures across all sources', async () => {
      prisma.referenceSource.findMany.mockResolvedValue([{ id: 'ok' }, { id: 'bad' }]);
      prisma.referenceSource.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'ok') return Promise.resolve({ id: 'ok', url: 'https://example.com/ok', lastError: null });
        if (where.id === 'bad') return Promise.resolve({ id: 'bad', url: 'https://example.com/bad', lastError: null });
        return Promise.resolve(null);
      });
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('ok')) return Promise.resolve({ ok: true, status: 200, text: async () => '<body>Fine</body>' });
        return Promise.reject(new Error('boom'));
      });
      prisma.referenceSource.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id === 'ok') prisma.referenceSource.findUnique.mockResolvedValueOnce({ id: 'ok', lastError: null });
        if (where.id === 'bad') prisma.referenceSource.findUnique.mockResolvedValueOnce({ id: 'bad', lastError: data.lastError });
        return Promise.resolve();
      });

      const result = await service.refreshAll();

      expect(result).toEqual({ succeeded: 1, failed: 1 });
    });
  });
});
