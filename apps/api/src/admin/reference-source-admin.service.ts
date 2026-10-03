import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceSourceFetchService } from '../reference-sources/reference-source-fetch.service';
import { CreateReferenceSourceDto } from './dto/create-reference-source.dto';
import { UpdateReferenceSourceDto } from './dto/update-reference-source.dto';

@Injectable()
export class ReferenceSourceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fetchService: ReferenceSourceFetchService,
  ) {}

  list() {
    return this.prisma.referenceSource.findMany({
      include: { probyPoint: { select: { id: true, description: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateReferenceSourceDto) {
    return this.prisma.referenceSource.create({ data: dto });
  }

  async update(id: string, dto: UpdateReferenceSourceDto) {
    const source = await this.prisma.referenceSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Reference source not found');
    return this.prisma.referenceSource.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    const source = await this.prisma.referenceSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Reference source not found');
    await this.prisma.referenceSource.delete({ where: { id } });
  }

  async fetchNow(id: string) {
    const source = await this.prisma.referenceSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Reference source not found');
    await this.fetchService.refreshOne(id);
    return this.prisma.referenceSource.findUnique({ where: { id } });
  }

  fetchAllNow() {
    return this.fetchService.refreshAll();
  }
}
