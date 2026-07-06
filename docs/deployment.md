# 배포 가이드 (Vercel + Railway)

기준일: 2026-07-06

AWS 이전 단계의 "간편 배포" 구성. 모노레포에서 프론트/백엔드를 각각 push 트리거로 자동 배포한다.

```
GitHub main push
 ├─ Vercel   → apps/web (Next.js 15)
 └─ Railway  → apps/api (NestJS, Docker) + Postgres + Redis + Qdrant + Neo4j
```

## 왜 이 조합인가

- **Vercel**: Next.js 네이티브. 모노레포 Root Directory 지정만 하면 turbo/pnpm 자동 인식.
- **Railway**: Dockerfile 그대로 사용, Postgres/Redis 원클릭, **Qdrant·Neo4j도 도커 이미지 서비스로 같은 프로젝트에 배치 가능**(프라이빗 네트워킹) — 이 프로젝트처럼 인프라가 4개인 경우 관리 포인트가 한 곳으로 모인다. Hobby $5/월 + 사용량.
- 대안: Render(Blueprint 유사 구성, 프리티어는 슬립), 또는 Railway에는 API만 두고 Neon(PG)/Upstash(Redis)/Qdrant Cloud/Neo4j Aura 무료 티어 조합(비용 최소화, 관리 포인트 분산).

## 사전 검증된 것 (2026-07-06)

- `docker build -f apps/api/Dockerfile .` 성공 (773MB) — 로컬 인프라 대상 기동·마이그레이션·헬스체크 통과.
- 헬스체크: `GET /api/v1/health`
- 컨테이너 entrypoint가 부팅 시 마이그레이션 자동 실행 (`scripts/docker-entrypoint.sh`).
- `apps/api/railway.json`에 빌더·헬스체크 config-as-code 포함.

## 1. Railway (백엔드 + 인프라)

1. railway.com → New Project → **Deploy from GitHub repo** (`Han-wo/wel-fare`).
2. 생성된 서비스의 Settings → **Config-as-code file**: `apps/api/railway.json` 지정. (Dockerfile 경로·헬스체크가 자동 적용됨)
3. 같은 프로젝트에 인프라 추가:
   - **Postgres**: Create → Database → PostgreSQL
   - **Redis**: Create → Database → Redis
   - **Qdrant**: Create → Empty Service → Source: Docker Image `qdrant/qdrant` → Volume `/qdrant/storage` 연결
   - **Neo4j**: Create → Empty Service → Docker Image `neo4j:5` → Volume `/data` 연결, 변수 `NEO4J_AUTH=neo4j/<비밀번호>`
4. API 서비스 Variables (Railway reference 문법으로 내부 연결):

| 변수 | 값 |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `${{Redis.RAILWAY_PRIVATE_DOMAIN}}` / `6379` / `${{Redis.REDIS_PASSWORD}}` |
| `QDRANT_URL` | `http://${{Qdrant.RAILWAY_PRIVATE_DOMAIN}}:6333` |
| `QDRANT_COLLECTION` | 로컬 .env와 동일 |
| `NEO4J_URI` | `bolt://${{Neo4j.RAILWAY_PRIVATE_DOMAIN}}:7687` |
| `NEO4J_USERNAME` / `NEO4J_PASSWORD` | neo4j / 3에서 정한 값 |
| `WEB_URL` | Vercel 프로덕션 도메인 (CORS 허용 오리진) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | 신규 발급(로컬 값 재사용 금지) |
| `OPENAI_API_KEY` / `OPENAI_CHAT_MODEL` / `OPENAI_EMBEDDING_MODEL` | 로컬 .env 참고 |
| `OPENAI_ROUTER_MODEL` | (선택) 라우팅 폴백용 소형 모델 |
| `LANGCHAIN_*` | (선택) LangSmith 추적 |
| `BOKJIRO_API_KEY` 등 공공데이터 키 5종 | 로컬 .env 참고 — 데이터 시딩·싱크에 필요 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 관리자 시드용 |

   `PORT`는 Railway가 주입하고 main.ts가 읽는다. 별도 설정 불필요.
5. API 서비스 Settings → Networking → **Generate Domain** (프론트가 쓸 공개 URL).
6. 배포 확인: `https://<api-domain>/api/v1/health` → `{"status":"ok"}`. 마이그레이션은 부팅 시 자동.

## 2. 데이터 시딩 (최초 1회)

빈 DB/Qdrant/Neo4j 상태이므로 Railway 서비스 쉘(또는 로컬에서 프로덕션 env로) 실행:

```bash
pnpm --filter @welfare-ai/api db:seed:admin     # 관리자 계정
pnpm --filter @welfare-ai/api db:seed           # 정책 데이터 수집 + 임베딩 + 그래프 (시간·OpenAI 비용 발생)
```

이후 갱신은 data-sync 모듈/`db:seed:*` 개별 스크립트로.

## 3. Vercel (프론트)

1. vercel.com → Add New Project → 같은 repo import.
2. **Root Directory: `apps/web`** (Framework: Next.js 자동 감지).
3. Environment Variables:
   - `NEXT_PUBLIC_API_URL` = Railway API 도메인 (예: `https://wel-fare-api.up.railway.app`) — **끝에 `/api/v1` 붙이지 않음** (프론트 코드가 붙임)
4. Deploy → 도메인 확정되면 **Railway의 `WEB_URL`을 그 도메인으로 업데이트** (CORS).

## 4. 배포 후 점검 체크리스트

- [ ] `/api/v1/health` OK
- [ ] 회원가입 → 채팅 질문 → SSE 스트리밍 답변
- [ ] HITL 패널 → 답변 제출 → 재개 (네트워크 탭에서 `hitl=` 파라미터 확인)
- [ ] `/admin/observability` 품질 카드 렌더 (관리자 계정)
- [ ] `pnpm rag:quality` 원격 DB 대상 실행 가능 여부

## 주의사항

- **`.dockerignore`에 `**/*.tsbuildinfo` 필수** — 로컬 TS incremental 캐시가 이미지에 새면 빌드가 낡은 진단으로 오판한다(실제 발생 이력).
- pnpm v10부터 `pnpm deploy`는 `--legacy` 플래그 필요 (Dockerfile에 반영됨).
- Qdrant/Neo4j를 Railway 볼륨으로 운영 시 백업이 없다 — 시드 스크립트로 재구축 가능하므로 초기엔 허용, 트래픽 붙으면 관리형(Qdrant Cloud/Aura) 이전 검토.
- typescript는 `~5.7.3` 고정 — 5.8+는 LangGraph 타입 전개로 빌드 불가(TS2589/OOM).
