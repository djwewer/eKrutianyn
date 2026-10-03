import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = 'gpt-4o';

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async createChatCompletion(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
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
