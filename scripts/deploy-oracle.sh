#!/usr/bin/env bash
# Oracle Always Free VM 배포 스크립트 (docs/deployment-oracle.md 참고)
#
# VM 안에서 실행한다. 프론트는 Vercel이 맡으므로 web 서비스는 제외하고 띄운다.
#   bash scripts/deploy-oracle.sh up       # 최초 기동 / 재기동
#   bash scripts/deploy-oracle.sh update   # git pull + api 재빌드 (평상시 배포)
#   bash scripts/deploy-oracle.sh logs     # api 로그 따라가기
#   bash scripts/deploy-oracle.sh check    # 헬스체크
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env.prod"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.prod.yml"
# web은 Vercel이 담당. VM에서는 API와 인프라만 띄운다.
SERVICES=(postgres redis neo4j qdrant api caddy)

dc() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

require_env() {
  [ -f "$ENV_FILE" ] || { echo "✗ $ENV_FILE 없음. infra/.env.prod.example을 복사해 채우세요."; exit 1; }
  local missing=()
  # 비어 있으면 배포가 깨지는 값만 검사한다(선택 키는 제외).
  for k in DOMAIN POSTGRES_PASSWORD NEO4J_PASSWORD REDIS_PASSWORD JWT_SECRET JWT_REFRESH_SECRET OPENAI_API_KEY; do
    grep -qE "^${k}=.+" "$ENV_FILE" || missing+=("$k")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "✗ .env.prod 필수값 누락: ${missing[*]}"
    echo "  비밀키 생성: openssl rand -base64 48"
    exit 1
  fi
}

domain() { grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-; }

case "${1:-up}" in
  up)
    require_env
    dc up -d --build "${SERVICES[@]}"
    echo "✓ 기동 완료. 마이그레이션은 entrypoint가 자동 실행합니다."
    echo "  로그: bash scripts/deploy-oracle.sh logs"
    ;;
  update)
    require_env
    git -C "$REPO_ROOT" pull
    dc up -d --build api
    echo "✓ API 재배포 완료"
    ;;
  logs) dc logs -f api ;;
  check)
    require_env
    D="$(domain)"
    echo "GET https://$D/api/v1/health"
    curl -fsS --max-time 15 "https://$D/api/v1/health" && echo || { echo "✗ 헬스체크 실패"; exit 1; }
    dc ps
    ;;
  *) echo "사용법: $0 {up|update|logs|check}"; exit 1 ;;
esac
