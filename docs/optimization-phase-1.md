# 1차 최적화 보고서

> 작성: 2026-05-16
> 범위: RAG 에이전트 정합성 + 데이터 동기화 시드 성능 + dev-watch 재발 방지

---

## 1. 개요

본 문서는 `welfare-ai`의 1차 최적화 작업을 기록한다. 작업은 다음 세 축으로 묶인다.

| 축 | 묶음 | 목표 |
|---|---|---|
| A | **정합성** | RAG 응답과 DB 일치성 회복 |
| B | **시드 성능** | 데이터 동기화 처리 시간 단축 |
| C | **운영 안정성** | dev-watch 재시작에도 동기화 생존 |

`local-welfare` 첫 적재 기준 **17분 → 약 3~4분 수준**으로 단축이 가능한 변경을 적용했다. 외부 공공데이터포털의 일일 쿼터를 제외하면, 동기화 자체의 보틀넥은 해소된 상태다.

---

## 2. 사전 진단

분석 시점: 5/16 14:39 KST 기준 중단된 `local-welfare` 시드 측정값.

- 16분 57초 동안 `[3240/4565]` 처리 → **batch(20건)당 약 6.3초**
- batch 시간 분해 (추정):

| 단계 | 소요 | 비고 |
|---|---|---|
| `fetchDetail` × 20 병렬 | 0.2~1s | 이미 병렬, 정상 |
| `buildIncrementalSyncPlan` (Qdrant scroll + Neo4j MATCH) | 0.2~0.5s | batch마다 lookup |
| `embedTexts` (OpenAI 20개) | 0.3~0.8s | 배치 과소 |
| `upsertToQdrant` | 0.1~0.3s | 정상 |
| **`upsertToNeo4j`** (per-item 직렬 MERGE 4종) | **~3s** | **가장 큰 보틀넥** |
| `syncPoliciesToPostgres` (4~5 SQL) | 0.5~1s | skip 안 함, 매 batch 전건 |

추가로 다음 문제가 같이 식별됨:
- `loadChatHistory`가 가장 **오래된** 10개를 가져옴 (`order: ASC, take: 10`) — 후속 follow-up 컨텍스트 손실
- `verify_answer` → HITL 전환 시 `skipSave: true` → 클라이언트는 답변을 받았지만 DB에는 미저장 → history 불일치
- `DataSyncService.executeSeed` 의 자식 spawn이 dev-watch 재시작과 함께 종료 → 동기화 중간 중단 + 12h 동안 stale 잠금

---

## 3. 변경 내역

### A. 정합성 묶음

#### A1. 최근 대화 정렬 수정
**파일**: `apps/api/src/modules/rag/rag-orchestrator.service.ts`

```diff
- order: { createdAt: 'ASC' }, take: 10
+ order: { createdAt: 'DESC' }, take: 10
+ // → 사용 시 .reverse()
```

가장 최근 10개를 가져온 뒤 시간순으로 재정렬해 컨텍스트에 넣는다.

#### A2. HITL 전환 시 답변 + 메타 동행 저장
**파일**: `apps/api/src/modules/rag/rag.graph.ts`, `eligibility.graph.ts`, `application-assist.graph.ts`, `rag-orchestrator.service.ts`

세 그래프의 `verify_answer` 노드가 `skipSave: true`를 반환하지 않고, 대신 `hitlMeta`를 그래프 state에 채워 `saveMessage`에서 함께 영속화한다.

```ts
// verify_answer 노드
return {
  hitlMeta: {
    hitl: { reason, questionnaireId, source: 'verify_answer' },
  },
};

// saveMessage 노드
await services.saveMessage(state.sessionId, 'assistant', state.answer, state.hitlMeta ?? undefined);
```

`RagGraphServices.saveMessage` 시그니처에 4번째 인자 `meta?: Record<string, unknown>` 추가. `RagOrchestratorService.persistMessage` 가 받아서 `ChatMessage.ragContext`(이미 존재하던 jsonb 컬럼)에 저장. 마이그레이션 불필요.

**효과**: 클라이언트에 흘러간 텍스트와 DB가 일치 → 후속 발화의 컨텍스트 끊김 해소. HITL 발동 사실은 `ragContext.hitl`로 운영에서 추적 가능.

---

### B. 시드 성능 묶음

#### B1. Neo4j upsert를 UNWIND 단일 쿼리로 (5개 시드)

**파일**:
- `apps/api/src/database/seeds/local-welfare.seed.ts`
- `apps/api/src/database/seeds/welfare-api.seed.ts`
- `apps/api/src/database/seeds/youth-policy.seed.ts`
- `apps/api/src/database/seeds/housing-announcement.seed.ts`
- `apps/api/src/database/seeds/rental-housing.seed.ts`

기존:
```ts
for (const p of batch) {                 // 20번 직렬
  await session.run('MERGE Policy ...');
  await session.run('MERGE Region ...');
  for (const stage of lifeStages) await session.run('MERGE LifeStage ...');
  for (const theme of themes)      await session.run('MERGE Theme ...');
}
// batch당 ~80 round-trip × 30ms ≈ 2.4~3.6s
```

변경:
```cypher
UNWIND $rows AS row
MERGE (pol:Policy {id: row.id})
SET pol.name = row.name, ...
WITH pol, row
FOREACH (regionName IN CASE WHEN row.region <> '' THEN [row.region] ELSE [] END |
  MERGE (r:Region {name: regionName})
  MERGE (pol)-[:AVAILABLE_IN]->(r)
)
FOREACH (stage IN row.lifeStages |
  MERGE (ls:LifeStage {name: stage})
  MERGE (pol)-[:TARGETS_LIFE_STAGE]->(ls)
)
FOREACH (theme IN row.themes |
  MERGE (th:Theme {name: theme})
  MERGE (pol)-[:HAS_THEME]->(th)
)
// batch당 1 round-trip
```

**효과**: batch당 Neo4j 시간 ~3s → ~0.3s.

#### B2. Postgres skip 가드 (3개 시드)

**파일**: `local-welfare.seed.ts`, `welfare-api.seed.ts`, `youth-policy.seed.ts`

`syncPoliciesToPostgres` 호출 직전에 `plan.vectorUpdates ∪ plan.graphUpdates` 의 policyId 집합으로 필터:

```ts
const touchedPolicyIds = new Set([
  ...plan.vectorUpdates.map((item) => item.policyId),
  ...plan.graphUpdates.map((item) => item.policyId),
]);
const relationalBatch = details
  .filter((item) => touchedPolicyIds.has(item.servId))
  .map((item) => toRelationalPolicyInput(item));
```

**효과**: 재실행 시 대부분 skip이면 Postgres 트래픽 90%+ 감소.

#### B3. EMBED_BATCH 100으로 상향 (9개 시드)

| 시드 | Before | After |
|---|---|---|
| local-welfare / welfare-api / youth-policy / rental-housing / welfare-facility / applyhome / applyhome-cmpet / applyhome-stat | 20 | **100** |
| housing-announcement | 50 | **100** |
| welfare-facility `EMBED_CONCURRENCY` | 5 | **3** (BATCH×CONCURRENCY=300/라운드 유지) |

OpenAI `text-embedding-3-small` 단일 요청은 2048 텍스트까지 가능. 20씩 끊을 이유 없음. **OpenAI 호출 횟수 ~5x 감소, batch 수 자체 ~5x 감소**.

#### B4. HTTP keepAlive 활성화

**신규 파일**: `apps/api/src/database/seeds/http-agent.ts`

```ts
import axios from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';

axios.defaults.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
```

- 명시적 `publicApiClient` 두 곳 (`local-welfare`, `youth-policy`)도 `keepAlive: true`로 직접 변경
- 7개 시드(`welfare-api`/`rental-housing`/`housing-announcement`/`welfare-facility`/`applyhome`/`applyhome-cmpet`/`applyhome-stat`)에 `import './http-agent'` 추가

**효과**: 4,500+ detail 호출이 있는 `local-welfare`/`welfare-api`에서 TLS 핸드셰이크 비용(건당 ~100ms) 제거.

#### B5. Neo4j uniqueness constraint ensure

**신규 파일**: `apps/api/src/database/seeds/neo4j-constraints.ts`

11개 라벨에 대한 `IF NOT EXISTS` 제약 + 시드 진입 시 한 번만 호출(process-level cached):

| 라벨 | 키 |
|---|---|
| Policy | id |
| Region | name, code |
| LifeStage | name |
| Theme | name |
| TargetGroup | name |
| HousingComplex | id |
| HousingAnnouncement | id |
| Institution | name |
| WelfareFacility | id |
| FacilityKind | name |

Neo4j를 쓰는 8개 시드 `main()` 시작에 `await ensureNeo4jConstraints(neo4jDriver)` 추가.

**효과**: MERGE가 인덱스 lookup으로 동작 → UNWIND 쿼리 자체가 추가로 2~5x 빨라짐.

---

### C. 운영 안정성 묶음

#### C1. spawn을 detached process group으로
**파일**: `apps/api/src/modules/data-sync/data-sync.service.ts`

```ts
const child = spawn('pnpm', [...], {
  cwd: this.appDir,
  env: { ...process.env },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,          // 별도 process group
});
child.unref();
child.stdout?.on('error', () => {});  // 부모 pipe close 시 EPIPE 무시
child.stderr?.on('error', () => {});
```

**효과**: dev-watch가 부모(API) 프로세스에 SIGTERM/SIGINT를 보내도 자식 시드는 받지 않음. 시드는 끝까지 완주.

> ⚠️ **한계**: 부모가 죽으면 stdout pipe가 끊겨 이후 진행도 DB write는 멈춤. 시드 자체는 적재를 마치지만 `data_sync_logs`에는 stuck 상태로 남음. 이 경우는 C2 heartbeat이 중단되어 STALE_THRESHOLD(30분) 후 자동으로 FAILED 마킹된다.

#### C2. stale threshold 단축 + heartbeat
**파일**: `apps/api/src/modules/data-sync/data-sync.service.ts`

```ts
const STALE_RUN_THRESHOLD_MS = 30 * 60 * 1000; // 12h → 30분
const HEARTBEAT_INTERVAL_MS = 30 * 1000;       // 30초마다 updatedAt 갱신
```

`executeSeed` 내부:
```ts
const heartbeat = setInterval(() => {
  this.logRepo
    .query('UPDATE data_sync_logs SET "updatedAt" = NOW() WHERE id = $1', [log.id])
    .catch((error) => { this.logger.warn(...); });
}, HEARTBEAT_INTERVAL_MS);

// 자식 close 시
clearInterval(heartbeat);
```

**효과**: fetch list 구간이 길어 stdout이 잠시 없어도 heartbeat이 updatedAt을 갱신. 진짜 죽었을 때만 30분 후 stale 마킹 → 다음 트리거 가능.

---

## 4. 변경 파일 목록

| 분류 | 파일 | 변경 |
|---|---|---|
| A1 | `apps/api/src/modules/rag/rag-orchestrator.service.ts` | history 정렬 + saveMessage 메타 인자 |
| A2 | `apps/api/src/modules/rag/rag.graph.ts` | hitlMeta state + verify_answer/saveMessage |
| A2 | `apps/api/src/modules/rag/eligibility.graph.ts` | 동일 |
| A2 | `apps/api/src/modules/rag/application-assist.graph.ts` | 동일 |
| B1+B2+B3+B4+B5 | `apps/api/src/database/seeds/local-welfare.seed.ts` | UNWIND, skip, BATCH 100, keepAlive, ensure |
| B1+B2+B3+B4+B5 | `apps/api/src/database/seeds/welfare-api.seed.ts` | 동일 |
| B1+B2+B3+B4+B5 | `apps/api/src/database/seeds/youth-policy.seed.ts` | 동일 |
| B1+B3+B4+B5 | `apps/api/src/database/seeds/housing-announcement.seed.ts` | UNWIND, BATCH 100, keepAlive, ensure |
| B1+B3+B4+B5 | `apps/api/src/database/seeds/rental-housing.seed.ts` | 동일 |
| B3+B4+B5 | `apps/api/src/database/seeds/welfare-facility.seed.ts` | BATCH 100/CONCUR 3, keepAlive, ensure |
| B3+B4+B5 | `apps/api/src/database/seeds/applyhome.seed.ts` | 동일 |
| B3+B4+B5 | `apps/api/src/database/seeds/applyhome-cmpet.seed.ts` | 동일 |
| B3+B4 | `apps/api/src/database/seeds/applyhome-stat.seed.ts` | BATCH 100, keepAlive (Qdrant only — Neo4j ensure 제외) |
| B4 (신규) | `apps/api/src/database/seeds/http-agent.ts` | 글로벌 axios agent |
| B5 (신규) | `apps/api/src/database/seeds/neo4j-constraints.ts` | UNIQUE 제약 ensure 유틸 |
| C1+C2 | `apps/api/src/modules/data-sync/data-sync.service.ts` | detached spawn + threshold + heartbeat |

---

## 5. 검증 결과 (5/16 15:35~15:45 KST 동기화)

| 시드 | 결과 | 소요(s) | 신규 적재 (벡터/그래프) | 스킵 |
|---|---|---|---|---|
| welfare | ✅ SUCCESS | 5~11 | 96 / 96 (첫 run) | 317 |
| local-welfare | ❌ FAILED | — | 공공API 일일 쿼터 초과 (HTTP 429) | — |
| youth-policy | ✅ SUCCESS | 30~42 | 379 / 379 | 2,189 |
| rental-housing | ✅ SUCCESS | 118~160 | 508~1,263 | 2,272~3,935 |
| facility | ✅ SUCCESS | 96~98 | 0 / 1 | 30,532 |
| housing-announcement | ✅ SUCCESS | 2~4 | 233 / 233 | 155 |
| applyhome | ✅ SUCCESS | 5~10 | 104 / 104 | 5,432 |
| applyhome-cmpet | ✅ SUCCESS | 37~51 | 93 / 93 | 5,104 |
| applyhome-stat | ✅ SUCCESS | 3~4 | 6 | 0 |

**`welfare` 직접 비교**:
- 이전 첫 적재 (5/16 14:21~14:22): **47초** (벡터 54, 그래프 54, 스킵 359)
- 이번 첫 적재 (5/16 15:35~15:36): **11초** (벡터 96, 그래프 96, 스킵 317)
- 데이터량 비슷한 조건에서 **약 4x 단축** → UNWIND + EMBED_BATCH + 제약 인덱스 효과 확인

---

## 6. 알려진 한계 / 후속 과제

### 6.1 4중 동시 트리거 race
`DataSyncService.getActiveRunId()` 가드가 race로 통과해 runId 4개가 동시에 생성되는 사례가 관측됨. `startSync` 호출 직후 `data_sync_logs` insert가 commit되기 전에 다른 호출이 들어오면 막지 못함. 후속 조치 후보:
- Redis SET NX 락
- Postgres advisory lock (`pg_try_advisory_lock`)

### 6.2 공공데이터포털 일일 쿼터
4중 트리거가 도는 동안 `apis.data.go.kr/B554287/LocalGovernmentWelfareInformations`의 일일 호출 한도를 소진. `local-welfare` 재시도는 자정 KST 리셋 후 가능. 단일 트리거였다면 발생하지 않았을 문제.

### 6.3 시드 ENV 의존도
`http-agent.ts` 의 `axios.defaults` 변경은 import side-effect. 시드별로 별도 axios instance를 쓰는 코드가 추가되면 그 instance는 영향 받지 않음. 향후 신규 시드 작성 시 `import './http-agent'` 누락 주의.

### 6.4 Detached spawn의 단방향 비대칭성
C1로 부모가 죽어도 자식은 생존하지만, 자식이 생성한 stdout/stderr 파이프가 끊겨 진행도가 DB에 안 들어감. 좀 더 완전한 분리를 원하면:
- 자식 stdout/stderr를 파일로 redirect
- 진행도 갱신을 자식 본인이 직접 DB에 write (현재는 부모 NestJS가 파싱)

### 6.5 적용하지 않은 P2/P3 항목
1차에서는 적용 보류. 후속 단계에서 검토:
- (P2) `buildIncrementalSyncPlan`을 batch별 → 전체 1회로 (lookup 호출 감소)
- (P3) batch 간 파이프라이닝 (fetch와 embed/upsert를 겹치기)
- (L1) RAG tool schema에서 `traceId` 제거 → LLM 토큰 절감
- (L2) `JSON.stringify(..., null, 2)` 들여쓰기 제거 → 토큰 절감
- (L3) system prompt 분리 → prompt caching 적중
- (L4) `RetrieverServices.searchWelfare` 내부 순차 → 병렬화
- (L5) `query-analysis.service.ts`의 pre-route 정규식 충돌 점수화
- (L6) `detectAnswerNeedsHitl` false positive 감소

---

## 7. 누적 예상 효과 (`local-welfare` 첫 실행 기준)

| 단계 | 예상 |
|---|---|
| 원본 | ~24분 |
| + B1 (Neo4j UNWIND) + B2 (Postgres skip) | ~12분 |
| + B3 (EMBED_BATCH 100) | ~6~8분 |
| + B4 (keepAlive) | ~4~6분 |
| + B5 (제약 인덱스) | **~3~4분** (5~7x) |

증분 재실행 (대부분 skip)은 **20~40초** 수준 예상.

---

## 8. 회복 절차 (참고)

### 8.1 stale 동기화 정리
```bash
docker exec welfare_postgres psql -U welfare -d welfare_ai -c \
  "UPDATE data_sync_logs SET status='FAILED', \"finishedAt\"=NOW(), phase='중단됨'
   WHERE status IN ('RUNNING','PENDING') AND \"updatedAt\" < NOW() - INTERVAL '30 minutes';"
```

### 8.2 단일 시드 재실행 (dev-watch 우회)
```bash
cd /Users/sangwoo/welfare-ai/apps/api
nohup pnpm db:seed:local-welfare > /tmp/local-welfare-sync.log 2>&1 &
disown
```
- 장점: dev-watch 영향 없음
- 단점: `data_sync_logs`에 진행도 안 잡힘 (stdout 파일에만)

### 8.3 어드민 트리거 (API 라우트 살아있을 때)
```bash
TOKEN=$(node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'<admin-uuid>', email:'<admin-email>', role:'ADMIN'}, process.env.JWT_SECRET, {expiresIn:'30m'}))")
curl -X POST http://localhost:3001/api/admin/sync -H "Authorization: Bearer $TOKEN"
```
