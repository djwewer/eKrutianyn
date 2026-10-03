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
