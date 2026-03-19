import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DataSyncService } from './data-sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class DataSyncController {
  constructor(private readonly dataSyncService: DataSyncService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Qdrant + Neo4j 적재 현황 조회' })
  async getStats() {
    const [qdrant, neo4j, sync] = await Promise.all([
      this.dataSyncService.getQdrantStats(),
      this.dataSyncService.getNeo4jStats(),
      Promise.resolve(this.dataSyncService.getSyncStatus()),
    ]);
    return { qdrant, neo4j, sync };
  }

  @Get('stats/qdrant')
  @ApiOperation({ summary: 'Qdrant 벡터 DB 현황' })
  async getQdrantStats() {
    return this.dataSyncService.getQdrantStats();
  }

  @Get('stats/neo4j')
  @ApiOperation({ summary: 'Neo4j 그래프 DB 현황' })
  async getNeo4jStats() {
    return this.dataSyncService.getNeo4jStats();
  }

  @Post('sync')
  @ApiOperation({ summary: '데이터 동기화 수동 트리거 (비동기 실행)' })
  triggerSync() {
    // 논블로킹으로 실행
    this.dataSyncService.runSync('MANUAL').catch(() => {});
    return { message: '동기화 시작됨. GET /api/v1/admin/stats 에서 상태 확인 가능' };
  }

  @Get('sync/logs')
  @ApiOperation({ summary: '최근 데이터 동기화 로그 조회' })
  getRecentLogs(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.dataSyncService.getRecentLogs(limit);
  }

  @Get('sync/sources')
  @ApiOperation({ summary: '동기화 가능한 데이터 소스 목록 조회' })
  getSyncSources() {
    return this.dataSyncService.getSeedCatalog();
  }

  @Post('sync/seeds/:key')
  @ApiOperation({ summary: '개별 시드 동기화 수동 트리거 (비동기 실행)' })
  triggerSeed(@Param('key') key: string) {
    this.dataSyncService.runSeed(key, 'SEED').catch(() => {});
    return { message: `${key} 시드 동기화 시작됨. GET /api/v1/admin/sync/logs 에서 상태 확인 가능` };
  }
}
