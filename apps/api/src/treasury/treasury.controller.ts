import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { TreasuryService } from './treasury.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateStartingBalanceDto } from './dto/update-starting-balance.dto';

@UseGuards(JwtAuthGuard)
@Controller('kurins/:kurinId/treasury')
export class TreasuryController {
  constructor(private readonly service: TreasuryService) {}

  @Get()
  getSummary(@Param('kurinId') kurinId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getSummary(kurinId, user);
  }

  @Patch('starting-balance')
  updateStartingBalance(
    @Param('kurinId') kurinId: string,
    @Body() dto: UpdateStartingBalanceDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateStartingBalance(kurinId, dto, user);
  }

  @Post('transactions')
  createTransaction(
    @Param('kurinId') kurinId: string,
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createTransaction(kurinId, dto, user);
  }

  @Delete('transactions/:transactionId')
  removeTransaction(
    @Param('kurinId') kurinId: string,
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.deleteTransaction(kurinId, transactionId, user);
  }
}
