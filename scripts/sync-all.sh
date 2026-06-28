#!/usr/bin/env bash
# 전체 DB 병렬 동기화 스크립트
# 모든 시드를 병렬로 실행 (Qdrant + Neo4j)
# 실행: bash scripts/sync-all.sh (monorepo 루트에서)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
SEED_DIR="$API_DIR/src/database/seeds"
LOG_DIR="$REPO_ROOT/scripts/.sync-logs"

mkdir -p "$LOG_DIR"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      WelfareAI 전체 DB 병렬 동기화 시작            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# (seed 이름, 스크립트 파일) 쌍
declare -a SEED_NAMES=(
  "중앙부처 복지서비스"
  "지자체 복지서비스"
  "청년정책"
  "공공임대주택 단지"
  "사회복지시설"
  "공공주택 모집공고"
  "청약홈 분양정보"
  "청약 경쟁률"
  "청약 통계"
)
declare -a SEED_SCRIPTS=(
  "welfare-api.seed.ts"
  "local-welfare.seed.ts"
  "youth-policy.seed.ts"
  "rental-housing.seed.ts"
  "welfare-facility.seed.ts"
  "housing-announcement.seed.ts"
  "applyhome.seed.ts"
  "applyhome-cmpet.seed.ts"
  "applyhome-stat.seed.ts"
)

COUNT=${#SEED_NAMES[@]}
declare -a PIDS=()
declare -a LOG_FILES=()

# 모든 시드 병렬 실행
for ((i=0; i<COUNT; i++)); do
  NAME="${SEED_NAMES[$i]}"
  SCRIPT="${SEED_SCRIPTS[$i]}"
  LOG="$LOG_DIR/${SCRIPT%.seed.ts}.log"
  LOG_FILES+=("$LOG")

  echo "  🌱 시작: $NAME ($SCRIPT)"

  (
    cd "$API_DIR"
    # tsconfig.scripts.json: 워크스페이스 패키지(@welfare-ai/*)를 dist 빌드 없이
    # 소스에서 해소 + transpileOnly. 새 클론에서도 빌드 선행 없이 동작.
    TS_NODE_PROJECT=tsconfig.scripts.json npx ts-node -r dotenv/config "$SEED_DIR/$SCRIPT" > "$LOG" 2>&1
  ) &
  PIDS+=($!)
done

echo ""
echo "  ⏳ 모든 시드 병렬 실행 중... (완료까지 최대 30분)"
echo ""

# 결과 수집
SUCCESS=0
FAIL=0

for ((i=0; i<COUNT; i++)); do
  NAME="${SEED_NAMES[$i]}"
  PID="${PIDS[$i]}"
  LOG="${LOG_FILES[$i]}"

  if wait "$PID"; then
    LAST_LINE=$(tail -1 "$LOG" 2>/dev/null || echo "(출력 없음)")
    echo "  ✅ $NAME: $LAST_LINE"
    ((SUCCESS++))
  else
    LAST_LINES=$(tail -3 "$LOG" 2>/dev/null || echo "(출력 없음)")
    echo "  ❌ $NAME:"
    echo "$LAST_LINES" | sed 's/^/     /'
    ((FAIL++))
  fi
done

echo ""
echo "╔══════════════════════════════════════════════════╗"
printf "║  완료: 성공 %-3d / 실패 %-3d                        ║\n" "$SUCCESS" "$FAIL"
echo "╚══════════════════════════════════════════════════╝"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  로그 확인: $LOG_DIR/"
  exit 1
fi
