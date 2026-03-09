/**
 * 중앙부처 복지서비스 공공API → Qdrant + Neo4j 적재 시더
 *
 * 실행: ts-node --transpile-only src/database/seeds/welfare-api.seed.ts
 */
import axios from 'axios';
import * as xml2js from 'xml2js';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';

// ── 설정 ─────────────────────────────────────────────────
const WELFARE_API_KEY =
  process.env.WELFARE_API_KEY ?? '';
const WELFARE_BASE_URL =
  'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001';
const PAGE_SIZE = 100;
const EMBED_BATCH = 20; // 한 번에 임베딩할 정책 수
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    process.env.NEO4J_PASSWORD ?? 'welfare_neo4j_pass',
  ),
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── 타입 ─────────────────────────────────────────────────
interface PolicyListItem {
  servId: string;
  servNm: string;
  jurMnofNm: string;
  jurOrgNm?: string;
  servDgst: string;
  lifeArray?: string;
  trgterIndvdlArray?: string;
  intrsThemaArray?: string;
  onapPsbltYn?: string;
  sprtCycNm?: string;
  srvPvsnNm?: string;
}

interface PolicyDetail extends PolicyListItem {
  tgtrDtlCn?: string;   // 대상자 상세
  slctCritCn?: string;  // 선정기준
  alwServCn?: string;   // 지원서비스 내용
  wlfareInfoOutlCn?: string; // 복지서비스 개요
  crtrYr?: string;      // 기준연도
}

// ── 유틸 ─────────────────────────────────────────────────
function cleanText(text?: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();
}

function buildPageContent(p: PolicyDetail): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${p.servNm}`);
  parts.push(`[주관부처] ${p.jurMnofNm}${p.jurOrgNm ? ' ' + p.jurOrgNm : ''}`);
  if (p.wlfareInfoOutlCn || p.servDgst)
    parts.push(`[개요] ${cleanText(p.wlfareInfoOutlCn || p.servDgst)}`);
  if (p.lifeArray) parts.push(`[생애주기] ${p.lifeArray}`);
  if (p.trgterIndvdlArray) parts.push(`[대상자] ${p.trgterIndvdlArray}`);
  if (p.intrsThemaArray) parts.push(`[주제] ${p.intrsThemaArray}`);
  if (p.tgtrDtlCn) parts.push(`[대상자 상세]\n${cleanText(p.tgtrDtlCn)}`);
  if (p.slctCritCn) parts.push(`[선정기준]\n${cleanText(p.slctCritCn)}`);
  if (p.alwServCn) parts.push(`[지원내용]\n${cleanText(p.alwServCn)}`);
  if (p.sprtCycNm) parts.push(`[지원주기] ${p.sprtCycNm}`);
  if (p.srvPvsnNm) parts.push(`[제공유형] ${p.srvPvsnNm}`);
  if (p.onapPsbltYn === 'Y') parts.push(`[온라인신청] 가능`);
  parts.push(`[신청링크] https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`);
  return parts.join('\n');
}

// ── API 호출 ─────────────────────────────────────────────
async function parseXml(xml: string): Promise<Record<string, unknown>> {
  return xml2js.parseStringPromise(xml, { explicitArray: false, trim: true });
}

async function fetchList(pageNo: number): Promise<{ total: number; items: PolicyListItem[] }> {
  const { data } = await axios.get(`${WELFARE_BASE_URL}/NationalWelfarelistV001`, {
    params: { serviceKey: WELFARE_API_KEY, numOfRows: PAGE_SIZE, pageNo, srchKeyCode: '003' },
  });
  const parsed = await parseXml(data);
  const root = parsed.wantedList as Record<string, unknown>;
  const total = parseInt(root.totalCount as string, 10);
  const rawItems = root.servList;
  if (!rawItems) return { total, items: [] };
  const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
  return {
    total,
    items: arr.map((i: Record<string, string>) => ({
      servId: i.servId,
      servNm: i.servNm,
      jurMnofNm: i.jurMnofNm,
      jurOrgNm: i.jurOrgNm,
      servDgst: i.servDgst,
      lifeArray: i.lifeArray,
      trgterIndvdlArray: i.trgterIndvdlArray,
      intrsThemaArray: i.intrsThemaArray,
      onapPsbltYn: i.onapPsbltYn,
      sprtCycNm: i.sprtCycNm,
      srvPvsnNm: i.srvPvsnNm,
    })),
  };
}

async function fetchDetail(servId: string): Promise<Partial<PolicyDetail>> {
  try {
    const { data } = await axios.get(`${WELFARE_BASE_URL}/NationalWelfaredetailedV001`, {
      params: { serviceKey: WELFARE_API_KEY, servId },
      timeout: 10000,
    });
    const parsed = await parseXml(data);
    const d = parsed.wantedDtl as Record<string, string>;
    return {
      tgtrDtlCn: d.tgtrDtlCn,
      slctCritCn: d.slctCritCn,
      alwServCn: d.alwServCn,
      wlfareInfoOutlCn: d.wlfareInfoOutlCn,
      crtrYr: d.crtrYr,
    };
  } catch {
    return {};
  }
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(policies: PolicyDetail[], embeddings: number[][]): Promise<void> {
  const points = policies.map((p, i) => ({
    id: Buffer.from(p.servId).reduce((acc, b) => acc * 256 + b, 0) % 2147483647,
    vector: embeddings[i],
    payload: {
      policyId: p.servId,
      policyName: p.servNm,
      category: p.intrsThemaArray ?? '',
      ministry: p.jurMnofNm,
      lifeStage: p.lifeArray ?? '',
      targetGroup: p.trgterIndvdlArray ?? '',
      onlineApply: p.onapPsbltYn === 'Y',
      supportCycle: p.sprtCycNm ?? '',
      provisionType: p.srvPvsnNm ?? '',
      content: buildPageContent(p),
      applyUrl: `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${p.servId}`,
      status: 'active',
      source: 'bokjiro',
    },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(policies: PolicyDetail[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const p of policies) {
      await session.run(
        `
        MERGE (pol:Policy {id: $id})
        SET pol.name = $name,
            pol.ministry = $ministry,
            pol.summary = $summary,
            pol.onlineApply = $onlineApply,
            pol.supportCycle = $supportCycle,
            pol.provisionType = $provisionType,
            pol.source = 'bokjiro',
            pol.updatedAt = datetime()
        `,
        {
          id: p.servId,
          name: p.servNm,
          ministry: p.jurMnofNm,
          summary: cleanText(p.servDgst),
          onlineApply: p.onapPsbltYn === 'Y',
          supportCycle: p.sprtCycNm ?? '',
          provisionType: p.srvPvsnNm ?? '',
        },
      );

      // 생애주기 관계
      if (p.lifeArray) {
        const stages = p.lifeArray.split(',').map((s) => s.trim()).filter(Boolean);
        for (const stage of stages) {
          await session.run(
            `
            MERGE (ls:LifeStage {name: $name})
            WITH ls
            MATCH (pol:Policy {id: $id})
            MERGE (pol)-[:TARGETS_LIFE_STAGE]->(ls)
            `,
            { name: stage, id: p.servId },
          );
        }
      }

      // 주제 관계
      if (p.intrsThemaArray) {
        const themes = p.intrsThemaArray.split(',').map((s) => s.trim()).filter(Boolean);
        for (const theme of themes) {
          await session.run(
            `
            MERGE (th:Theme {name: $name})
            WITH th
            MATCH (pol:Policy {id: $id})
            MERGE (pol)-[:HAS_THEME]->(th)
            `,
            { name: theme, id: p.servId },
          );
        }
      }

      // 대상자 관계
      if (p.trgterIndvdlArray) {
        const targets = p.trgterIndvdlArray.split(',').map((s) => s.trim()).filter(Boolean);
        for (const target of targets) {
          await session.run(
            `
            MERGE (tg:TargetGroup {name: $name})
            WITH tg
            MATCH (pol:Policy {id: $id})
            MERGE (pol)-[:TARGETS_GROUP]->(tg)
            `,
            { name: target, id: p.servId },
          );
        }
      }
    }
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🚀 복지서비스 공공API 데이터 적재 시작');

  // 1. 전체 목록 수집
  console.log('📋 정책 목록 수집 중...');
  const allItems: PolicyListItem[] = [];
  const { total, items: firstPage } = await fetchList(1);
  allItems.push(...firstPage);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  console.log(`   총 ${total}개 정책, ${totalPages} 페이지`);

  for (let page = 2; page <= totalPages; page++) {
    const { items } = await fetchList(page);
    allItems.push(...items);
    process.stdout.write(`   페이지 ${page}/${totalPages}\r`);
  }
  console.log(`\n✅ 목록 수집 완료: ${allItems.length}개`);

  // 2. 상세 정보 수집 + 임베딩 + 저장 (배치)
  console.log('🔍 상세 조회 + 임베딩 + 저장 중...');
  for (let i = 0; i < allItems.length; i += EMBED_BATCH) {
    const batch = allItems.slice(i, i + EMBED_BATCH);

    // 상세 조회
    const details = await Promise.all(
      batch.map(async (item) => {
        const detail = await fetchDetail(item.servId);
        return { ...item, ...detail } as PolicyDetail;
      }),
    );

    // 임베딩
    const texts = details.map(buildPageContent);
    const embeddings = await embedTexts(texts);

    // Qdrant 저장
    await upsertToQdrant(details, embeddings);

    // Neo4j 저장
    await upsertToNeo4j(details);

    const done = Math.min(i + EMBED_BATCH, allItems.length);
    console.log(`   [${done}/${allItems.length}] 처리 완료`);
  }

  console.log('🎉 모든 복지 정책 데이터 적재 완료!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await neo4jDriver.close();
  });
