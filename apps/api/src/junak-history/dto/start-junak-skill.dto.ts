import { IsUUID } from 'class-validator';

export class StartJunakSkillDto {
  @IsUUID() levelId: string;
}
