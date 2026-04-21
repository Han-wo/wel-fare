import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  buildRefreshTokenClearCookie,
  buildRefreshTokenSetCookie,
  extractRefreshTokenFromCookieHeader,
} from './auth-cookie.util';

type RefreshCapableRequest = FastifyRequest & {
  body?: {
    refreshToken?: string;
  };
};

type AuthResponsePayload = Awaited<ReturnType<AuthService['login']>>;

function toClientPayload(result: AuthResponsePayload) {
  return {
    accessToken: result.accessToken,
    user: result.user,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(reply: FastifyReply, refreshToken: string) {
    reply.header(
      'set-cookie',
      buildRefreshTokenSetCookie(refreshToken, process.env.NODE_ENV === 'production'),
    );
  }

  @Post('register')
  @ApiOperation({ summary: '회원가입 (프로필 정보 포함)' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(reply, result.refreshToken);
    return toClientPayload(result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '이메일 로그인' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(reply, result.refreshToken);
    return toClientPayload(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access Token 재발급' })
  async refresh(
    @Req() req: RefreshCapableRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken =
      extractRefreshTokenFromCookieHeader(req.headers.cookie) ?? req.body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('refreshToken이 필요합니다');
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(reply, result.refreshToken);
    return toClientPayload(result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그아웃' })
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header(
      'set-cookie',
      buildRefreshTokenClearCookie(process.env.NODE_ENV === 'production'),
    );
    return { success: true };
  }
}
