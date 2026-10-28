/**
 * 답변 품질 골든셋 러너 (CLI).
 *
 *   pnpm --filter @welfare-ai/api run eval:answers
 *
 * 살아 있는 서버에 실제 질문을 던져 끝까지 태운다. 회귀가 있으면 종료 코드
 * 1로 끝난다(knownGap은 빌드를 깨지 않는다).
 *
 * 환경변수:
 *   EVAL_API_URL   기본 http://localhost:3001/api/v1
 *   EVAL_EMAIL     기본 ADMIN_EMAIL 또는 admin@welfare.local
 *   EVAL_PASSWORD  기본 ADMIN_PASSWORD
 *   EVAL_ONLY      쉼표로 구분한 케이스 id — 일부만 돌릴 때
 */
import 'dotenv/config';
import {
  runAnswerQualityHarness,
  type RunResult,
} from './answer-quality-harness';
import { ANSWER_QUALITY_GOLDEN } from './answer-quality.golden';

const BASE = process.env.EVAL_API_URL ?? 'http://localhost:3001/api/v1';
const EMAIL = process.env.EVAL_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin@welfare.local';
const PASSWORD = process.env.EVAL_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `로그인 실패(${res.status}). EVAL_EMAIL/EVAL_PASSWORD를 확인하세요.`,
    );
  }
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

/** 케이스마다 새 세션 — 이전 대화가 라우팅·후속질문 재작성을 오염시킨다. */
async function newSession(token: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  const data = (await res.json()) as { id?: string; sessionId?: string };
  const id = data.id ?? data.sessionId;
  if (!id) throw new Error('세션 생성 실패');
  return id;
}

function makeRunner(token: string) {
  return async function run(question: string): Promise<RunResult> {
    const sessionId = await newSession(token);
    const url = `${BASE}/rag/stream?sessionId=${sessionId}&q=${encodeURIComponent(question)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
    });
    if (!res.ok || !res.body) throw new Error(`스트림 실패(${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const tokens: string[] = [];
    const tools: string[] = [];
    let hitlField: string | null = null;
    let hitlShown = false;

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          continue;
        }
        const type = event.eventType;
        if (type === 'TOKEN') tokens.push(String(event.content ?? ''));
        if (type === 'HITL') {
          hitlShown = true;
          const q = (event.payload as { questions?: Array<{ fieldKey?: string }> })?.questions;
          hitlField = q?.[0]?.fieldKey ?? null;
        }
        if (type === 'THINK_DETAIL') {
          const p = event.payload as { node?: string; status?: string };
          // 도구 노드는 완료 시점에 node 이름으로 식별된다.
          if (p?.status === 'done' && p.node?.startsWith('search_')) {
            if (!tools.includes(p.node)) tools.push(p.node);
          }
          if (p?.status === 'done' && p.node === 'get_upcoming_deadlines') {
            if (!tools.includes(p.node)) tools.push(p.node);
          }
        }
        if (type === 'DONE') break outer;
      }
    }
    await reader.cancel().catch(() => undefined);

    return { answer: tokens.join(''), tools, hitlField, hitlShown };
  };
}

async function main() {
  if (!PASSWORD) {
    console.error('✗ EVAL_PASSWORD(또는 ADMIN_PASSWORD)가 비어 있습니다.');
    process.exitCode = 1;
    return;
  }

  const only = (process.env.EVAL_ONLY ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cases = only.length
    ? ANSWER_QUALITY_GOLDEN.filter((c) => only.includes(c.id))
    : ANSWER_QUALITY_GOLDEN;

  console.log(`답변 품질 골든셋 — ${cases.length}케이스 @ ${BASE}\n`);
  const token = await login();
  const report = await runAnswerQualityHarness(makeRunner(token), cases);

  const icon = { PASS: '✓', FAIL: '✗', KNOWN_GAP: '△', ERROR: '!' };
  for (const r of report.results) {
    const secs = (r.elapsedMs / 1000).toFixed(1);
    console.log(`${icon[r.verdict]} ${r.id.padEnd(30)} ${secs.padStart(5)}s  ${r.answerLength}자`);
    for (const m of r.mismatches) console.log(`    ${m}`);
  }

  console.log(
    `\n통과 ${report.passed}/${report.total}` +
      (report.knownGaps ? ` · known-gap ${report.knownGaps}` : '') +
      (report.failed ? ` · 실패 ${report.failed}` : '') +
      (report.errors ? ` · 오류 ${report.errors}` : ''),
  );

  if (report.failed > 0 || report.errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
