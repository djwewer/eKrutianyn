import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { AdminCredentialsGuard } from '../common/guards/admin-credentials.guard';
import { ReferenceSourceAdminService } from './reference-source-admin.service';
import { CreateReferenceSourceDto } from './dto/create-reference-source.dto';
import { UpdateReferenceSourceDto } from './dto/update-reference-source.dto';

@UseGuards(AdminKeyGuard, AdminCredentialsGuard)
@Controller('admin/reference-sources')
export class ReferenceSourceAdminController {
  constructor(private readonly service: ReferenceSourceAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateReferenceSourceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReferenceSourceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/fetch-now')
  fetchNow(@Param('id') id: string) {
    return this.service.fetchNow(id);
  }

  @Post('fetch-all')
  fetchAllNow() {
    return this.service.fetchAllNow();
  }
}
