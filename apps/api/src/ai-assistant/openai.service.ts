import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = 'gpt-4o';

@Injectable()
export class OpenAiService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      // Constructed lazily (on first actual call) rather than in the constructor:
      // the SDK throws synchronously when OPENAI_API_KEY is unset, and doing that
      // at DI/bootstrap time would crash the entire Nest app, not just this feature.
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        // Lets this point at any OpenAI-compatible endpoint (e.g. Groq) instead of
        // the real OpenAI API — unset, the SDK defaults to OpenAI's own endpoint.
        baseURL: process.env.OPENAI_BASE_URL || undefined,
        timeout: 60_000,
        maxRetries: 1,
      });
    }
    return this.client;
  }

  async createChatCompletion(messages: ChatMessage[]): Promise<string> {
    const response = await this.getClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
      messages,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('OpenAI returned an empty response');
    }
    return content;
  }
}
