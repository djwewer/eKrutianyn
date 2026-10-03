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

import { OpenAiService } from './openai.service';

describe('OpenAiService', () => {
  let service: OpenAiService;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-api-key';
    delete process.env.OPENAI_MODEL;
    service = new OpenAiService();
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.OPENAI_MODEL = originalModel;
  });

  describe('createChatCompletion', () => {
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
