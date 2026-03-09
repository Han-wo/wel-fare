/**
 * 청약홈 분양정보 API (ApplyhomeInfoDetailSvc) → Qdrant + Neo4j 적재 시더
 *
 * 대상 API (5개):
 *  - getAPTLttotPblancDetail        : APT 분양정보 상세조회
 *  - getUrbtyOfctlLttotPblancDetail : 오피스텔/도시형/민간임대/생활숙박시설 분양정보
 *  - getRemndrLttotPblancDetail      : APT 잔여세대 분양정보 상세조회
 *  - getPblPvtRentLttotPblancDetail  : 공공지원 민간임대 분양정보
 *  - getOPTLttotPblancDetail         : 임의공급 분양정보
 *
 * 실행: ts-node -r dotenv/config --transpile-only src/database/seeds/applyhome.seed.ts
 */
import axios from 'axios';
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = process.env.HOUSING_API_KEY ?? process.env.WELFARE_API_KEY ?? '';
const BASE_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const PER_PAGE = 100;
const EMBED_BATCH = 20;
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

// ── 청약지역 약칭 → Neo4j Region 코드 매핑 ──────────────
const AREA_TO_REGION_CODE: Record<string, string> = {
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '42', '충북': '43', '충남': '44',
  '전북': '45', '전남': '46', '경북': '47', '경남': '48', '제주': '50',
};

// ── 타입 ─────────────────────────────────────────────────
interface ApplyhomeItem {
  HOUSE_MANAGE_NO: string;
  PBLANC_NO: string;
  HOUSE_NM: string;
  HOUSE_SECD_NM: string;
  HOUSE_DETAIL_SECD_NM?: string;
  HSSPLY_ADRES: string;
  SUBSCRPT_AREA_CODE: string;
  SUBSCRPT_AREA_CODE_NM: string;
  RCRIT_PBLANC_DE: string;
  SUBSCRPT_RCEPT_BGNDE: string;
  SUBSCRPT_RCEPT_ENDDE: string;
  PRZWNER_PRESNATN_DE: string;
  CNTRCT_CNCLS_BGNDE?: string;
  CNTRCT_CNCLS_ENDDE?: string;
  MVN_PREARNGE_YM: string;
  TOT_SUPLY_HSHLDCO: number;
  BSNS_MBY_NM: string;
  MDHS_TELNO: string;
  PBLANC_URL: string;
  HMPG_ADRES?: string;
  source: 'apt' | 'urbty' | 'remndr' | 'pbl_pvt_rent' | 'opt';
}

// ── 유틸 ─────────────────────────────────────────────────
function formatDate(d: string | null | undefined): string {
  if (!d || d.length !== 8) return d ?? '';
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function formatYM(ym: string | null | undefined): string {
  if (!ym || ym.length < 6) return ym ?? '';
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`;
}

function buildPageContent(item: ApplyhomeItem): string {
  const typeLabel = item.HOUSE_DETAIL_SECD_NM || item.HOUSE_SECD_NM;
  const parts: string[] = [];
  parts.push(`[정책명] ${item.HOUSE_NM}`);
  parts.push(`[유형] ${typeLabel} 청약`);
  parts.push(`[주소] ${item.HSSPLY_ADRES}`);
  parts.push(`[청약지역] ${item.SUBSCRPT_AREA_CODE_NM}`);
  if (item.TOT_SUPLY_HSHLDCO) parts.push(`[공급세대수] ${item.TOT_SUPLY_HSHLDCO}세대`);
  if (item.RCRIT_PBLANC_DE) parts.push(`[모집공고일] ${formatDate(item.RCRIT_PBLANC_DE)}`);
  if (item.SUBSCRPT_RCEPT_BGNDE) {
    parts.push(`[청약접수] ${formatDate(item.SUBSCRPT_RCEPT_BGNDE)} ~ ${formatDate(item.SUBSCRPT_RCEPT_ENDDE)}`);
  }
  if (item.PRZWNER_PRESNATN_DE) parts.push(`[당첨자발표] ${formatDate(item.PRZWNER_PRESNATN_DE)}`);
  if (item.CNTRCT_CNCLS_BGNDE) {
    parts.push(`[계약기간] ${formatDate(item.CNTRCT_CNCLS_BGNDE)} ~ ${formatDate(item.CNTRCT_CNCLS_ENDDE)}`);
  }
  if (item.MVN_PREARNGE_YM) parts.push(`[입주예정] ${formatYM(item.MVN_PREARNGE_YM)}`);
  if (item.BSNS_MBY_NM) parts.push(`[사업주체] ${item.BSNS_MBY_NM}`);
  if (item.MDHS_TELNO) parts.push(`[문의] ${item.MDHS_TELNO}`);
  parts.push(`[신청링크] ${item.PBLANC_URL}`);
  if (item.HMPG_ADRES) parts.push(`[홈페이지] ${item.HMPG_ADRES}`);
  return parts.join('\n');
}

function makePointId(pblancNo: string, source: string): number {
  const key = `applyhome_${source}_${pblancNo}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (hash + 1_900_000_000) % 2_147_483_647;
}

// ── API 호출 ─────────────────────────────────────────────
async function fetchAll(endpoint: string, source: ApplyhomeItem['source']): Promise<ApplyhomeItem[]> {
  const url = `${BASE_URL}/${endpoint}`;
  const { data: first } = await axios.get(url, {
    params: { serviceKey: API_KEY, page: 1, perPage: PER_PAGE },
    timeout: 15000,
  });
  const total: number = first.totalCount ?? 0;
  if (total === 0) return [];

  const totalPages = Math.ceil(total / PER_PAGE);
  const allData: Record<string, unknown>[] = [...(first.data ?? [])];

  const promises = Array.from({ length: totalPages - 1 }, (_, i) =>
    axios
      .get(url, { params: { serviceKey: API_KEY, page: i + 2, perPage: PER_PAGE }, timeout: 15000 })
      .then((r) => allData.push(...(r.data.data ?? [])))
      .catch(() => {}),
  );
  await Promise.all(promises);

  return allData.map((i) => ({
    HOUSE_MANAGE_NO: String(i.HOUSE_MANAGE_NO ?? ''),
    PBLANC_NO: String(i.PBLANC_NO ?? ''),
    HOUSE_NM: String(i.HOUSE_NM ?? ''),
    HOUSE_SECD_NM: String(i.HOUSE_SECD_NM ?? ''),
    // APT endpoint uses HOUSE_DTL_SECD_NM; others use HOUSE_DETAIL_SECD_NM
    HOUSE_DETAIL_SECD_NM: i.HOUSE_DETAIL_SECD_NM
      ? String(i.HOUSE_DETAIL_SECD_NM)
      : i.HOUSE_DTL_SECD_NM
        ? String(i.HOUSE_DTL_SECD_NM)
        : undefined,
    HSSPLY_ADRES: String(i.HSSPLY_ADRES ?? ''),
    SUBSCRPT_AREA_CODE: String(i.SUBSCRPT_AREA_CODE ?? ''),
    SUBSCRPT_AREA_CODE_NM: String(i.SUBSCRPT_AREA_CODE_NM ?? ''),
    RCRIT_PBLANC_DE: String(i.RCRIT_PBLANC_DE ?? ''),
    // APT endpoint uses RCEPT_BGNDE; others use SUBSCRPT_RCEPT_BGNDE
    SUBSCRPT_RCEPT_BGNDE: String(i.SUBSCRPT_RCEPT_BGNDE ?? i.RCEPT_BGNDE ?? ''),
    SUBSCRPT_RCEPT_ENDDE: String(i.SUBSCRPT_RCEPT_ENDDE ?? i.RCEPT_ENDDE ?? ''),
    PRZWNER_PRESNATN_DE: String(i.PRZWNER_PRESNATN_DE ?? ''),
    CNTRCT_CNCLS_BGNDE: i.CNTRCT_CNCLS_BGNDE ? String(i.CNTRCT_CNCLS_BGNDE) : undefined,
    CNTRCT_CNCLS_ENDDE: i.CNTRCT_CNCLS_ENDDE ? String(i.CNTRCT_CNCLS_ENDDE) : undefined,
    MVN_PREARNGE_YM: String(i.MVN_PREARNGE_YM ?? ''),
    TOT_SUPLY_HSHLDCO: Number(i.TOT_SUPLY_HSHLDCO ?? 0),
    BSNS_MBY_NM: String(i.BSNS_MBY_NM ?? ''),
    MDHS_TELNO: String(i.MDHS_TELNO ?? ''),
    PBLANC_URL: String(i.PBLANC_URL ?? ''),
    HMPG_ADRES: i.HMPG_ADRES ? String(i.HMPG_ADRES) : undefined,
    source,
  }));
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(items: ApplyhomeItem[], embeddings: number[][]): Promise<void> {
  const points = items.map((item, i) => ({
    id: makePointId(item.PBLANC_NO, item.source),
    vector: embeddings[i],
    payload: {
      policyId: `applyhome_${item.PBLANC_NO}`,
      policyName: item.HOUSE_NM,
      category: item.HOUSE_DETAIL_SECD_NM || item.HOUSE_SECD_NM,
      region: item.SUBSCRPT_AREA_CODE_NM,
      address: item.HSSPLY_ADRES,
      ministry: item.BSNS_MBY_NM,
      supplyCount: item.TOT_SUPLY_HSHLDCO,
      annoDate: item.RCRIT_PBLANC_DE,
      subscptBgnde: item.SUBSCRPT_RCEPT_BGNDE,
      subscptEndde: item.SUBSCRPT_RCEPT_ENDDE,
      winnerDate: item.PRZWNER_PRESNATN_DE,
      moveInYM: item.MVN_PREARNGE_YM,
      content: buildPageContent(item),
      status: 'active',
      source: 'applyhome',
      url: item.PBLANC_URL,
    },
  }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// ── Neo4j upsert ─────────────────────────────────────────
async function upsertToNeo4j(items: ApplyhomeItem[]): Promise<void> {
  const session = neo4jDriver.session();
  try {
    for (const item of items) {
      if (!item.PBLANC_NO) continue;
      const id = `applyhome_${item.PBLANC_NO}`;
      const regionCode = AREA_TO_REGION_CODE[item.SUBSCRPT_AREA_CODE_NM] ?? '';
      try {
        await session.run(
          `
          MERGE (ann:HousingAnnouncement {id: $id})
          SET ann.name = $name,
              ann.insttNm = $insttNm,
              ann.suplyTyNm = $suplyTyNm,
              ann.houseTyNm = $houseTyNm,
              ann.annoDate = $annoDate,
              ann.subscptBgnde = $subscptBgnde,
              ann.subscptEndde = $subscptEndde,
              ann.winnerDate = $winnerDate,
              ann.moveInYM = $moveInYM,
              ann.suplyHoCo = $suplyHoCo,
              ann.address = $address,
              ann.pcUrl = $pcUrl,
              ann.annoType = 'applyhome',
              ann.source = 'applyhome',
              ann.updatedAt = datetime()
          `,
          {
            id,
            name: item.HOUSE_NM,
            insttNm: item.BSNS_MBY_NM,
            suplyTyNm: item.HOUSE_SECD_NM,
            houseTyNm: item.HOUSE_DETAIL_SECD_NM ?? '',
            annoDate: item.RCRIT_PBLANC_DE,
            subscptBgnde: item.SUBSCRPT_RCEPT_BGNDE,
            subscptEndde: item.SUBSCRPT_RCEPT_ENDDE,
            winnerDate: item.PRZWNER_PRESNATN_DE,
            moveInYM: item.MVN_PREARNGE_YM,
            suplyHoCo: String(item.TOT_SUPLY_HSHLDCO),
            address: item.HSSPLY_ADRES,
            pcUrl: item.PBLANC_URL,
          },
        );
        // Region 연결
        if (regionCode) {
          await session.run(
            `
            MATCH (ann:HousingAnnouncement {id: $id})
            MERGE (r:Region {code: $code})
            MERGE (ann)-[:AVAILABLE_IN]->(r)
            `,
            { id, code: regionCode },
          );
        }
        // Institution 연결
        if (item.BSNS_MBY_NM) {
          await session.run(
            `
            MERGE (inst:Institution {name: $name})
            WITH inst
            MATCH (ann:HousingAnnouncement {id: $id})
            MERGE (ann)-[:SUPPLIED_BY]->(inst)
            `,
            { name: item.BSNS_MBY_NM, id },
          );
        }
      } catch (e) {
        console.warn(`  Neo4j 스킵 [${id}]: ${(e as Error).message}`);
      }
    }
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🏢 청약홈 분양정보 적재 시작');

  const [aptItems, urbtyItems, remndrItems, pblPvtItems, optItems] = await Promise.all([
    fetchAll('getAPTLttotPblancDetail', 'apt'),
    fetchAll('getUrbtyOfctlLttotPblancDetail', 'urbty'),
    fetchAll('getRemndrLttotPblancDetail', 'remndr'),
    fetchAll('getPblPvtRentLttotPblancDetail', 'pbl_pvt_rent'),
    fetchAll('getOPTLttotPblancDetail', 'opt'),
  ]);

  console.log(`   APT: ${aptItems.length}건, 오피스텔/도시형: ${urbtyItems.length}건, 잔여세대: ${remndrItems.length}건, 공공지원민간임대: ${pblPvtItems.length}건, 임의공급: ${optItems.length}건`);
  const allItems = [...aptItems, ...urbtyItems, ...remndrItems, ...pblPvtItems, ...optItems];
  console.log(`   총 ${allItems.length}건 처리 시작`);

  let done = 0;
  for (let i = 0; i < allItems.length; i += EMBED_BATCH) {
    const batch = allItems.slice(i, i + EMBED_BATCH);
    const texts = batch.map(buildPageContent);
    const embeddings = await embedTexts(texts);
    await Promise.all([
      upsertToQdrant(batch, embeddings),
      upsertToNeo4j(batch),
    ]);
    done += batch.length;
    process.stdout.write(`   [${done}/${allItems.length}] 처리 완료\r`);
  }
  console.log(`\n청약홈 분양정보 ${allItems.length}건 적재 완료!`);
}

main()
  .catch(console.error)
  .finally(async () => { await neo4jDriver.close(); });
