#!/usr/bin/env bash
# 병렬 동기화 중 실패한 시드 순차 재실행
# 실행: bash scripts/resync-failed.sh (monorepo 루트에서)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
SEED_DIR="$API_DIR/src/database/seeds"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       실패 시드 순차 재실행                         ║"
echo "╚══════════════════════════════════════════════════╝"

run_seed() {
  local NAME="$1"
  local SCRIPT="$2"
  echo ""
  echo "  🌱 실행: $NAME ($SCRIPT)"
  if (cd "$API_DIR" && npx ts-node -r dotenv/config --transpile-only "$SEED_DIR/$SCRIPT"); then
    echo "  ✅ $NAME 완료"
  else
    echo "  ❌ $NAME 실패"
    return 1
  fi
}

run_seed "지자체 복지서비스"   "local-welfare.seed.ts"
run_seed "공공임대주택 단지"   "rental-housing.seed.ts"
run_seed "청약홈 분양정보"     "applyhome.seed.ts"
run_seed "청약 통계"           "applyhome-stat.seed.ts"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       재실행 완료                                   ║"
echo "╚══════════════════════════════════════════════════╝"
