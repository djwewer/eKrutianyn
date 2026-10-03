import { ServiceUnavailableException } from '@nestjs/common';

const mockChatCompletionsCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: { create: mockChatCompletionsCreate },
      },
    })),
  };
});

import OpenAI from 'openai';
import { OpenAiService } from './openai.service';

const MockedOpenAI = OpenAI as unknown as jest.Mock;

describe('OpenAiService', () => {
  let service: OpenAiService;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-api-key';
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    service = new OpenAiService();
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.OPENAI_MODEL = originalModel;
    process.env.OPENAI_BASE_URL = originalBaseUrl;
  });

  describe('Gemini Google Search grounding', () => {
    const originalFetch = global.fetch;
    const originalGrounding = process.env.GEMINI_SEARCH_GROUNDING;

    afterEach(() => {
      global.fetch = originalFetch;
      if (originalGrounding === undefined) delete process.env.GEMINI_SEARCH_GROUNDING;
      else process.env.GEMINI_SEARCH_GROUNDING = originalGrounding;
    });

    describe('isSearchGroundingEnabled', () => {
      it('is false for a non-Gemini base URL', () => {
        process.env.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
        expect(new OpenAiService().isSearchGroundingEnabled()).toBe(false);
      });

      it('is false when OPENAI_BASE_URL is unset (real OpenAI)', () => {
        process.env.OPENAI_BASE_URL = '';
        expect(new OpenAiService().isSearchGroundingEnabled()).toBe(false);
      });

      it('is true for a Gemini base URL by default', () => {
        process.env.OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
        expect(new OpenAiService().isSearchGroundingEnabled()).toBe(true);
      });

      it('is false for a Gemini base URL when explicitly disabled', () => {
        process.env.OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
        process.env.GEMINI_SEARCH_GROUNDING = 'false';
        expect(new OpenAiService().isSearchGroundingEnabled()).toBe(false);
      });
    });

    describe('createChatCompletion with Gemini grounding enabled', () => {
      let fetchMock: jest.Mock;

      beforeEach(() => {
        process.env.OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
        process.env.OPENAI_MODEL = 'gemini-3.5-flash-lite';
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
      });

      it('calls the native generateContent endpoint with the google_search tool, bypassing the openai SDK', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'Відповідь із пошуком' }] } }] }),
        });

        const result = await new OpenAiService().createChatCompletion([
          { role: 'system', content: 'Системний промпт' },
          { role: 'user', content: 'Яка площа України?' },
        ]);

        expect(result).toBe('Відповідь із пошуком');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
        const body = JSON.parse(options.body);
        expect(body.tools).toEqual([{ google_search: {} }]);
        expect(body.systemInstruction).toEqual({ parts: [{ text: 'Системний промпт' }] });
        expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Яка площа України?' }] }]);
      });

      it('maps assistant history messages to the "model" role', async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
        });

        await new OpenAiService().createChatCompletion([
          { role: 'user', content: 'питання' },
          { role: 'assistant', content: 'відповідь' },
          { role: 'user', content: 'ще питання' },
        ]);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.contents).toEqual([
          { role: 'user', parts: [{ text: 'питання' }] },
          { role: 'model', parts: [{ text: 'відповідь' }] },
          { role: 'user', parts: [{ text: 'ще питання' }] },
        ]);
      });

      it('throws when the native call returns a non-ok status', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503 });

        await expect(
          new OpenAiService().createChatCompletion([{ role: 'user', content: 'hi' }]),
        ).rejects.toThrow('503');
      });

      it('throws ServiceUnavailableException when the response has no text parts', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) });

        await expect(
          new OpenAiService().createChatCompletion([{ role: 'user', content: 'hi' }]),
        ).rejects.toThrow(ServiceUnavailableException);
      });
    });
  });

  describe('OPENAI_BASE_URL (OpenAI-compatible providers, e.g. Groq)', () => {
    it('passes a custom base URL through to the client when set', async () => {
      process.env.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';
      mockChatCompletionsCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
      const groqService = new OpenAiService();

      await groqService.createChatCompletion([{ role: 'user', content: 'Привіт' }]);

      expect(MockedOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.groq.com/openai/v1' }),
      );
    });

    it('leaves the base URL undefined (real OpenAI) when unset or empty', async () => {
      process.env.OPENAI_BASE_URL = '';
      mockChatCompletionsCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
      const defaultService = new OpenAiService();

      await defaultService.createChatCompletion([{ role: 'user', content: 'Привіт' }]);

      expect(MockedOpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: undefined }));
    });
  });

  it('does not throw when constructed without OPENAI_API_KEY', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => new OpenAiService()).not.toThrow();
  });

  describe('createChatCompletion', () => {
    it('rejects the call (not the construction) when OPENAI_API_KEY is missing', async () => {
      delete process.env.OPENAI_API_KEY;
      const unconfiguredService = new OpenAiService();
      mockChatCompletionsCreate.mockRejectedValue(new Error('Missing credentials'));

      await expect(
        unconfiguredService.createChatCompletion([{ role: 'user', content: 'Привіт' }]),
      ).rejects.toThrow('Missing credentials');
    });

    it('returns the assistant message content as a plain string', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Привіт, виховнику!' } }],
      });

      const result = await service.createChatCompletion([{ role: 'user', content: 'Привіт' }]);

      expect(result).toBe('Привіт, виховнику!');
    });

    it('throws when the response has no choices', async () => {
      mockChatCompletionsCreate.mockResolvedValue({ choices: [] });

      await expect(
        service.createChatCompletion([{ role: 'user', content: 'Привіт' }]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws when the message content is null', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      await expect(
        service.createChatCompletion([{ role: 'user', content: 'Привіт' }]),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('defaults to the gpt-4o model when OPENAI_MODEL is unset', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await service.createChatCompletion([{ role: 'user', content: 'Привіт' }]);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o' }),
      );
    });

    it('uses OPENAI_MODEL from the environment when set', async () => {
      process.env.OPENAI_MODEL = 'gpt-4o-mini';
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await service.createChatCompletion([{ role: 'user', content: 'Привіт' }]);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
    });
  });
});
