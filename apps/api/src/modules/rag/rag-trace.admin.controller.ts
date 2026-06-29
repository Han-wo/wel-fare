import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RagTraceService } from './rag-trace.service';
import type { RagTraceStatus } from './entities/rag-trace.entity';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/traces')
export class RagTraceAdminController {
  constructor(private readonly ragTraceService: RagTraceService) {}

  @Get()
  @ApiOperation({ summary: '최근 RAG 추적 로그 목록 조회' })
  getRecentTraces(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.ragTraceService.getRecentTraces(limit, sessionId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'RAG run 대시보드 통계 (상태 분포·에러율·지연·환각)' })
  getStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ragTraceService.getStats({ from, to });
  }

  @Get('search')
  @ApiOperation({ summary: 'RAG run 히스토리 조회 (필터·페이지네이션)' })
  search(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('status') status?: string,
    @Query('routeType') routeType?: string,
    @Query('model') model?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('errorsOnly') errorsOnly?: string,
  ) {
    return this.ragTraceService.listTraces({
      limit,
      offset,
      status: status as RagTraceStatus | undefined,
      routeType,
      model,
      q,
      from,
      to,
      errorsOnly: errorsOnly === 'true' || errorsOnly === '1',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'RAG 추적 로그 상세 조회' })
  getTrace(@Param('id') id: string) {
    return this.ragTraceService.getTrace(id);
  }
}
