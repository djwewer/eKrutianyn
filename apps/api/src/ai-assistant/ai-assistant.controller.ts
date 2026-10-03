import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Get('conversation')
  getConversation(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getConversation(user);
  }

  @Post('messages')
  sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.sendMessage(dto, user);
  }
}
