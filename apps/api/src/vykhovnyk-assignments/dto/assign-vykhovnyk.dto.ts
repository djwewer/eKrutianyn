import { IsUUID } from 'class-validator';

export class AssignVykhovnykDto {
  @IsUUID() vykhovnykId: string;
  @IsUUID() hurtokId: string;
}
