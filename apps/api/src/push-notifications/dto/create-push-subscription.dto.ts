import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionKeysDto {
  @IsString() @IsNotEmpty() p256dh: string;
  @IsString() @IsNotEmpty() auth: string;
}

// Matches the shape of the browser's PushSubscription.toJSON() output, which
// is what the frontend posts verbatim after pushManager.subscribe().
export class CreatePushSubscriptionDto {
  @IsString() @IsNotEmpty() endpoint: string;
  @ValidateNested() @Type(() => PushSubscriptionKeysDto) keys: PushSubscriptionKeysDto;
}
