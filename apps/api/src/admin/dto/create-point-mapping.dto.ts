import { IsUUID } from 'class-validator';

export class CreatePointMappingDto {
  @IsUUID() oldPointId: string;
  @IsUUID() newPointId: string;
}
