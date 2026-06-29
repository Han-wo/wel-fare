/**
 * 답변 그라운딩 / 환각 측정 리포트.
 *
 *   pnpm --filter @welfare-ai/api run rag:hallucination [days]
 *
 * verify_answer의 그라운딩 검증이 rag_traces.events에 남긴 '답변 그라운딩 경고'
 * 이벤트를 집계해, 근거 없는 주장(링크/정책명/금액)이 포함된 답변의 비율을
 * 측정한다. 모델·프롬프트 변경 후 환각이 늘었는지 추적하는 운영 지표.
 */
import 'dotenv/config';
import { AppDataSource } from '../../../database/data-source';

interface UngroundedPayload {
  links?: string[];
  policyNames?: string[];
  amounts?: string[];
}

interface TraceRow {
  id: string;
  question: string;
  events: Array<{ title?: string; payload?: { ungrounded?: UngroundedPayload } }> | null;
  created_at: string;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function main() {
  const days = Number(process.argv[2]);
  const windowDays = Number.isFinite(days) && days > 0 ? days : null;

  await AppDataSource.initialize();
  try {
    const where = [`answer IS NOT NULL`, `status = 'SUCCESS'`];
    if (windowDays) where.push(`created_at >= NOW() - INTERVAL '${windowDays} days'`);

    const rows: TraceRow[] = await AppDataSource.query(
      `SELECT id, question, events, created_at FROM rag_traces
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC`,
    );

    let total = 0;
    let warned = 0;
    let links = 0;
    let policyNames = 0;
    let amounts = 0;
    const examples: Array<{ question: string; ungrounded: UngroundedPayload }> = [];

    for (const row of rows) {
      total += 1;
      const events = Array.isArray(row.events) ? row.events : [];
      const warning = events.find((e) => e?.title === '답변 그라운딩 경고');
      if (!warning) continue;

      warned += 1;
      const u = warning.payload?.ungrounded ?? {};
      links += u.links?.length ?? 0;
      policyNames += u.policyNames?.length ?? 0;
      amounts += u.amounts?.length ?? 0;
      if (examples.length < 5) examples.push({ question: row.question, ungrounded: u });
    }

    const lines: string[] = [];
    lines.push('=== 답변 그라운딩 / 환각 측정 ===');
    lines.push(`범위: ${windowDays ? `최근 ${windowDays}일` : '전체'} | 대상 답변 ${total}건`);
    lines.push('');
    lines.push(`그라운딩 경고: ${warned}건 (${pct(warned, total)})`);
    lines.push(`  - ungrounded 링크(고위험):   ${links}`);
    lines.push(`  - ungrounded 정책명:         ${policyNames}`);
    lines.push(`  - ungrounded 금액(soft):     ${amounts}`);

    if (examples.length > 0) {
      lines.push('', '최근 경고 예시:');
      for (const ex of examples) {
        const parts = [
          ex.ungrounded.links?.length ? `링크 ${ex.ungrounded.links.length}` : '',
          ex.ungrounded.policyNames?.length ? `정책명 ${ex.ungrounded.policyNames.join('/')}` : '',
        ].filter(Boolean);
        lines.push(`  - "${ex.question}" → ${parts.join(', ')}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('환각 측정 실패:', error);
  process.exit(1);
});
