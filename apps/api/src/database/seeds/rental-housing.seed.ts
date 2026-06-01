/**
 * 공공임대주택 단지정보 API → Qdrant + Neo4j 적재 시더
 *
 * 실행: ts-node --transpile-only src/database/seeds/rental-housing.seed.ts
 */
import axios from 'axios';
import './http-agent'; // axios keepAlive 글로벌 적용
import { QdrantClient } from '@qdrant/js-client-rest';
import neo4j from 'neo4j-driver';
import OpenAI from 'openai';
import { ensureNeo4jConstraints } from './neo4j-constraints';
import { getRequiredEnv } from '../../common/env.util';
import {
  buildIncrementalSyncPlan,
  makeSyncHash,
  type PreparedSyncItem,
} from './incremental-sync.util';

// ── 설정 ─────────────────────────────────────────────────
const API_KEY = getRequiredEnv('PUBLIC_DATA_API_KEY');
const HOUSING_BASE_URL = 'https://apis.data.go.kr/1613000/HWSPR04';
const PAGE_SIZE = 100;
const EMBED_BATCH = 100;
const CONCURRENCY = 10;       // 동시 API 요청 수
const EMBED_CONCURRENCY = 2;  // 동시에 처리할 임베딩 배치 수
const QDRANT_RETRY_LIMIT = 3;
const QDRANT_RETRY_DELAY_MS = 1500;
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'welfare_policies';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});
const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? 'neo4j',
    getRequiredEnv('NEO4J_PASSWORD'),
  ),
);
const openai = new OpenAI({ apiKey: getRequiredEnv('OPENAI_API_KEY') });

// ── 전국 시도/시군구 코드표 ───────────────────────────────
const REGION_CODES: { brtcCode: string; brtcNm: string; signguCode: string; signguNm: string }[] = [
  // 서울특별시
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '110', signguNm: '종로구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '140', signguNm: '중구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '170', signguNm: '용산구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '200', signguNm: '성동구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '215', signguNm: '광진구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '230', signguNm: '동대문구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '260', signguNm: '중랑구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '290', signguNm: '성북구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '305', signguNm: '강북구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '320', signguNm: '도봉구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '350', signguNm: '노원구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '380', signguNm: '은평구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '410', signguNm: '서대문구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '440', signguNm: '마포구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '470', signguNm: '양천구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '500', signguNm: '강서구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '530', signguNm: '구로구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '545', signguNm: '금천구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '560', signguNm: '영등포구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '590', signguNm: '동작구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '620', signguNm: '관악구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '650', signguNm: '서초구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '680', signguNm: '강남구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '710', signguNm: '송파구' },
  { brtcCode: '11', brtcNm: '서울특별시', signguCode: '740', signguNm: '강동구' },
  // 부산광역시
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '110', signguNm: '중구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '140', signguNm: '서구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '170', signguNm: '동구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '200', signguNm: '영도구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '230', signguNm: '부산진구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '260', signguNm: '동래구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '290', signguNm: '남구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '320', signguNm: '북구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '350', signguNm: '해운대구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '380', signguNm: '사하구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '410', signguNm: '금정구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '440', signguNm: '강서구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '470', signguNm: '연제구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '500', signguNm: '수영구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '530', signguNm: '사상구' },
  { brtcCode: '26', brtcNm: '부산광역시', signguCode: '710', signguNm: '기장군' },
  // 대구광역시
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '110', signguNm: '중구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '140', signguNm: '동구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '170', signguNm: '서구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '200', signguNm: '남구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '230', signguNm: '북구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '260', signguNm: '수성구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '290', signguNm: '달서구' },
  { brtcCode: '27', brtcNm: '대구광역시', signguCode: '710', signguNm: '달성군' },
  // 인천광역시
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '110', signguNm: '중구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '140', signguNm: '동구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '177', signguNm: '미추홀구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '185', signguNm: '연수구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '200', signguNm: '남동구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '237', signguNm: '부평구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '245', signguNm: '계양구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '260', signguNm: '서구' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '710', signguNm: '강화군' },
  { brtcCode: '28', brtcNm: '인천광역시', signguCode: '720', signguNm: '옹진군' },
  // 광주광역시
  { brtcCode: '29', brtcNm: '광주광역시', signguCode: '110', signguNm: '동구' },
  { brtcCode: '29', brtcNm: '광주광역시', signguCode: '140', signguNm: '서구' },
  { brtcCode: '29', brtcNm: '광주광역시', signguCode: '155', signguNm: '남구' },
  { brtcCode: '29', brtcNm: '광주광역시', signguCode: '170', signguNm: '북구' },
  { brtcCode: '29', brtcNm: '광주광역시', signguCode: '200', signguNm: '광산구' },
  // 대전광역시
  { brtcCode: '30', brtcNm: '대전광역시', signguCode: '110', signguNm: '동구' },
  { brtcCode: '30', brtcNm: '대전광역시', signguCode: '140', signguNm: '중구' },
  { brtcCode: '30', brtcNm: '대전광역시', signguCode: '170', signguNm: '서구' },
  { brtcCode: '30', brtcNm: '대전광역시', signguCode: '200', signguNm: '유성구' },
  { brtcCode: '30', brtcNm: '대전광역시', signguCode: '230', signguNm: '대덕구' },
  // 울산광역시
  { brtcCode: '31', brtcNm: '울산광역시', signguCode: '110', signguNm: '중구' },
  { brtcCode: '31', brtcNm: '울산광역시', signguCode: '140', signguNm: '남구' },
  { brtcCode: '31', brtcNm: '울산광역시', signguCode: '170', signguNm: '동구' },
  { brtcCode: '31', brtcNm: '울산광역시', signguCode: '200', signguNm: '북구' },
  { brtcCode: '31', brtcNm: '울산광역시', signguCode: '710', signguNm: '울주군' },
  // 세종특별자치시
  { brtcCode: '36', brtcNm: '세종특별자치시', signguCode: '110', signguNm: '세종특별자치시' },
  // 경기도
  { brtcCode: '41', brtcNm: '경기도', signguCode: '111', signguNm: '수원시 장안구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '113', signguNm: '수원시 권선구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '115', signguNm: '수원시 팔달구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '117', signguNm: '수원시 영통구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '131', signguNm: '성남시 수정구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '133', signguNm: '성남시 중원구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '135', signguNm: '성남시 분당구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '150', signguNm: '의정부시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '171', signguNm: '안양시 만안구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '173', signguNm: '안양시 동안구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '190', signguNm: '부천시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '210', signguNm: '광명시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '220', signguNm: '평택시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '250', signguNm: '동두천시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '271', signguNm: '안산시 상록구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '273', signguNm: '안산시 단원구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '281', signguNm: '고양시 덕양구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '285', signguNm: '고양시 일산동구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '287', signguNm: '고양시 일산서구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '290', signguNm: '과천시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '310', signguNm: '구리시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '360', signguNm: '남양주시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '370', signguNm: '오산시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '390', signguNm: '시흥시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '410', signguNm: '군포시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '430', signguNm: '의왕시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '450', signguNm: '하남시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '461', signguNm: '용인시 처인구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '463', signguNm: '용인시 기흥구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '465', signguNm: '용인시 수지구' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '480', signguNm: '파주시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '500', signguNm: '이천시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '550', signguNm: '안성시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '570', signguNm: '김포시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '590', signguNm: '화성시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '610', signguNm: '광주시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '630', signguNm: '양주시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '650', signguNm: '포천시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '670', signguNm: '여주시' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '800', signguNm: '연천군' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '820', signguNm: '가평군' },
  { brtcCode: '41', brtcNm: '경기도', signguCode: '830', signguNm: '양평군' },
  // 강원도
  { brtcCode: '42', brtcNm: '강원도', signguCode: '110', signguNm: '춘천시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '130', signguNm: '원주시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '150', signguNm: '강릉시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '170', signguNm: '동해시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '190', signguNm: '태백시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '210', signguNm: '속초시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '230', signguNm: '삼척시' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '720', signguNm: '홍천군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '730', signguNm: '횡성군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '750', signguNm: '영월군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '760', signguNm: '평창군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '770', signguNm: '정선군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '780', signguNm: '철원군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '790', signguNm: '화천군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '800', signguNm: '양구군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '810', signguNm: '인제군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '820', signguNm: '고성군' },
  { brtcCode: '42', brtcNm: '강원도', signguCode: '830', signguNm: '양양군' },
  // 충청북도
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '111', signguNm: '청주시 상당구' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '112', signguNm: '청주시 서원구' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '113', signguNm: '청주시 흥덕구' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '114', signguNm: '청주시 청원구' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '130', signguNm: '충주시' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '150', signguNm: '제천시' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '720', signguNm: '보은군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '730', signguNm: '옥천군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '740', signguNm: '영동군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '745', signguNm: '증평군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '750', signguNm: '진천군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '760', signguNm: '괴산군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '770', signguNm: '음성군' },
  { brtcCode: '43', brtcNm: '충청북도', signguCode: '800', signguNm: '단양군' },
  // 충청남도
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '131', signguNm: '천안시 동남구' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '133', signguNm: '천안시 서북구' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '150', signguNm: '공주시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '180', signguNm: '보령시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '200', signguNm: '아산시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '210', signguNm: '서산시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '230', signguNm: '논산시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '250', signguNm: '계룡시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '270', signguNm: '당진시' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '710', signguNm: '금산군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '760', signguNm: '부여군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '770', signguNm: '서천군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '790', signguNm: '청양군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '800', signguNm: '홍성군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '810', signguNm: '예산군' },
  { brtcCode: '44', brtcNm: '충청남도', signguCode: '825', signguNm: '태안군' },
  // 전라북도
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '111', signguNm: '전주시 완산구' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '113', signguNm: '전주시 덕진구' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '130', signguNm: '군산시' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '140', signguNm: '익산시' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '180', signguNm: '정읍시' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '190', signguNm: '남원시' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '210', signguNm: '김제시' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '710', signguNm: '완주군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '720', signguNm: '진안군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '730', signguNm: '무주군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '740', signguNm: '장수군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '750', signguNm: '임실군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '770', signguNm: '순창군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '790', signguNm: '고창군' },
  { brtcCode: '45', brtcNm: '전라북도', signguCode: '800', signguNm: '부안군' },
  // 전라남도
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '110', signguNm: '목포시' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '130', signguNm: '여수시' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '150', signguNm: '순천시' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '170', signguNm: '나주시' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '230', signguNm: '광양시' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '710', signguNm: '담양군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '720', signguNm: '곡성군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '730', signguNm: '구례군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '770', signguNm: '고흥군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '780', signguNm: '보성군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '790', signguNm: '화순군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '800', signguNm: '장흥군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '810', signguNm: '강진군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '820', signguNm: '해남군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '830', signguNm: '영암군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '840', signguNm: '무안군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '860', signguNm: '함평군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '870', signguNm: '영광군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '880', signguNm: '장성군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '890', signguNm: '완도군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '900', signguNm: '진도군' },
  { brtcCode: '46', brtcNm: '전라남도', signguCode: '910', signguNm: '신안군' },
  // 경상북도
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '111', signguNm: '포항시 남구' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '113', signguNm: '포항시 북구' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '130', signguNm: '경주시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '150', signguNm: '김천시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '170', signguNm: '안동시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '190', signguNm: '구미시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '210', signguNm: '영주시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '230', signguNm: '영천시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '250', signguNm: '상주시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '280', signguNm: '문경시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '290', signguNm: '경산시' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '720', signguNm: '군위군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '730', signguNm: '의성군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '750', signguNm: '청송군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '760', signguNm: '영양군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '770', signguNm: '영덕군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '820', signguNm: '청도군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '830', signguNm: '고령군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '840', signguNm: '성주군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '850', signguNm: '칠곡군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '900', signguNm: '예천군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '920', signguNm: '봉화군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '930', signguNm: '울진군' },
  { brtcCode: '47', brtcNm: '경상북도', signguCode: '940', signguNm: '울릉군' },
  // 경상남도
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '121', signguNm: '창원시 의창구' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '123', signguNm: '창원시 성산구' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '125', signguNm: '창원시 마산합포구' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '127', signguNm: '창원시 마산회원구' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '129', signguNm: '창원시 진해구' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '170', signguNm: '진주시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '220', signguNm: '통영시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '240', signguNm: '사천시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '250', signguNm: '김해시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '270', signguNm: '밀양시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '310', signguNm: '거제시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '330', signguNm: '양산시' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '720', signguNm: '의령군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '730', signguNm: '함안군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '740', signguNm: '창녕군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '820', signguNm: '고성군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '840', signguNm: '남해군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '850', signguNm: '하동군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '860', signguNm: '산청군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '870', signguNm: '함양군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '880', signguNm: '거창군' },
  { brtcCode: '48', brtcNm: '경상남도', signguCode: '890', signguNm: '합천군' },
  // 제주특별자치도
  { brtcCode: '50', brtcNm: '제주특별자치도', signguCode: '110', signguNm: '제주시' },
  { brtcCode: '50', brtcNm: '제주특별자치도', signguCode: '130', signguNm: '서귀포시' },
];

// ── 타입 ─────────────────────────────────────────────────
interface HousingItem {
  hsmpSn: number;
  insttNm: string;
  brtcNm: string;
  signguNm: string;
  hsmpNm: string;
  rnAdres: string;
  hshldCo: number;
  suplyTyNm: string;
  styleNm: string;
  suplyPrvuseAr: number;
  houseTyNm: string;
  bassRentGtn: number;
  bassMtRntchrg: number;
}

interface HousingComplex {
  id: string; // hsmpSn + suplyTyNm + styleNm
  hsmpSn: number;
  brtcNm: string;
  signguNm: string;
  insttNm: string;
  hsmpNm: string;
  rnAdres: string;
  hshldCo: number;
  units: { suplyTyNm: string; styleNm: string; area: number; houseTyNm: string; rentGtn: number; mtRnt: number }[];
}

type PreparedHousingComplex = PreparedSyncItem<HousingComplex>;

// ── 유틸 ─────────────────────────────────────────────────
function formatWon(amount: number): string {
  if (amount >= 10000) return `${(amount / 10000).toFixed(0)}만원`;
  return `${amount.toLocaleString()}원`;
}

function buildPageContent(c: HousingComplex): string {
  const parts: string[] = [];
  parts.push(`[정책명] ${c.units[0]?.suplyTyNm ?? '공공임대주택'} - ${c.signguNm}`);
  parts.push(`[유형] 공공임대주택`);
  parts.push(`[지역] ${c.brtcNm} ${c.signguNm}`);
  parts.push(`[단지명] ${c.hsmpNm}`);
  parts.push(`[주소] ${c.rnAdres}`);
  parts.push(`[관리기관] ${c.insttNm}`);
  parts.push(`[세대수] ${c.hshldCo}세대`);
  parts.push(`[신청링크] https://www.myhome.go.kr/hws/portal/hl/selectRentalHouseInfoList.do`);
  if (c.units.length > 0) {
    const types = [...new Set(c.units.map((u) => u.suplyTyNm))].join(', ');
    parts.push(`[공급유형] ${types}`);
    const houseTypes = [...new Set(c.units.map((u) => u.houseTyNm).filter(Boolean))].join(', ');
    if (houseTypes) parts.push(`[주택유형] ${houseTypes}`);
    const uniqueAreas = [...new Set(c.units.map((u) => u.area))].slice(0, 5);
    parts.push(`[면적] ${uniqueAreas.map((a) => `${a}㎡`).join(', ')}`);
    // 최대 3개 세대유형만 (토큰 초과 방지)
    const topUnits = c.units.slice(0, 3);
    const rentInfo = topUnits
      .map((u) => `${u.suplyTyNm} ${u.area}㎡: 보증금 ${formatWon(u.rentGtn)}, 월임대료 ${formatWon(u.mtRnt)}`)
      .join('\n');
    parts.push(`[임대조건]\n${rentInfo}`);
  }
  // 최대 800자 제한 (임베딩 토큰 초과 방지)
  return parts.join('\n').slice(0, 800);
}

function itemId(c: HousingComplex): number {
  const key = `housing_${c.id}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) & 0x7fffffff;
  }
  return (hash + 2_000_000_000) % 2_147_483_647;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableQdrantError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('UND_ERR_SOCKET')
    || message.includes('fetch failed')
    || message.includes('socket')
    || message.includes('ECONNRESET')
    || message.includes('ETIMEDOUT')
  );
}

// ── API 호출 ─────────────────────────────────────────────
async function fetchHousing(
  brtcCode: string,
  signguCode: string,
  pageNo: number,
): Promise<{ total: number; items: HousingItem[] }> {
  try {
    const { data } = await axios.get(`${HOUSING_BASE_URL}/rentalHouseGwList`, {
      params: { serviceKey: API_KEY, brtcCode, signguCode, numOfRows: PAGE_SIZE, pageNo },
      timeout: 10000,
    });
    const body = data?.response?.body;
    if (!body) return { total: 0, items: [] };
    const total = parseInt(body.totalCount ?? '0', 10);
    if (total === 0) return { total: 0, items: [] };
    const rawItems = body.item;
    const arr: HousingItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    return { total, items: arr };
  } catch {
    return { total: 0, items: [] };
  }
}

// ── 단지별 집계 ──────────────────────────────────────────
function aggregateToComplexes(items: HousingItem[], brtcNm: string, signguNm: string): HousingComplex[] {
  const map = new Map<number, HousingComplex>();
  for (const item of items) {
    if (!map.has(item.hsmpSn)) {
      map.set(item.hsmpSn, {
        id: String(item.hsmpSn),
        hsmpSn: item.hsmpSn,
        brtcNm,
        signguNm,
        insttNm: item.insttNm,
        hsmpNm: item.hsmpNm,
        rnAdres: item.rnAdres,
        hshldCo: item.hshldCo,
        units: [],
      });
    }
    map.get(item.hsmpSn)!.units.push({
      suplyTyNm: item.suplyTyNm,
      styleNm: item.styleNm,
      area: item.suplyPrvuseAr,
      houseTyNm: item.houseTyNm,
      rentGtn: item.bassRentGtn,
      mtRnt: item.bassMtRntchrg,
    });
  }
  return [...map.values()];
}

// ── 임베딩 ─────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function prepareComplexes(items: HousingComplex[]): PreparedHousingComplex[] {
  return items.map((item) => {
    const policyId = `housing_${item.hsmpSn}`;
    const content = buildPageContent(item);
    return {
      item,
      policyId,
      graphId: policyId,
      content,
      syncHash: makeSyncHash({
        policyId,
        content,
        region: item.brtcNm,
        sigungu: item.signguNm,
        householdCount: item.hshldCo,
        units: item.units,
      }),
    };
  });
}

// ── Qdrant upsert ────────────────────────────────────────
async function upsertToQdrant(
  complexes: PreparedHousingComplex[],
  embeddings: number[][],
): Promise<void> {
  const points = complexes.map(({ item: c, policyId, content, syncHash }, i) => ({
    id: itemId(c),
    vector: embeddings[i],
    payload: {
      policyId,
      policyName: `공공임대주택 - ${c.signguNm}`,
      category: '주거',
      region: c.brtcNm,
      sigungu: c.signguNm,
      ministry: c.insttNm,
      content,
      status: 'active',
      source: 'lh_housing',
      hsmpNm: c.hsmpNm,
      rnAdres: c.rnAdres,
      syncHash,
    },
  }));
  let lastError: unknown;

  for (let attempt = 1; attempt <= QDRANT_RETRY_LIMIT; attempt += 1) {
    try {
      await qdrant.upsert(COLLECTION, { wait: true, points });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableQdrantError(error) || attempt === QDRANT_RETRY_LIMIT) {
        throw error;
      }
      console.warn(`  Qdrant 재시도 ${attempt}/${QDRANT_RETRY_LIMIT}: ${(error as Error).message}`);
      await sleep(QDRANT_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

// ── Neo4j upsert (배치 UNWIND) ───────────────────────────
async function upsertToNeo4j(complexes: PreparedHousingComplex[]): Promise<void> {
  const rows = complexes
    .filter(({ item: c }) => Boolean(c.hsmpSn))
    .map(({ item: c, policyId: id, syncHash }) => ({
      id,
      name: c.hsmpNm ?? '',
      address: c.rnAdres ?? '',
      region: c.brtcNm ?? '',
      sigungu: c.signguNm ?? '',
      manager: c.insttNm ?? '',
      hshldCo: c.hshldCo ?? 0,
      syncHash,
    }));
  if (rows.length === 0) return;

  const session = neo4jDriver.session();
  try {
    await session.run(
      `
      UNWIND $rows AS row
      MERGE (h:HousingComplex {id: row.id})
      SET h.name = row.name,
          h.address = row.address,
          h.region = row.region,
          h.sigungu = row.sigungu,
          h.manager = row.manager,
          h.hshldCo = row.hshldCo,
          h.source = 'lh_housing',
          h.syncHash = row.syncHash,
          h.updatedAt = datetime()
      WITH h, row
      FOREACH (regionName IN CASE WHEN row.region <> '' THEN [row.region] ELSE [] END |
        MERGE (r:Region {name: regionName})
        MERGE (h)-[:LOCATED_IN]->(r)
      )
      `,
      { rows },
    );
  } catch (e) {
    console.warn(`  Neo4j 배치 실패 (${rows.length}건): ${(e as Error).message}`);
  } finally {
    await session.close();
  }
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('🏠 공공임대주택 단지정보 적재 시작');
  await ensureNeo4jConstraints(neo4jDriver);
  console.log(`   대상: ${REGION_CODES.length}개 시군구`);

  const allComplexes: HousingComplex[] = [];
  const seen = new Set<number>();

  async function fetchRegion(region: typeof REGION_CODES[0]): Promise<HousingComplex[]> {
    const { brtcCode, brtcNm, signguCode, signguNm } = region;
    const { total, items } = await fetchHousing(brtcCode, signguCode, 1);
    if (total === 0) return [];
    let allItems = [...items];
    const pages = Math.ceil(total / PAGE_SIZE);
    const pagePromises: Promise<HousingItem[]>[] = [];
    for (let p = 2; p <= pages; p++) {
      pagePromises.push(fetchHousing(brtcCode, signguCode, p).then(r => r.items));
    }
    const morePages = await Promise.all(pagePromises);
    morePages.forEach(m => allItems = allItems.concat(m));
    return aggregateToComplexes(allItems, brtcNm, signguNm);
  }

  for (let i = 0; i < REGION_CODES.length; i += CONCURRENCY) {
    const chunk = REGION_CODES.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(fetchRegion));
    for (const complexes of results) {
      for (const c of complexes) {
        if (!seen.has(c.hsmpSn)) {
          seen.add(c.hsmpSn);
          allComplexes.push(c);
        }
      }
    }
    process.stdout.write(`   수집 중: ${Math.min(i + CONCURRENCY, REGION_CODES.length)}/${REGION_CODES.length} 시군구\r`);
  }
  console.log(`\n✅ 수집 완료: ${allComplexes.length}개 단지`);

  const prepared = prepareComplexes(allComplexes);
  const plan = await buildIncrementalSyncPlan({
    client: qdrant,
    collectionName: COLLECTION,
    preparedItems: prepared,
    driver: neo4jDriver,
    graphLabel: 'HousingComplex',
  });
  console.log(
    `   증분 대상 - 벡터 ${plan.vectorUpdates.length}개, 그래프 ${plan.graphUpdates.length}개, 스킵 ${plan.skippedCount}개`,
  );

  if (plan.vectorUpdates.length === 0 && plan.graphUpdates.length === 0) {
    console.log('✅ 변경 없음');
    return;
  }

  console.log('🔍 임베딩 + 저장 중...');
  const graphUpdateIds = new Set(plan.graphUpdates.map((item) => item.policyId));
  let vectorDone = 0;

  async function processVectorBatch(batch: PreparedHousingComplex[]): Promise<void> {
    const embeddings = await embedTexts(batch.map((item) => item.content));
    const graphBatch = batch.filter((item) => graphUpdateIds.has(item.policyId));
    await upsertToQdrant(batch, embeddings);
    if (graphBatch.length > 0) {
      await upsertToNeo4j(graphBatch);
    }
    vectorDone += batch.length;
    process.stdout.write(`   벡터 [${vectorDone}/${plan.vectorUpdates.length}] 처리 완료\r`);
  }

  for (let i = 0; i < plan.vectorUpdates.length; i += EMBED_BATCH * EMBED_CONCURRENCY) {
    const concurrentBatches: PreparedHousingComplex[][] = [];
    for (
      let j = i;
      j < Math.min(i + EMBED_BATCH * EMBED_CONCURRENCY, plan.vectorUpdates.length);
      j += EMBED_BATCH
    ) {
      concurrentBatches.push(plan.vectorUpdates.slice(j, j + EMBED_BATCH));
    }
    const results = await Promise.allSettled(concurrentBatches.map(processVectorBatch));
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      throw failed.reason;
    }
  }

  if (plan.graphOnlyUpdates.length > 0) {
    let graphDone = 0;
    for (let i = 0; i < plan.graphOnlyUpdates.length; i += EMBED_BATCH) {
      const batch = plan.graphOnlyUpdates.slice(i, i + EMBED_BATCH);
      await upsertToNeo4j(batch);
      graphDone += batch.length;
      process.stdout.write(`   그래프 [${graphDone}/${plan.graphOnlyUpdates.length}] 처리 완료\r`);
    }
  }

  console.log(`\n🎉 공공임대주택 증분 동기화 완료!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => { await neo4jDriver.close(); });
