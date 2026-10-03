import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiMessageRole, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ProbyProgressService } from '../proby-progress/proby-progress.service';
import { OpenAiService, ChatMessage } from './openai.service';
import { SendMessageDto } from './dto/send-message.dto';

const HISTORY_LIMIT = 20;

type EligiblePoint = {
  id: string;
  description: string;
  category: {
    id: string;
    name: string;
    stageId: string;
    stage: { id: string; name: string; programId: string };
  };
};

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiService: OpenAiService,
    private readonly probyProgressService: ProbyProgressService,
  ) {}

  async getConversation(actor: CurrentUserPayload) {
    const conversation = await this.getOrCreateConversation(actor.userId);
    const messages = await this.serializeMessages(conversation.id);
    return { id: conversation.id, messages };
  }

  async sendMessage(dto: SendMessageDto, actor: CurrentUserPayload) {
    const point = await this.loadEligiblePoint(dto.probyPointId, actor);
    const conversation = await this.getOrCreateConversation(actor.userId);
    const systemPrompt = this.buildSystemPrompt(point);

    const recentHistory = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    // The query above returns the most-recent-first; re-order chronologically before
    // handing the transcript to the model.
    const chronologicalHistory = [...recentHistory].reverse();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chronologicalHistory.map((message) => ({
        role: (message.role === AiMessageRole.USER ? 'user' : 'assistant') as 'user' | 'assistant',
        content: message.content,
      })),
      { role: 'user', content: dto.content },
    ];

    // The junak did send this message regardless of what happens next, so it is
    // persisted before we even attempt the OpenAI call.
    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: AiMessageRole.USER,
        content: dto.content,
        probyPointId: dto.probyPointId,
      },
    });

    let reply: string;
    try {
      reply = await this.openAiService.createChatCompletion(messages);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      // Never surface the raw SDK error (it can carry request headers, including the
      // API key) back to the client or into a log line here — only a generic message.
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

  private async loadEligiblePoint(pointId: string, actor: CurrentUserPayload): Promise<EligiblePoint> {
    const kurin = await this.prisma.kurin.findUnique({ where: { id: actor.kurinId } });
    if (!kurin) {
      throw new NotFoundException('Proby point not found');
    }

    const point = await this.prisma.probyPoint.findUnique({
      where: { id: pointId },
      include: { category: { include: { stage: true } } },
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

    return point;
  }

  private buildSystemPrompt(point: EligiblePoint): string {
    return `Ти — AI-виховник, асистент для юнака пластового куреня, який готується до проби.

Юнак зараз працює над точкою:
Ступінь: ${point.category.stage.name}
Категорія: ${point.category.name}
Точка: ${point.description}

Твоя задача:
1. Якщо прохання юнака справді стосується підготовки до ЦІЄЇ точки — підготуй для нього стислий, інформативний документ, яким він може скористатися для підготовки. Без зайвої води, без філерних фраз — лише те, що реально потрібно знати чи вміти для цієї точки.
2. Якщо прохання юнака НЕ відповідає тому, що реально вимагає ця точка (наприклад, він просить щось значно ширше, вужче, або геть не пов'язане з наведеним описом) — НЕ виконуй прохання як є. Прямо скажи, що саме вимагає ця точка за офіційним описом, і запропонуй підготувати матеріал саме під цю вимогу. Запитай окреме підтвердження, перш ніж продовжити.
3. Якщо прохання юнака взагалі не стосується підготовки до проби чи пластового життя (наприклад, прохання виконати шкільне домашнє завдання, написати код для стороннього проекту, чи будь-яке інше завдання, не пов'язане з точкою проби) — ввічливо відмов і поясни, що ти допомагаєш тільки з підготовкою до точок проби.

Завжди лишайся доброзичливим, говори українською мовою.`;
  }

  private async getOrCreateConversation(userId: string) {
    const existing = await this.prisma.aiConversation.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }
    return this.prisma.aiConversation.create({ data: { userId } });
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
