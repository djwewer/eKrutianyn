import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiMessageRole, KurinGender, Role } from '@prisma/client';
import { APIError } from 'openai';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from '../proby-progress/proby-progress.service';
import { OpenAiService, ChatMessage } from './openai.service';
import { SendMessageDto } from './dto/send-message.dto';

const HISTORY_LIMIT = 20;
const TITLE_MAX_LENGTH = 60;
// Caps how many messages a single JUNAK can send per rolling 24h window —
// without this, one enthusiastic (or careless) junak could burn through a
// kurin's whole token/search budget in a single day. Only JUNAK is capped:
// ZVYAZKOVYI is the one trusted adult account per kurin, typically far fewer
// in number and already relied on for day-to-day admin, so it's left
// unlimited. Configurable (not code) since the right number depends on the
// kurin's actual usage and budget — not something to hardcode confidently.
const JUNAK_DAILY_MESSAGE_LIMIT = Number(process.env.AI_ASSISTANT_JUNAK_DAILY_MESSAGE_LIMIT ?? '20');
const DAILY_MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Each linked ReferenceSource's cached text is already capped at 8000 chars
// in the DB; truncated further here so one page (or several linked to the
// same point) can't blow out the whole system prompt's size/cost.
const SOURCE_PROMPT_TEXT_MAX_LENGTH = 3000;

type EligiblePoint = {
  id: string;
  description: string;
  referenceText: string | null;
  referenceSources: { label: string; extractedText: string | null }[];
  category: {
    id: string;
    name: string;
    stageId: string;
    stage: { id: string; name: string; programId: string };
  };
};

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiService: OpenAiService,
    private readonly probyProgressService: ProbyProgressService,
  ) {}

  async listConversations(actor: CurrentUserPayload) {
    const conversations = await this.prisma.aiConversation.findMany({
      where: { userId: actor.userId },
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async createConversation(actor: CurrentUserPayload) {
    const conversation = await this.prisma.aiConversation.create({ data: { userId: actor.userId } });
    return { id: conversation.id, title: conversation.title, messages: [] };
  }

  async getConversation(conversationId: string, actor: CurrentUserPayload) {
    const conversation = await this.findOwnedConversation(conversationId, actor);
    const messages = await this.serializeMessages(conversation.id);
    return { id: conversation.id, title: conversation.title, messages };
  }

  async sendMessage(conversationId: string, dto: SendMessageDto, actor: CurrentUserPayload) {
    const conversation = await this.findOwnedConversation(conversationId, actor);
    // Checked before any paid work (prompt build, AI call) so a junak over
    // their limit never costs a single token or search query.
    if (actor.role === Role.JUNAK) {
      await this.enforceJunakDailyMessageLimit(actor.userId);
    }
    const { point, kurinGender } = await this.loadEligiblePoint(dto.probyPointId, actor);

    const recentHistory = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    // The query above returns the most-recent-first; re-order chronologically before
    // handing the transcript to the model.
    const chronologicalHistory = [...recentHistory].reverse();
    const isFirstMessage = recentHistory.length === 0;

    const systemPrompt = this.buildSystemPrompt(point, kurinGender, isFirstMessage);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chronologicalHistory.map((message) => ({
        role: (message.role === AiMessageRole.USER ? 'user' : 'assistant') as 'user' | 'assistant',
        content: message.content,
      })),
      { role: 'user', content: dto.content },
    ];

    // The junak did send this message regardless of what happens next, so it is
    // persisted before we even attempt the OpenAI call. Bumps updatedAt (used to
    // order the conversation list) via the auto-title write below, or directly
    // here when this isn't the first message.
    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: AiMessageRole.USER,
        content: dto.content,
        probyPointId: dto.probyPointId,
      },
    });

    if (isFirstMessage && !conversation.title) {
      await this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: { title: dto.content.slice(0, TITLE_MAX_LENGTH) },
      });
    } else {
      // Touch updatedAt so the conversation list sorts by latest activity.
      await this.prisma.aiConversation.update({ where: { id: conversation.id }, data: {} });
    }

    let reply: string;
    try {
      reply = await this.openAiService.createChatCompletion(messages);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      // Log only safe, structured fields from the SDK's APIError (status/name/code) —
      // never the full error object or anything from process.env, since the raw SDK
      // error can carry request headers, including the API key.
      if (error instanceof APIError) {
        this.logger.error(
          `OpenAI call failed: status=${error.status} name=${error.name} code=${error.code}`,
        );
      } else {
        this.logger.error(`OpenAI call failed: name=${(error as Error)?.name}`);
      }
      throw new ServiceUnavailableException('AI assistant is temporarily unavailable');
    }

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: AiMessageRole.ASSISTANT,
        content: reply,
        probyPointId: dto.probyPointId,
      },
    });

    const updatedMessages = await this.serializeMessages(conversation.id);
    return { reply, messages: updatedMessages };
  }

  async deleteConversation(conversationId: string, actor: CurrentUserPayload) {
    await this.findOwnedConversation(conversationId, actor);
    // Messages have an ON DELETE RESTRICT fk to their conversation, so they must
    // go first; both in one transaction so a failure can't leave an orphaned
    // conversation with no messages or vice versa.
    await this.prisma.$transaction([
      this.prisma.aiMessage.deleteMany({ where: { conversationId } }),
      this.prisma.aiConversation.delete({ where: { id: conversationId } }),
    ]);
  }

  private async findOwnedConversation(conversationId: string, actor: CurrentUserPayload) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    // Same 404 whether the conversation doesn't exist at all or belongs to someone
    // else — don't leak which, and never let a user address another user's chat.
    if (!conversation || conversation.userId !== actor.userId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private async enforceJunakDailyMessageLimit(userId: string): Promise<void> {
    const windowStart = new Date(Date.now() - DAILY_MESSAGE_WINDOW_MS);
    const sentInWindow = await this.prisma.aiMessage.count({
      where: {
        role: AiMessageRole.USER,
        conversation: { userId },
        createdAt: { gte: windowStart },
      },
    });
    if (sentInWindow >= JUNAK_DAILY_MESSAGE_LIMIT) {
      throw new HttpException(
        `Досягнуто денного ліміту повідомлень AI-виховника (${JUNAK_DAILY_MESSAGE_LIMIT} за добу). Спробуй знову пізніше.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async loadEligiblePoint(
    pointId: string,
    actor: CurrentUserPayload,
  ): Promise<{ point: EligiblePoint; kurinGender: KurinGender }> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: actor.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Proby point not found');
    }

    const point = await this.prisma.probyPoint.findUnique({
      where: { id: pointId },
      include: {
        category: { include: { stage: true } },
        referenceSources: { select: { label: true, extractedText: true } },
      },
    });

    if (!point || point.category.stage.programId !== kurin.probyProgramId) {
      // Deliberately the same 404 whether the point doesn't exist at all or simply
      // isn't part of this actor's kurin's program — don't leak which.
      throw new NotFoundException('Proby point not found');
    }

    if (actor.role === Role.JUNAK) {
      const { points, stages } = await this.probyProgressService.getProgressFor(actor.userId, actor);
      const pointProgress = points.find((p) => p.pointId === pointId);
      const pointStatus = pointProgress?.status ?? 'NOT_DONE';
      const stageStatus = stages.find((s) => s.stageId === point.category.stageId)?.status;

      if (pointStatus === 'DONE' || stageStatus === 'LOCKED') {
        throw new BadRequestException('This point is not currently eligible for AI assistance');
      }
    }
    // ZVYAZKOVYI: no point/stage filtering at all — any point in the kurin's program
    // is accepted, by design (see Global Constraints).

    return { point, kurinGender: kurin.gender };
  }

  private buildSystemPrompt(point: EligiblePoint, kurinGender: KurinGender, isFirstMessage: boolean): string {
    // Additive only: a point with no curated referenceText yet gets the exact
    // same prompt as before this field existed. Appended after the point's own
    // description so the verbatim guardrail instructions below are untouched.
    const referenceBlock = point.referenceText
      ? `\n\nДовідковий матеріал для цієї точки (перевірені факти — дати, імена, цифри):\n${point.referenceText}\n\nКоли наводиш конкретні дати, імена чи цифри — бери їх лише з цього довідкового матеріалу. Якщо потрібного факту там немає, прямо скажи, що не маєш точних даних, а не вигадуй його.`
      : '';
    const sourcesBlock = this.buildReferenceSourcesBlock(point.referenceSources);
    // Only true for providers where createChatCompletion actually attaches a
    // search tool (currently: Gemini via its native API) — never claim this
    // capability to the model for a provider that doesn't really have it.
    const searchBlock = this.openAiService.isSearchGroundingEnabled()
      ? `\n\nУ тебе є доступ до пошуку в інтернеті, але це — крайній засіб, не перший крок. Спочатку завжди намагайся відповісти на основі довідкового матеріалу вище та власних знань. Звертайся до пошуку лише тоді, коли для відповіді дійсно потрібен конкретний факт (дата, ім'я, цифра, актуальна подія), якого немає в довідковому матеріалі і в якому ти не впевнений — а не вигадуй його. Не використовуй пошук, якщо можеш відповісти і без нього: кожен виклик пошуку коштує ресурсів спільноти, тож він має лишатися рідкісним винятком, а не звичкою.`
      : '';

    const greetingWord = kurinGender === KurinGender.FEMALE ? 'подруго' : 'друже';
    const greetingInstruction = isFirstMessage
      ? `Це перше повідомлення в розмові — почни відповідь рівно зі слів "СКОБ, ${greetingWord}!" на окремому рядку, і більше нічого в привітання не додавай. Не вигадуй інших форм привітання (ніколи не пиши "Спе Скобе" чи подібне).`
      : `Це не перше повідомлення в розмові — не вітайся словом "СКОБ" знову, одразу переходь до відповіді.`;

    return `Ти — AI-виховник, асистент для юнака пластового куреня, який готується до проби.

${greetingInstruction}

Юнак зараз працює над точкою:
Ступінь: ${point.category.stage.name}
Категорія: ${point.category.name}
Точка: ${point.description}${referenceBlock}${sourcesBlock}${searchBlock}

Твоя задача:
1. Якщо прохання юнака справді стосується підготовки до ЦІЄЇ точки — підготуй для нього стислий, інформативний документ, яким він може скористатися для підготовки. Без зайвої води, без філерних фраз — лише те, що реально потрібно знати чи вміти для цієї точки.
2. Якщо прохання юнака НЕ відповідає тому, що реально вимагає ця точка (наприклад, він просить щось значно ширше, вужче, або геть не пов'язане з наведеним описом) — НЕ виконуй прохання як є. Прямо скажи, що саме вимагає ця точка за офіційним описом, і запропонуй підготувати матеріал саме під цю вимогу. Запитай окреме підтвердження, перш ніж продовжити.
3. Якщо прохання юнака взагалі не стосується підготовки до проби чи пластового життя (наприклад, прохання виконати шкільне домашнє завдання, написати код для стороннього проекту, чи будь-яке інше завдання, не пов'язане з точкою проби) — ввічливо відмов і поясни, що ти допомагаєш тільки з підготовкою до точок проби.

Формат відповіді — суворо:
- Жодних вступних фраз перед матеріалом: не пиши "Ось стислий і структурований матеріал...", "Залюбки допоможу...", "Ось інформація, яка тобі знадобиться..." чи щось подібне. Одразу після привітання (якщо воно є) переходь до самого матеріалу по суті.
- Жодних завершальних фраз-філерів на кшталт "Сподіваюсь, це допоможе", "Готуйся, і все пройде чудово", "Чи маєш ще питання" — просто закінчуй матеріалом, без закруглення розмови зайвими реченнями.

Завжди лишайся доброзичливим, говори українською мовою.`;
  }

  private buildReferenceSourcesBlock(sources: { label: string; extractedText: string | null }[]): string {
    // Only sources that have actually been fetched at least once contribute —
    // a source whose weekly cron run hasn't happened yet (or keeps failing)
    // just isn't mentioned, same as a point with no referenceText at all.
    const fetched = sources.filter((s): s is { label: string; extractedText: string } => !!s.extractedText);
    if (fetched.length === 0) return '';

    const sections = fetched
      .map((s) => `--- ${s.label} ---\n${s.extractedText.slice(0, SOURCE_PROMPT_TEXT_MAX_LENGTH)}`)
      .join('\n\n');
    return `\n\nДодаткові джерела, автоматично завантажені з інтернету (оновлюються раз на тиждень, можуть бути неповними):\n${sections}\n\nЯкщо потрібного факту чи тексту (наприклад, слів пісні) немає і в цих джерелах — прямо скажи, що не маєш його, а не вигадуй.`;
  }

  private async serializeMessages(conversationId: string) {
    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
      probyPointId: message.probyPointId,
      createdAt: message.createdAt,
    }));
  }
}
