import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePointMappingDto } from './dto/create-point-mapping.dto';

@Injectable()
export class PointMappingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePointMappingDto) {
    const [oldPoint, newPoint] = await Promise.all([
      this.prisma.probyPoint.findUnique({ where: { id: dto.oldPointId } }),
      this.prisma.probyPoint.findUnique({ where: { id: dto.newPointId } }),
    ]);
    if (!oldPoint || !newPoint) {
      throw new NotFoundException('One or both proby points not found');
    }
    try {
      return await this.prisma.pointMapping.create({ data: dto });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('This point mapping already exists');
      }
      throw err;
    }
  }
}
