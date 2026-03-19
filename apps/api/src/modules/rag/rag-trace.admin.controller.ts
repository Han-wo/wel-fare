import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RagTraceService } from './rag-trace.service';

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

  @Get(':id')
  @ApiOperation({ summary: 'RAG 추적 로그 상세 조회' })
  getTrace(@Param('id') id: string) {
    return this.ragTraceService.getTrace(id);
  }
}
