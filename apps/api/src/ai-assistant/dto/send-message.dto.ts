import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsUUID() probyPointId: string;
  @IsString() @IsNotEmpty() content: string;
}
