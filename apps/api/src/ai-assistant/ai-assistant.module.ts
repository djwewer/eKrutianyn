import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProbyProgressModule } from '../proby-progress/proby-progress.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { OpenAiService } from './openai.service';

@Module({
  imports: [AuthModule, ProbyProgressModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, OpenAiService],
})
export class AiAssistantModule {}
