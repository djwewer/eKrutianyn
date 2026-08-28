import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { CreateKurinDto } from './dto/create-kurin.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { KurinsAdminService } from './kurins-admin.service';

@UseGuards(AdminKeyGuard)
@Controller('admin/kurins')
export class KurinsAdminController {
  constructor(private readonly service: KurinsAdminService) {}

  @Post()
  create(@Body() dto: CreateKurinDto) {
    return this.service.createKurin(dto);
  }

  @Post('zvyazkovyi')
  createZvyazkovyi(@Body() dto: CreateAdminUserDto) {
    return this.service.createFirstZvyazkovyi(dto);
  }
}
