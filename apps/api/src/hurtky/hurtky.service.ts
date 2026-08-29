import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHurtokDto } from './dto/create-hurtok.dto';

@Injectable()
export class HurtkyService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateHurtokDto, kurinId: string) {
    return this.prisma.hurtok.create({ data: { name: dto.name, number: dto.number, kurinId } });
  }

  listForKurin(kurinId: string) {
    return this.prisma.hurtok.findMany({ where: { kurinId } });
  }
}
