# welFareAI UI 리디자인 — Claude Code 핸드오프

## 1. 먼저 공유할 것 (3가지)

### ① 이 리디자인 프로젝트 전체
Claude Code에게 이 프로젝트 폴더를 통째로 보여주세요. 특히:
- `index.html` — 디자인 토큰 (CSS variables, 팔레트 · radius · shadow · font)
- `screens/*.jsx` — **11개 화면**의 참조 구현
- `icons.jsx` — 아이콘 세트 (Lucide 동형 → 기존 `lucide-react` 그대로 사용 가능)

### ② 기존 코드베이스
`welfare-ai/apps/web/` 의 기존 Next.js 앱

### ③ 아래 지시문 (복붙해서 전달)

---

## 2. Claude Code에 전달할 지시문 (복사용)

> welFareAI 웹앱의 UI를 전면 리디자인하려고 해. `/design-references/` (이 프로젝트의 `index.html` + `screens/` 폴더)에 시안이 있어. 시안 JSX를 **직접 읽고** 토큰·레이아웃·컴포넌트를 그대로 옮겨줘. 스크린샷 기반 추측 금지.
>
> ### Phase 1 — 디자인 토큰 교체
> 1. `apps/web/app/globals.css` 의 `:root` 변수 전체를 시안의 `index.html` `:root` 블록으로 교체
> 2. 기존 `.surface`, `.glass`, `.surface-soft`, `.hero-grid`, `.button-primary`, `.button-secondary`, `.field-shell`, `.badge-soft`, `.pulse-glow`, `.floating-card`, `.soft-float*`, `.gradient-text`, `.section-kicker`, `.display-text` 유틸리티 클래스는 **전부 제거**
> 3. 대신 시안의 `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input`, `.label`, `.card`, `.brand-mark`, `.brand-lockup`, `.kbd` 를 그대로 가져와서 대응
> 4. `body` 배경 gradient 제거 → `background: var(--bg-canvas)`
> 5. `app/layout.tsx` 의 `Manrope`, `Space_Grotesk` 제거 → Pretendard Variable CDN 추가 (`<link>` in `<head>`) 하고 `--font-sans: 'Pretendard Variable', ...` 로 통일
>
> ### Phase 2 — 화면별 교체 (11개 시안 → 실제 라우트 1:1 매핑)
>
> **기본 레이아웃**
> - `app/(main)/layout.tsx` — 사이드바 ← `screens/chat-index.jsx` 의 `Sidebar` 컴포넌트 (공용 레이아웃)
>
> **랜딩 / 인증**
> - `app/page.tsx` ← `screens/landing.jsx`
> - `app/(auth)/login/page.tsx` ← `screens/auth.jsx` `LoginScreen`
> - `app/(auth)/register/page.tsx` ← `screens/auth.jsx` `RegisterScreen` (3-step 유지, pill stepper + 좌측 다크 브랜드 패널)
>
> **채팅**
> - `app/(main)/chat/page.tsx` ← `screens/chat-index.jsx` `ChatIndexScreen`
> - `app/(main)/chat/[sessionId]/page.tsx` ← `screens/chat-session.jsx` (메시지 구조 + `PolicyCard` 컴포넌트 신규)
>
> **프로필**
> - `app/(main)/profile/page.tsx` ← `screens/profile.jsx`
>
> **정책**
> - `app/(main)/policies/page.tsx` (신규) ← `screens/extra-pages.jsx` `PoliciesListScreen`
> - `app/(main)/policies/[id]/page.tsx` ← `screens/extra-pages.jsx` `PolicyDetailScreen`
>
> **저장 / 알림**
> - `app/(main)/bookmarks/page.tsx` (신규) ← `screens/extra-pages.jsx` `BookmarksScreen`
> - `app/(main)/notifications/page.tsx` (신규) ← `screens/extra-pages.jsx` `NotificationsScreen`
>
> **관리자 콘솔**
> - `app/admin/page.tsx` ← `screens/admin-sync.jsx` `AdminSyncScreen` (기존 통계·로그·진행도 모달 로직 그대로 유지, JSX만 교체)
> - `app/admin/traces/page.tsx` ← `screens/admin-trace.jsx` + `admin-trace-extra.jsx` (개요/그래프/이벤트 타임라인 3-탭 구조)
> - `components/admin-console-nav.tsx` ← `AdminSidebar` 패턴으로 교체 (좌측 고정 사이드바)
>
> ### Phase 3 — 신규 컴포넌트
> - `components/policy/policy-card.tsx` — 시안 `PolicyCard` (채팅 내 인라인용) TSX 포팅. props: `{ title, tag, agency, deadline, eligibility, amount, officialUrl, onBookmark }`
> - `components/policy/policy-list-card.tsx` — 정책 목록 그리드용 카드 (`PolicyListCard`)
> - `components/policy/tag-pill.tsx` — 공용 뱃지 (`TagPill` kind: accent | warning | danger | default, padding 3px 9px 고정)
> - `components/layout/sidebar.tsx` — 사용자용 좌측 사이드바 (bookmarks / notifications / policies 네비 포함)
> - `components/layout/admin-sidebar.tsx` — 관리자용 사이드바
> - `components/admin/status-pill.tsx` — success/running/failed/pending 공용 상태 뱃지
> - `components/admin/trace-graph-canvas.tsx` — SVG 기반 노드/관계 시각화 (시안의 `GraphCanvas` 참조, 실제 데이터 바인딩 필요)
> - `components/notifications/notif-row.tsx` — deadline/match/info/update/system 5가지 type 지원
>
> ### Phase 4 — 규칙
> - border-radius는 **6 / 8 / 12 / 16px 네 단계만**. 기존 22/26/28/34px는 전부 교체
> - `backdrop-filter: blur()` + 반투명 `rgba(255,255,255,0.xx)` **전부 제거** → 실선 border + solid fill
> - `pulse-glow`, `floating-card`, `soft-float`, `reveal-up` 장식 애니메이션 제거. transition 0.15s만
> - **뱃지 padding 통일**: `TagPill` 은 `3px 9px`, `StatusPill` 은 `2px 8px`, 탭 count 는 `1px 7px`. 개별 `<span>` 에 임의 padding 쓰지 말고 공용 컴포넌트 사용
> - 아이콘은 `lucide-react` 유지. 시안의 `icons.jsx` 는 참조용
> - Tailwind 유틸 남용 대신 `className="btn-primary"` 같은 시안 클래스 우선
> - TypeScript strict 유지, `any` 금지
> - **기존 비즈니스 로직 (useChat, api, zod schema, react-hook-form, Zustand store, admin 폴링 로직) 은 건드리지 말 것.** JSX 구조와 스타일만 교체
>
> ### Phase 5 — 검증
> `pnpm dev` 후 다음 route 전부 확인:
> - `/`, `/login`, `/register`
> - `/chat`, `/chat/[id]`
> - `/profile`, `/policies`, `/policies/[id]`
> - `/bookmarks`, `/notifications`
> - `/admin`, `/admin/traces` (개요/그래프/이벤트 탭)
>
> 체크: 콘솔 에러 0, Pretendard 로드 확인, radius 4단계 준수, glassmorphism 잔재 없음, 관리자 폴링/동기화 기능 정상 동작.

---

## 3. 핵심 변경 요약 (구두 브리핑용)

| 항목 | Before | After |
|---|---|---|
| 색상 | warm beige + 혼잡한 green 계열 | cream + **sage teal (#2d6a5f)** |
| 폰트 | Manrope + Space Grotesk | **Pretendard Variable** |
| radius | 22, 26, 28, 34px 혼재 | **6 / 8 / 12 / 16px** |
| 효과 | glassmorphism, blur, gradient, glow | **실선 border + solid fill** |
| 애니메이션 | float, pulse, reveal | **transition 0.15s만** |
| 뱃지 | padding 제각각 | **TagPill / StatusPill 공용화** |
| 사이드바 | 넓은 패딩, 반투명 | 컴팩트 240px, 실선, 검색 포함 |
| 채팅 | bubble 말풍선 | 아바타 + 좌측 정렬 + PolicyCard |
| 프로필 | 섹션 카드 쌓기 | Settings 2-col (label/field) |
| Admin | 둥근 카드 + glass | 실선 패널 + 통합 사이드바 |
| Trace | 단일 스크롤 | **3-탭 (개요/그래프/이벤트)** + 노드 인스펙터 |

## 4. 전달 방법

**권장 — 옵션 A: 레퍼런스 폴더로 복사**
```bash
# welfare-ai 루트에서
mkdir -p design-references
cp -r <이-프로젝트>/index.html  design-references/design-tokens.html
cp -r <이-프로젝트>/screens      design-references/screens
cp -r <이-프로젝트>/icons.jsx    design-references/icons.jsx
cp -r <이-프로젝트>/app.jsx      design-references/app.jsx
```

그 다음 Claude Code에게:
> `design-references/` 의 시안을 보고 `HANDOFF.md` Phase 1 → 5 순서로 작업해줘. 각 Phase 끝날 때마다 diff 보여주고 확인받고 다음으로 진행해.

**옵션 B — Zip 첨부**
이 프로젝트를 zip으로 다운로드 → Claude Code 세션에 첨부

**옵션 C — 스크린샷 + 지시문** (비권장, 구현 디테일 손실)

## 5. 주의사항

- 디자인 토큰은 반드시 CSS 변수로만. Tailwind config 의 `brand` 색상 object 는 삭제하거나 sage teal 값으로 교체
- Pretendard CDN은 한국어 subset + 영문/숫자 포함 버전
- 브랜드 로고 이미지 (`/api/brand-logo`) 는 유지하되, 좁은 공간에서는 CSS `brand-mark` (28px 사각형) 로 대체
- 모바일 반응형은 현재 시안에 없음 → **desktop-first로 먼저 맞추고 모바일은 2차 작업**
- 관리자 콘솔의 폴링 (10초 간격 stats, 1.2초 sync progress, 15초 traces) 은 기존 로직 100% 보존
- Neo4j 노드 라벨 한글 매핑 (`NODE_LABELS` 객체) 은 기존 `admin/page.tsx` 에서 그대로 재사용
- SyncProgressModal 의 모든 필드 (seed progress, phase, fetchCurrent 등) 는 시안 디자인에 맞춰 재배치만 하고 필드 제거 금지

## 6. 파일 매핑 치트시트

```
시안 파일                            → 실제 라우트
────────────────────────────────────────────────────────────────
screens/landing.jsx                 → app/page.tsx
screens/auth.jsx (LoginScreen)      → app/(auth)/login/page.tsx
screens/auth.jsx (RegisterScreen)   → app/(auth)/register/page.tsx
screens/chat-index.jsx (Sidebar)    → app/(main)/layout.tsx
screens/chat-index.jsx (ChatIndex)  → app/(main)/chat/page.tsx
screens/chat-session.jsx            → app/(main)/chat/[sessionId]/page.tsx
screens/profile.jsx                 → app/(main)/profile/page.tsx
screens/extra-pages.jsx
  ├─ PoliciesListScreen             → app/(main)/policies/page.tsx       [신규]
  ├─ PolicyDetailScreen             → app/(main)/policies/[id]/page.tsx
  ├─ BookmarksScreen                → app/(main)/bookmarks/page.tsx      [신규]
  └─ NotificationsScreen            → app/(main)/notifications/page.tsx  [신규]
screens/admin-sync.jsx              → app/admin/page.tsx
screens/admin-trace.jsx             → app/admin/traces/page.tsx (개요 탭)
screens/admin-trace-extra.jsx
  ├─ AdminTraceGraphScreen          → app/admin/traces/page.tsx (그래프 탭)
  └─ AdminTraceEventsScreen         → app/admin/traces/page.tsx (이벤트 탭)
```
