# 완전 무료 배포: Oracle Cloud Always Free + Vercel

기준일: 2026-07-06

```
GitHub main
 ├─ Vercel (무료)         → apps/web
 └─ Oracle Always Free VM → docker compose: Caddy(HTTPS) + API + PG + Redis + Qdrant + Neo4j
                             도메인: DuckDNS (무료)
```

Oracle **Ampere A1 (ARM): 4 OCPU / 24GB RAM / 200GB 디스크 — 영구 무료.** 이 스택 전부를 여유 있게 돌린다. 가입 시 카드 인증이 필요하지만 Always Free 리소스만 쓰면 청구되지 않는다.

## 1. Oracle VM 만들기

1. https://cloud.oracle.com 가입 (홈 리전은 **South Korea Central (Seoul)** 권장 — 이후 변경 불가)
2. Compute → Instances → **Create Instance**
   - Image: **Ubuntu 24.04** (aarch64)
   - Shape: **Ampere → VM.Standard.A1.Flex → 4 OCPU / 24GB** (Always Free 한도 전부 사용)
   - SSH 키: 본인 공개키 업로드
   - ⚠️ "Out of capacity" 에러가 흔하다(무료 ARM 인기). 시간대 바꿔 재시도하거나 며칠 걸릴 수 있음. 급하면 일단 x86 Micro(1GB, 프리티어 2대)로… 는 이 스택엔 부족하므로 A1을 기다리는 게 맞다.
3. **네트워크 열기** (VCN → Security List → Ingress Rules):
   - `0.0.0.0/0` TCP **80**, **443** 추가 (22는 기본 열림)
4. ⚠️ **오라클 우분투 함정**: OS 안에 iptables REJECT 규칙이 기본 탑재돼 있어 Security List를 열어도 접속이 안 된다. SSH 접속 후:
   ```bash
   sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 2. 무료 도메인 (DuckDNS)

Vercel(https) 프론트가 API를 부르려면 API도 https여야 한다 → 도메인 필요.

1. https://www.duckdns.org (GitHub 로그인) → 서브도메인 생성 (예: `welfare-api`)
2. current ip에 VM 공인 IP 입력 → `welfare-api.duckdns.org`가 VM을 가리킴

## 3. 서버 셋업

```bash
ssh ubuntu@<VM_IP>

# Docker 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit   # 재접속

# 코드
git clone https://github.com/Han-wo/wel-fare.git && cd wel-fare

# 환경변수
cp infra/.env.prod.example infra/.env.prod
vi infra/.env.prod
```

`.env.prod` 필수 항목: `DOMAIN`(DuckDNS 도메인), `POSTGRES_PASSWORD`/`NEO4J_PASSWORD`/`REDIS_PASSWORD`(신규 생성), `JWT_SECRET`/`JWT_REFRESH_SECRET`(`openssl rand -base64 48`), `OPENAI_API_KEY`, 공공데이터 키 5종, `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `WEB_URL`(일단 아무 값, Vercel 후 교체).

## 4. 기동

```bash
# 프론트는 Vercel이므로 web 제외하고 기동 (ARM에서 API 이미지 네이티브 빌드)
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml \
  up -d --build postgres redis neo4j qdrant api caddy

# 확인 (마이그레이션은 entrypoint가 자동 실행)
docker compose -f infra/docker-compose.prod.yml logs -f api   # "Nest application successfully started"
curl https://<DOMAIN>/api/v1/health                            # {"status":"ok"}
```

Caddy가 Let's Encrypt 인증서를 자동 발급한다(도메인이 VM IP를 가리킨 상태여야 함).

## 5. 데이터 시딩 (최초 1회, VM 안에서)

시드는 pnpm 실행 환경이 필요하다. VM에 node 없이 컨테이너로 처리:

```bash
docker run --rm -it --network welfare_net \
  -v "$PWD":/repo -w /repo \
  --env-file infra/.env.prod \
  -e DATABASE_URL=postgresql://welfare:<PG비번>@postgres:5432/welfare_ai \
  -e NEO4J_URI=bolt://neo4j:7687 -e NEO4J_USERNAME=neo4j \
  -e QDRANT_URL=http://qdrant:6333 \
  -e REDIS_HOST=redis \
  node:22-alpine sh -c "corepack enable && pnpm install --frozen-lockfile && \
    pnpm --filter @welfare-ai/api db:seed:admin && \
    pnpm --filter @welfare-ai/api db:seed"
```

`db:seed`는 공공데이터 수집 + OpenAI 임베딩이라 수십 분 + 임베딩 비용이 든다.
(네트워크 이름이 다르면 `docker network ls`에서 `*_welfare_net` 확인)

## 6. Vercel 프론트

1. vercel.com → Import `Han-wo/wel-fare` → **Root Directory: `apps/web`**
2. env: `NEXT_PUBLIC_API_URL` = `https://<DOMAIN>` (끝에 `/api/v1` 없이)
3. 배포 후 VM의 `infra/.env.prod`에서 `WEB_URL`을 Vercel 도메인으로 바꾸고:
   ```bash
   docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d api
   ```

## 7. 이후 배포 (코드 업데이트)

```bash
cd ~/wel-fare && git pull && \
docker compose --env-file infra/.env.prod -f infra/docker-compose.prod.yml up -d --build api
```

(원하면 GitHub Actions로 push 시 ssh 자동 배포를 붙일 수 있다 — 다음 단계.)

## 점검 체크리스트

- [ ] `https://<DOMAIN>/api/v1/health` OK
- [ ] 회원가입 → 채팅 → SSE 스트리밍 (Caddy `flush_interval -1`로 버퍼링 없음)
- [ ] HITL 패널 제출 → 재개 (네트워크 탭 `hitl=` 파라미터)
- [ ] `/admin/observability` 카드 (ADMIN_EMAIL 계정)
- [ ] VM 재부팅 후 자동 복구 (`restart: unless-stopped`) — `sudo reboot`로 1회 확인 권장

## 메모리 배분 참고 (24GB)

Neo4j heap 1G + PG/Qdrant/Redis 각 수백 MB + API ~1G — 여유가 크다. Neo4j가 커지면 compose의 `NEO4J_dbms_memory_heap_max__size`를 2~4G로 올려도 된다.
