import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesService } from './policies.service';

@ApiTags('Policies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: '정책 목록 (페이지네이션)' })
  findAll(
    @Query('category') category?: string,
    @Query('sidoCode') sidoCode?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.policiesService.findAll({ category, sidoCode, status, page, limit });
  }

  @Get('search')
  @ApiOperation({ summary: '정책 키워드 검색' })
  search(@Query('q') q: string) {
    return this.policiesService.search(q);
  }

  @Get(':id')
  @ApiOperation({ summary: '정책 상세' })
  findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }
}
