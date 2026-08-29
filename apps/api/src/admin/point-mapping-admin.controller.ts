import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { PointMappingAdminService } from './point-mapping-admin.service';
import { CreatePointMappingDto } from './dto/create-point-mapping.dto';

@UseGuards(AdminKeyGuard)
@Controller('admin/point-mappings')
export class PointMappingAdminController {
  constructor(private readonly service: PointMappingAdminService) {}

  @Post()
  create(@Body() dto: CreatePointMappingDto) {
    return this.service.create(dto);
  }
}
