import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { AdminCredentialsGuard } from '../common/guards/admin-credentials.guard';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { UpdateKurinDto } from './dto/update-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ForceDeleteKurinDto } from './dto/force-delete-kurin.dto';
import { KurinsAdminService } from './kurins-admin.service';

@UseGuards(AdminKeyGuard, AdminCredentialsGuard)
@Controller('admin/kurins')
export class KurinsAdminController {
  constructor(private readonly service: KurinsAdminService) {}

  @Get()
  list() {
    return this.service.listKurins();
  }

  @Post()
  create(@Body() dto: CreateKurinDto) {
    return this.service.createKurin(dto);
  }

  @Post('zvyazkovyi')
  createZvyazkovyi(@Body() dto: CreateAdminUserDto) {
    return this.service.createFirstZvyazkovyi(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKurinDto) {
    return this.service.updateKurin(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id') id: string) {
    return this.service.setDeactivated(id, true);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id') id: string) {
    return this.service.setDeactivated(id, false);
  }

  @Get(':id/delete-preview')
  deletePreview(@Param('id') id: string) {
    return this.service.deleteKurinPreview(id);
  }

  @Delete(':id/force')
  @HttpCode(204)
  async forceDelete(@Param('id') id: string, @Body() dto: ForceDeleteKurinDto): Promise<void> {
    await this.service.forceDeleteKurin(id, dto.confirmName);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.service.deleteKurin(id);
  }
}
