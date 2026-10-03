import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AiAssistantService } from './ai-assistant.service';
import { SendMessageDto } from './dto/send-message.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.JUNAK, Role.ZVYAZKOVYI)
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly service: AiAssistantService) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listConversations(user);
  }

  @Post('conversations')
  createConversation(@CurrentUser() user: CurrentUserPayload) {
    return this.service.createConversation(user);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getConversation(id, user);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.sendMessage(id, dto, user);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  deleteConversation(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteConversation(id, user);
  }
}
