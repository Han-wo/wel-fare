import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(UserProfile) private profileRepo: Repository<UserProfile>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('이미 사용 중인 이메일입니다');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
    });
    const savedUser = await this.userRepo.save(user);

    const profile = this.profileRepo.create({
      userId: savedUser.id,
      birthDate: dto.birthDate,
      gender: dto.gender,
      sidoCode: dto.sidoCode,
      sigunguCode: dto.sigunguCode,
      dongName: dto.dongName,
      householdType: dto.householdType,
      householdCount: dto.householdCount,
      occupationType: dto.occupationType,
      incomeBracket: dto.incomeBracket,
      annualIncome: dto.annualIncome,
      isHomeowner: dto.isHomeowner,
      isDisabled: dto.isDisabled ?? false,
      disabilityGrade: dto.disabilityGrade,
      isVeteran: dto.isVeteran ?? false,
      isSingleParent: dto.isSingleParent ?? false,
      hasChildren: dto.hasChildren ?? false,
      childrenCount: dto.childrenCount ?? 0,
    });
    await this.profileRepo.save(profile);

    return this.generateTokens(savedUser);
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user?.passwordHash) throw new UnauthorizedException('이메일 또는 비밀번호가 틀립니다');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('이메일 또는 비밀번호가 틀립니다');

    return this.generateTokens(user);
  }

  generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
      }),
    };
  }
}
