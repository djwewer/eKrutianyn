import { IsUUID } from 'class-validator';

export class ChangeProbyProgramDto {
  @IsUUID()
  newProgramId: string;
}
