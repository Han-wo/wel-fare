/**
 * 라우팅 eval 하네스 CLI.
 *
 *   pnpm --filter @welfare-ai/api run eval:routing
 *
 * 골든 데이터셋 전체를 정규식 라우팅에 돌려 사람이 읽는 리포트를 출력한다.
 * REGRESSION(문서화되지 않은 불일치)이 하나라도 있으면 종료 코드 1로 끝나
 * CI에서 실패로 잡힌다. KNOWN_GAP(인지된 한계)은 리포트에만 표시하고 빌드를
 * 깨지 않는다.
 */
import { runRoutingHarness, formatRoutingReport } from './routing-harness';

function main() {
  const report = runRoutingHarness();
  // eslint-disable-next-line no-console
  console.log(formatRoutingReport(report));

  if (report.regressions > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n✗ ${report.regressions}건의 라우팅 회귀가 감지되었습니다.`);
    process.exit(1);
  }
}

main();
