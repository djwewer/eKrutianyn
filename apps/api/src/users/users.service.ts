import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto, actorKurinId: string) {
    if (dto.role === Role.ZVYAZKOVYI) {
      throw new BadRequestException('Cannot self-service create another zvyazkovyi');
    }
    if (dto.role === Role.JUNAK && !dto.hurtokId) {
      throw new BadRequestException('hurtokId is required for JUNAK role');
    }
    if (dto.hurtokId) {
      const hurtok = await this.prisma.hurtok.findUnique({ where: { id: dto.hurtokId } });
      if (!hurtok || hurtok.kurinId !== actorKurinId) {
        throw new NotFoundException('Hurtok not found in this kurin');
      }
    }
    const passwordHash = dto.password ? await this.authService.hashPassword(dto.password) : undefined;
    return this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: dto.role,
        passwordHash,
        kurinId: actorKurinId,
        hurtokId: dto.hurtokId,
      },
    });
  }

  async updateContactInfo(junakId: string, dto: UpdateContactInfoDto, actorKurinId: string) {
    const junak = await this.prisma.user.findUnique({ where: { id: junakId } });
    if (!junak || junak.role !== Role.JUNAK || junak.kurinId !== actorKurinId) {
      throw new NotFoundException('Junak not found');
    }
    return this.prisma.user.update({
      where: { id: junakId },
      data: { notes: dto.notes, phone: dto.phone },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        role: true,
        birthDate: true,
        kurinId: true,
        hurtokId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
