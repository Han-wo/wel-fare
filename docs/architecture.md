# WelfareAI — 초개인화 복지·지원금 AI 컨설턴트 풀스택 기획서

> **Stack**: Next.js 15 · NestJS 11 · Turborepo Monorepo · pnpm Workspaces
> **패러다임**: RAG + Neo4j 온톨로지 추론 + 공공 API 실시간 연동
> **작성일**: 2026.03

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택 & 버전 명세](#2-기술-스택--버전-명세)
3. [Turborepo 모노레포 구조](#3-turborepo-모노레포-구조)
4. [시스템 아키텍처](#4-시스템-아키텍처)
5. [공공 API 목록 및 연동 전략](#5-공공-api-목록-및-연동-전략)
6. [온톨로지 & 지식 그래프 설계 (Neo4j)](#6-온톨로지--지식-그래프-설계-neo4j)
7. [RDB 스키마 설계 (PostgreSQL)](#7-rdb-스키마-설계-postgresql)
8. [RAG 파이프라인 설계](#8-rag-파이프라인-설계)
9. [백엔드 NestJS 11 모듈 설계](#9-백엔드-nestjs-11-모듈-설계)
10. [프론트엔드 Next.js 15 페이지 설계](#10-프론트엔드-nextjs-15-페이지-설계)
11. [API 엔드포인트 명세](#11-api-엔드포인트-명세)
12. [필요 라이브러리 전체 목록](#12-필요-라이브러리-전체-목록)
13. [인프라 & Docker Compose](#13-인프라--docker-compose)
14. [환경 변수 명세](#14-환경-변수-명세)
15. [개발 로드맵 (스프린트)](#15-개발-로드맵-스프린트)

---

## 1. 프로젝트 개요

### 1.1 문제 정의

| 문제 | 현황 |
|------|------|
| 정보 파편화 | 중앙부처·지자체·공단 등 300개 이상 기관에 분산 |
| 조건 복잡성 | 나이·소득분위·가구형태·거주지·직업 등 다변수 자격 요건 |
| 정보 최신성 | 모집 기간·예산 소진으로 수시 변경 |
| 언어 장벽 | 행정 용어 공고문을 일반인이 이해하기 어려움 |

### 1.2 핵심 기능

| 기능 | 설명 |
|------|------|
| AI 채팅 컨설팅 | 자연어 질문 → 맞춤 지원금 스트리밍 답변 |
| 사용자 프로필 | 속성(나이/지역/소득/가구형태 등) 저장 → 자동 자격 매칭 |
| 알림 구독 | 새 공고 등록 시 조건 맞는 사용자에게 Push/Email |
| 대시보드 | 나에게 맞는 지원금 목록 + 신청 현황 |
| 정책 검색 | 키워드·카테고리·지역 필터 검색 |
| 신청 트래커 | 관심 정책 북마크 및 신청 현황 관리 |

### 1.3 데이터 플로우 요약

```
사용자 질문
  → [1] 프로파일 로드 (PostgreSQL)
  → [2] 온톨로지 추론 (Neo4j Cypher: 속성 → 자격 → 정책)
  → [3] 벡터 유사도 검색 (Qdrant: Top-K 청크)
  → [4] 컨텍스트 조합 (추론 경로 + 원문 청크)
  → [5] LLM 생성 (GPT-4o / Claude API → SSE 스트리밍)
  → [6] 응답 저장 (PostgreSQL chat_messages)
```

---

## 2. 기술 스택 & 버전 명세

| 영역 | 기술 | 버전 | 비고 |
|------|------|------|------|
| **프론트엔드** | Next.js | **15.x** | App Router |
| | React | 19.x | Server Components |
| | TypeScript | 5.x | strict mode |
| | TailwindCSS | 3.x | |
| | shadcn/ui | latest | Radix UI 기반 |
| **백엔드** | NestJS | **11.x** | Fastify adapter |
| | Node.js | 22.x LTS | |
| | TypeScript | 5.x | |
| **모노레포** | Turborepo | 2.x | 태스크 오케스트레이션 |
| | pnpm | 10.x | 워크스페이스 패키지 매니저 |
| **주 DB** | PostgreSQL | 16.x | TypeORM |
| **그래프 DB** | Neo4j | 5.x | 온톨로지/지식 그래프 |
| **벡터 DB** | Qdrant | latest | RAG 임베딩 검색 |
| **캐시/큐** | Redis | 7.x | BullMQ + 세션 캐시 |
| **AI/LLM** | OpenAI GPT-4o | latest | 답변 생성 + 임베딩 |
| | Anthropic Claude | claude-sonnet | 대안 LLM |
| **LangChain** | LangGraph.js | 0.2.x | RAG 파이프라인 상태 머신 |
| | LangSmith | 0.2.x | 파이프라인 트레이싱 |
| **인증** | JWT + OAuth2 | - | Kakao / Naver / Google |
| **알림** | Firebase FCM | v12 | Push 알림 |
| **이메일** | Resend | 3.x | 트랜잭션 메일 |
| **파일저장** | AWS S3 | - | 공문 PDF 저장 |
| **컨테이너** | Docker + Compose | - | 개발/운영 환경 |

---

## 3. Turborepo 모노레포 구조

```
welfare-ai/
├── apps/
│   ├── web/          ← Next.js 15 프론트엔드
│   └── api/          ← NestJS 11 백엔드
├── packages/
│   ├── shared-types/     ← 공용 TypeScript 타입
│   ├── shared-utils/     ← 공용 유틸 (소득 계산, 지역 코드)
│   ├── ontology-schema/  ← Neo4j 시드 Cypher
│   ├── ui/               ← 공용 React 컴포넌트
│   └── eslint-config/    ← 공용 ESLint 설정
├── infra/
│   ├── docker-compose.dev.yml    ← 인프라 (DB, 캐시)
│   ├── docker-compose.prod.yml   ← 전체 서비스 포함
│   └── nginx/nginx.conf
├── docs/
│   └── architecture.md   ← 이 문서
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. 시스템 아키텍처

```
┌──────────────────────────────────────────────────┐
│                   CLIENT TIER                    │
│   Next.js 15 (App Router)                        │
│   React 19 · TailwindCSS · shadcn/ui · Zustand   │
└──────────────────┬───────────────────────────────┘
                   │ HTTPS / SSE
┌──────────────────▼───────────────────────────────┐
│               API GATEWAY TIER                   │
│   NestJS 11 + Fastify                            │
│   JWT Auth · Throttler · Swagger · CORS          │
└──────┬──────────┬────────────┬───────────────────┘
       │          │            │
  ┌────▼───┐ ┌───▼────┐ ┌─────▼──────┐
  │  Auth  │ │Profile │ │ RAG Engine │
  │ Module │ │ Module │ │ (LangGraph)│
  └────────┘ └────────┘ └─────┬──────┘
                               │ LangSmith 트레이싱
┌──────────────────────────────▼───────────────────┐
│                   DATA TIER                      │
│  PostgreSQL · Neo4j · Qdrant · Redis             │
└──────────────────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────┐
│               EXTERNAL SERVICES                  │
│  복지로 API · data.go.kr · 서울/경기 OpenAPI      │
│  OpenAI · Claude · Firebase FCM · Resend · S3    │
└──────────────────────────────────────────────────┘
```

---

## 5. 공공 API 목록 및 연동 전략

### 5.1 핵심 공공 API 목록

| API명 | 제공기관 | 인증 | 주요 데이터 |
|-------|---------|------|------------|
| 복지로 서비스 목록/상세 | 보건복지부 | API Key | 복지서비스 전반 |
| 청년정책 통합 포털 | 청년정책조정위원회 | API Key | 청년 특화 정책 |
| 국민취업지원제도 | 고용노동부 | API Key | 취업지원금·훈련비 |
| 주거급여·청년월세 | 국토교통부 | API Key | 주거 지원 현황 |
| 서울시 복지포털 | 서울특별시 | API Key | 서울 자체 복지 |
| 경기도 복지사업 | 경기도 | API Key | 경기 복지정책 |
| 소상공인 지원사업 | 중소벤처기업부 | API Key | 소상공인·스타트업 |
| 서민금융 지원상품 | 금융위원회 | API Key | 저금리 대출·보증 |
| 행정구역 코드 | 행정안전부 | API Key | 시군구 코드 |

### 5.2 동기화 스케줄

```typescript
@Cron('0 2 * * *')   // 매일 02:00 — 전체 정책 목록 갱신
@Cron('0 * * * *')   // 매 1시간 — 만료 정책 상태 업데이트
@Cron('0 6 * * *')   // 매일 06:00 — 임베딩 + Neo4j 갱신
@OnEvent('policy.created')  // 신규 공고 → 매칭 사용자 알림
```

---

## 6. 온톨로지 & 지식 그래프 설계 (Neo4j)

### 6.1 노드 타입

```cypher
(:Policy { id, externalId, name, category, status, maxBenefit, benefitType })
(:Requirement { id, reqType, operator, minValue, maxValue, valueList })
(:Attribute { id, name, attrType })   // 청년, 1인가구, 무주택자...
(:Region { code, name, level })       // NATION | SIDO | SIGUNGU
(:IncomeBracket { level, label })     // 중위소득 % (40~200)
```

### 6.2 관계 타입

```cypher
(:Policy)-[:REQUIRES]->(:Requirement)
(:Policy)-[:APPLICABLE_IN]->(:Region)
(:Policy)-[:INCOME_LIMIT]->(:IncomeBracket)
(:Policy)-[:TARGETS]->(:Attribute)
(:Attribute)-[:INCLUDES]->(:Attribute)
(:Region)-[:CONTAINS]->(:Region)
```

### 6.3 핵심 추론 쿼리 (예: 서울 30세 무주택 프리랜서)

```cypher
MATCH (p:Policy)-[:REQUIRES]->(req:Requirement)
WHERE (
  (req.reqType = 'AGE' AND 30 >= req.minValue AND 30 <= req.maxValue)
  OR (req.reqType = 'EMPLOYMENT' AND 'FREELANCER' IN req.valueList)
  OR (req.reqType = 'HOUSING' AND 'NON_OWNER' IN req.valueList)
)
WITH p, count(req) AS matchScore
ORDER BY matchScore DESC
RETURN p LIMIT 20
```

---

## 7. RDB 스키마 설계 (PostgreSQL)

### ERD

```
users ──── user_profiles
  │
  ├── chat_sessions ── chat_messages
  ├── bookmarks ────── policies ── policy_requirements
  ├── notifications
  └── notification_subscriptions
```

주요 테이블: `users`, `user_profiles`, `policies`, `policy_requirements`,
`chat_sessions`, `chat_messages`, `bookmarks`, `notifications`, `notification_subscriptions`

---

## 8. RAG 파이프라인 설계 (LangGraph)

### 8.1 그래프 흐름

```
[START]
  ↓ load_profile       → PostgreSQL 프로필 로드
  ↓ ontology_infer     → Neo4j Cypher 추론 (traceable → LangSmith)
  ↓ vector_retrieve    → Qdrant 벡터 검색 (traceable → LangSmith)
  ↓ grade_documents    → 관련성 점수 필터 (score >= 0.65)
  ↓ generate_answer    → GPT-4o SSE 스트리밍
  ↓ save_message       → PostgreSQL 저장
[END]
```

### 8.2 LangSmith 트레이싱

```
[welfare-rag-pipeline]           ← invoke() 최상위 트레이스
  ├── load_profile
  ├── ontology_infer
  │     └── neo4j_ontology_infer  ← traceable (run_type: retriever)
  ├── vector_retrieve
  │     └── qdrant_vector_search  ← traceable (run_type: retriever)
  ├── grade_documents
  ├── generate_answer
  │     └── welfare-rag-generation
  │           ├── ChatPromptTemplate
  │           ├── ChatOpenAI (gpt-5-mini)
  │           └── StringOutputParser
  └── save_message
```

환경변수: `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY=ls__...`, `LANGCHAIN_PROJECT=welfare-ai-rag`

---

## 9. 백엔드 NestJS 11 모듈 구조

```
src/
├── main.ts                    ← Fastify 부트스트랩
├── app.module.ts
└── modules/
    ├── auth/                  ← JWT + OAuth2 (Kakao/Naver/Google)
    ├── users/                 ← User Entity
    ├── profile/               ← UserProfile Entity + CRUD
    ├── policies/              ← Policy Entity + 검색
    ├── rag/                   ← LangGraph 파이프라인 + SSE 스트리밍
    ├── chat/                  ← 채팅 세션/메시지
    ├── crawler/               ← BullMQ 크롤링 잡 (공공API 동기화)
    ├── notifications/         ← FCM Push + Resend 이메일
    └── bookmarks/             ← 북마크 + 신청 상태 트래커
```

---

## 10. 프론트엔드 Next.js 15 페이지 설계

| 경로 | 렌더링 | 주요 기능 |
|------|--------|---------|
| `/` | RSC | 랜딩 페이지 |
| `/login`, `/register` | Client | 인증 폼 |
| `/(main)` | RSC + Layout | 인증 필요 레이아웃 |
| `/chat` | Client | SSE 스트리밍 채팅 |
| `/policies` | RSC + Suspense | 정책 목록/검색 |
| `/policies/[id]` | RSC | 정책 상세 + 자격 요건 |
| `/profile` | Client | 프로필 위저드 |
| `/bookmarks` | RSC | 북마크 + 신청 트래커 |
| `/notifications` | Client | 알림 + FCM 설정 |

---

## 11. API 엔드포인트 명세

| 모듈 | Method | Path | 설명 |
|------|--------|------|------|
| Auth | POST | `/api/v1/auth/register` | 회원가입 (프로필 포함) |
| Auth | POST | `/api/v1/auth/login` | 이메일 로그인 |
| Auth | POST | `/api/v1/auth/refresh` | 토큰 갱신 |
| Profile | GET/PUT | `/api/v1/profile` | 프로필 조회/수정 |
| Policies | GET | `/api/v1/policies` | 목록 (페이지네이션) |
| Policies | GET | `/api/v1/policies/search` | 키워드 검색 |
| Policies | GET | `/api/v1/policies/:id` | 상세 |
| RAG | SSE GET | `/api/v1/rag/stream` | AI 답변 스트리밍 |
| Chat | GET/POST | `/api/v1/chat/sessions` | 세션 목록/생성 |
| Chat | GET | `/api/v1/chat/sessions/:id/messages` | 메시지 이력 |
| Bookmarks | GET/POST/PATCH/DELETE | `/api/v1/bookmarks` | 북마크 CRUD |
| Notifications | GET/PATCH | `/api/v1/notifications` | 알림 목록/읽음 처리 |

---

## 12. 인프라 & Docker Compose

### 개발 (infra/docker-compose.dev.yml)
인프라만 컨테이너로 실행, 앱은 로컬 dev 서버

`infra/.env`에서 개발용 비밀번호를 관리

| 서비스 | 포트 | 인증 정보 |
|--------|------|---------|
| PostgreSQL 16 | 5432 | `infra/.env`의 `POSTGRES_*` |
| Neo4j 5 | 7474(HTTP), 7687(Bolt) | `infra/.env`의 `NEO4J_AUTH` |
| Qdrant | 6333(REST), 6334(gRPC) | - |
| Redis 7 | 6379 | `infra/.env`의 `REDIS_PASSWORD` |

### 운영 (infra/docker-compose.prod.yml)
앱 컨테이너 포함 전체 스택 실행

```
pnpm run infra:up          # 인프라 기동
pnpm db:seed:neo4j         # Neo4j 온톨로지 시드
pnpm db:seed:qdrant        # Qdrant 컬렉션 초기화
pnpm dev                   # 앱 개발 서버 (web:3000, api:3001)
```

---

## 13. 환경 변수

`apps/web/.env.local` / `apps/api/.env` 주요 변수:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
DATABASE_URL=postgresql://welfare:<POSTGRES_PASSWORD>@localhost:5432/welfare_ai
NEO4J_URI=bolt://localhost:7687
QDRANT_URL=http://localhost:6333
REDIS_HOST=localhost / REDIS_PASSWORD=<REDIS_PASSWORD>
JWT_SECRET=...  JWT_REFRESH_SECRET=...
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-5-mini
PUBLIC_DATA_API_KEY=...
BOKJIRO_API_KEY=...
YOUTH_CENTER_API_KEY=...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=welfare-ai-rag
```

---

## 14. 개발 로드맵

| 스프린트 | 목표 |
|---------|------|
| Sprint 0 | 모노레포 셋업 + 인프라 |
| Sprint 1 | 인증 + 사용자 관리 |
| Sprint 2 | 사용자 프로필 위저드 |
| Sprint 3 | 공공 API 크롤러 |
| Sprint 4 | 온톨로지 구축 |
| Sprint 5 | RAG 파이프라인 |
| Sprint 6 | 채팅 UI |
| Sprint 7 | 대시보드 + 정책 검색 |
| Sprint 8 | 알림 시스템 |
| Sprint 9 | 북마크 + 신청 트래커 |
| Sprint 10 | 품질 + 최적화 |
| Sprint 11 | 배포 준비 (CI/CD) |
