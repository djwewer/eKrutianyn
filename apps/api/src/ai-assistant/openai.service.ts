import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const DEFAULT_MODEL = 'gpt-4o';
const GEMINI_NATIVE_TIMEOUT_MS = 60_000;

function isGeminiBaseUrl(baseUrl: string | undefined): boolean {
  return !!baseUrl && baseUrl.includes('generativelanguage.googleapis.com');
}

// Google Search grounding (the model deciding, per-turn, whether it needs a
// live web search) is a server-side Gemini tool that is NOT exposed through
// the OpenAI-compatibility endpoint the rest of this service uses — Google's
// own docs/forums confirm `tools: [{ google_search: {} }]` only works against
// the native generateContent REST API. So when OPENAI_BASE_URL points at
// Gemini, grounded calls bypass the `openai` SDK entirely and hit that native
// endpoint directly; every other provider (real OpenAI, Groq, ...) is
// unaffected and keeps using the SDK path below.
function shouldUseGeminiGrounding(): boolean {
  if (!isGeminiBaseUrl(process.env.OPENAI_BASE_URL)) return false;
  // Opt-out valve: grounding bills per search query the model decides to run,
  // on top of normal token costs — this flag lets it be switched off without
  // a code change if that cost becomes a problem.
  return process.env.GEMINI_SEARCH_GROUNDING !== 'false';
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
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

  // Lets callers decide whether to tell the model (in its own prompt) that it
  // actually has live search available — never claim that for a provider
  // where createChatCompletion wouldn't actually attach the tool.
  isSearchGroundingEnabled(): boolean {
    return shouldUseGeminiGrounding();
  }

  async createChatCompletion(messages: ChatMessage[]): Promise<string> {
    if (shouldUseGeminiGrounding()) {
      return this.createGeminiGroundedCompletion(messages);
    }

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

  private async createGeminiGroundedCompletion(messages: ChatMessage[]): Promise<string> {
    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    const systemMessage = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const systemInstruction = systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined;

    try {
      return await this.callGeminiGenerateContent(model, contents, systemInstruction, true);
    } catch (error) {
      // Google Search grounding is unavailable on Gemini's free tier (no
      // billing configured on the project) and can also fail from quota or
      // a transient outage — none of that should take down the whole AI
      // assistant when the model could've answered fine without searching.
      // Retry once, ungrounded, before giving up.
      this.logger.warn(
        `Gemini grounded call failed, retrying without search grounding: ${(error as Error).message}`,
      );
      return this.callGeminiGenerateContent(model, contents, systemInstruction, false);
    }
  }

  private async callGeminiGenerateContent(
    model: string,
    contents: { role: string; parts: { text: string }[] }[],
    systemInstruction: { parts: { text: string }[] } | undefined,
    withSearch: boolean,
  ): Promise<string> {
    const body = {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_NATIVE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.OPENAI_API_KEY ?? '',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Never log the response body here — it can echo back request details.
      this.logger.error(`Gemini call failed: status=${response.status} withSearch=${withSearch}`);
      throw new Error(`Gemini call failed with status ${response.status}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts
          .map((p: { text?: string }) => p.text ?? '')
          .join('')
          .trim()
      : '';
    if (!text) {
      throw new ServiceUnavailableException('Gemini returned an empty response');
    }
    return text;
  }
}
