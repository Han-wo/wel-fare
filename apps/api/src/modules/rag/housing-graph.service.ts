import { Inject, Injectable, Logger } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import { TraceFacade } from './trace-facade.service';
import type { RetrievalItem } from './retrieval.types';
import { buildHousingAnnouncementGraph, buildHousingComplexGraph } from './graph-trace-mapper';
import { NEO4J_DRIVER } from './rag.tokens';

@Injectable()
export class HousingGraphService {
  private readonly logger = new Logger(HousingGraphService.name);

  constructor(
    @Inject(NEO4J_DRIVER) private readonly neo4jDriver: Driver,
    private readonly traceFacade: TraceFacade,
  ) {}

  async fetchHousingAnnouncements(sidoCode: string, traceId?: string): Promise<RetrievalItem[]> {
    const items: RetrievalItem[] = [];
    const session = this.neo4jDriver.session();

    try {
      const annoRes = await session.run(
        `
        MATCH (a:HousingAnnouncement)
        WHERE a.annoDate >= '2025'
        WITH a
        OPTIONAL MATCH (a)-[:AVAILABLE_IN]->(r:Region)
        WITH a, collect(DISTINCT r.name) AS regionNames, collect(DISTINCT r.code) AS regionCodes
        WHERE $sidoCode = '' OR $sidoCode IN regionCodes
        RETURN a, regionNames
        ORDER BY a.annoDate DESC
        LIMIT 10
        `,
        { sidoCode },
      );

      for (const record of annoRes.records) {
        const announcement = record.get('a').properties as Record<string, string>;
        const regionNames = (record.get('regionNames') as string[]).filter(Boolean);
        items.push({
          id: String(announcement.id),
          title: announcement.name,
          source: 'housing_announcement',
          kind: 'HousingAnnouncement',
          score: 0.9,
          content: [
            `[공고명] ${announcement.name}`,
            `[유형] ${announcement.suplyTyNm || '청약'} (${announcement.houseTyNm || '공고 참조'})`,
            regionNames.length ? `[청약지역] ${regionNames.join(', ')}` : '',
            `[공급세대수] ${announcement.suplyHoCo || ''}세대`,
            announcement.annoDate ? `[모집공고일] ${announcement.annoDate}` : '',
            announcement.subscptBgnde
              ? `[청약접수] ${announcement.subscptBgnde} ~ ${announcement.subscptEndde || ''}`
              : '',
            announcement.winnerDate ? `[당첨자발표] ${announcement.winnerDate}` : '',
            announcement.moveInYM ? `[입주예정] ${announcement.moveInYM}` : '',
            `[시행기관] ${announcement.insttNm || ''}`,
            `[신청링크] ${announcement.pcUrl || 'https://www.applyhome.co.kr'}`,
          ]
            .filter(Boolean)
            .join('\n'),
          metadata: {
            ...announcement,
            regionNames,
          },
        });
      }

      if (traceId) {
        const graph = buildHousingAnnouncementGraph(annoRes.records);
        this.traceFacade.recordGraphWalk(traceId, {
          title: 'Neo4j 청약 공고 탐색',
          detail: `${annoRes.records.length}개의 모집공고 노드를 조회했습니다.`,
          nodes: graph.nodes,
          edges: graph.edges,
        });
      }
    } catch (error) {
      this.logger.error('청약공고 Neo4j 조회 오류:', error);
    } finally {
      await session.close();
    }

    return items;
  }

  async fetchHousingComplexes(sidoCode: string, traceId?: string): Promise<RetrievalItem[]> {
    const items: RetrievalItem[] = [];
    const session = this.neo4jDriver.session();

    try {
      const complexRes = await session.run(
        `
        MATCH (h:HousingComplex)-[:LOCATED_IN]->(r:Region)
        WHERE $sidoCode = '' OR r.code = $sidoCode
        RETURN h, r.name AS regionName
        ORDER BY h.hshldCo DESC
        LIMIT 5
        `,
        { sidoCode },
      );

      for (const record of complexRes.records) {
        const complex = record.get('h').properties as Record<string, unknown>;
        const regionName = record.get('regionName') as string;
        items.push({
          id: String(complex.id),
          title: `${regionName} ${String(complex.sigungu ?? '')}`.trim(),
          source: 'housing_complex',
          kind: 'HousingComplex',
          score: 0.85,
          content: [
            `[단지명] ${regionName} ${String(complex.sigungu ?? '')} 공공임대주택`,
            `[유형] LH 공공임대단지`,
            `[주소] ${String(complex.address ?? '')}`,
            `[세대수] ${String(complex.hshldCo ?? '')}세대`,
            `[관리기관] ${String(complex.manager ?? '')}`,
            `[신청링크] https://www.lh.or.kr`,
          ]
            .filter(Boolean)
            .join('\n'),
          metadata: { ...complex, regionName },
        });
      }

      if (traceId) {
        const graph = buildHousingComplexGraph(complexRes.records);
        this.traceFacade.recordGraphWalk(traceId, {
          title: 'Neo4j 공공임대단지 탐색',
          detail: `${complexRes.records.length}개의 임대단지 노드를 조회했습니다.`,
          nodes: graph.nodes,
          edges: graph.edges,
        });
      }
    } catch (error) {
      this.logger.error('주택단지 Neo4j 조회 오류:', error);
    } finally {
      await session.close();
    }

    return items;
  }

  async fetchUpcomingDeadlines(
    sidoCode: string,
    daysAhead: number,
    traceId?: string,
  ): Promise<RetrievalItem[]> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const session = this.neo4jDriver.session();

    try {
      const result = await session.run(
        `
        MATCH (a:HousingAnnouncement)
        WHERE a.subscptBgnde IS NOT NULL AND a.subscptEndde IS NOT NULL
          AND a.subscptBgnde <= $today AND a.subscptEndde >= $today
        OPTIONAL MATCH (a)-[:AVAILABLE_IN]->(r:Region)
        WITH a, collect(DISTINCT r.name) AS regionNames, collect(DISTINCT r.code) AS regionCodes
        WHERE $sidoCode = '' OR $sidoCode IN regionCodes
        RETURN a, regionNames
        ORDER BY a.subscptEndde ASC
        LIMIT 15
        `,
        { today, sidoCode },
      );

      const items = result.records.map((record) => {
        const announcement = record.get('a').properties as Record<string, string>;
        const regionNames = (record.get('regionNames') as string[]).filter(Boolean);
        return {
          id: String(announcement.id),
          title: announcement.name,
          source: 'housing_announcement',
          kind: 'HousingAnnouncement',
          score: 0.95,
          content: [
            `[공고명] ${announcement.name}`,
            regionNames.length ? `[지역] ${regionNames.join(', ')}` : '',
            `[청약기간] ${announcement.subscptBgnde} ~ ${announcement.subscptEndde}`,
            `[공급유형] ${announcement.suplyTyNm || ''}`,
            `[세대수] ${announcement.suplyHoCo || ''}세대`,
            announcement.winnerDate ? `[당첨발표] ${announcement.winnerDate}` : '',
            `[신청링크] ${announcement.pcUrl || 'https://www.applyhome.co.kr'}`,
          ]
            .filter(Boolean)
            .join('\n'),
          metadata: { ...announcement, regionNames, daysAhead },
        };
      });

      if (traceId) {
        const graph = buildHousingAnnouncementGraph(result.records);
        this.traceFacade.recordGraphWalk(traceId, {
          title: 'Neo4j 마감 임박 공고 탐색',
          detail: `${items.length}개의 접수 중 공고를 찾았습니다.`,
          nodes: graph.nodes,
          edges: graph.edges,
        });
      }

      return items;
    } catch (error) {
      this.logger.error('마감 임박 청약 조회 오류:', error);
      return [];
    } finally {
      await session.close();
    }
  }
}

