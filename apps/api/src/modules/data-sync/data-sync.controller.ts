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
      this.dataSyncService.getSyncStatus(),
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
    return this.dataSyncService.startSync('MANUAL');
  }

  @Get('sync/logs')
  @ApiOperation({ summary: '최근 데이터 동기화 로그 조회' })
  getRecentLogs(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.dataSyncService.getRecentLogs(limit);
  }

  @Get('sync/current')
  @ApiOperation({ summary: '현재 실행 중인 동기화 run 진행도 조회' })
  getCurrentRun() {
    return this.dataSyncService.getCurrentRunProgress();
  }

  @Get('sync/runs/:runId')
  @ApiOperation({ summary: '특정 동기화 run 진행도 조회' })
  getRunProgress(@Param('runId') runId: string) {
    return this.dataSyncService.getRunProgress(runId);
  }

  @Get('sync/sources')
  @ApiOperation({ summary: '동기화 가능한 데이터 소스 목록 조회' })
  getSyncSources() {
    return this.dataSyncService.getSeedCatalog();
  }

  @Get('sync/sources/status')
  @ApiOperation({ summary: '데이터 소스별 최신 동기화 상태 조회' })
  getSourceStatuses() {
    return this.dataSyncService.getSourceStatuses();
  }

  @Post('sync/seeds/:key')
  @ApiOperation({ summary: '개별 시드 동기화 수동 트리거 (비동기 실행)' })
  triggerSeed(@Param('key') key: string) {
    return this.dataSyncService.startSeed(key, 'SEED');
  }
}
