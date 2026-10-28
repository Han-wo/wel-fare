/**
 * 답변 품질 하네스 — 실제 파이프라인을 태워 골든셋 조건을 검증한다.
 *
 * 순수 함수 하네스와 달리 살아 있는 서버가 필요하다(API + Postgres +
 * Qdrant + Neo4j + OpenAI). 그래서 jest가 아니라 CLI로 돈다.
 *
 *   pnpm --filter @welfare-ai/api run eval:answers
 *
 * 케이스마다 새 세션을 만든다 — 이전 대화가 라우팅·후속질문 재작성에
 * 영향을 주면 케이스가 서로 오염된다.
 */

import { ANSWER_QUALITY_GOLDEN, type AnswerQualityCase } from './answer-quality.golden';

export interface CaseOutcome {
  id: string;
  verdict: 'PASS' | 'FAIL' | 'KNOWN_GAP' | 'ERROR';
  mismatches: string[];
  answerLength: number;
  tools: string[];
  hitlField: string | null;
  elapsedMs: number;
}

export interface HarnessReport {
  total: number;
  passed: number;
  failed: number;
  knownGaps: number;
  errors: number;
  results: CaseOutcome[];
}

interface RunResult {
  answer: string;
  tools: string[];
  hitlField: string | null;
  hitlShown: boolean;
}

/**
 * 코퍼스에 없는 주제를 "지어내지 않고" 처리했는지.
 *
 * 두 가지가 모두 정상이다 — 못 찾았다고 말하거나, 근거가 부족하다며
 * HITL 재질문으로 전환하거나. 실패로 봐야 하는 건 "없는 정책을
 * 그럴듯하게 안내한" 경우뿐이라, 문구 매칭만으로 판정하지 않는다.
 */
const NOT_FOUND_RE =
  /찾을\s*수\s*없|찾지\s*못했|조회되지\s*않|검색되지\s*않|확인되지\s*않|근거(가|를)?\s*(부족|없)|관련\s*(정책|제도|정보)[^.]{0,12}없/;

function assess(c: AnswerQualityCase, r: RunResult): string[] {
  const m: string[] = [];
  const answer = r.answer.trim();

  if (c.minAnswerLength && answer.length < c.minAnswerLength) {
    m.push(`답변 길이 ${answer.length} < ${c.minAnswerLength}`);
  }
  for (const tool of c.expectTools ?? []) {
    if (!r.tools.includes(tool)) m.push(`도구 미호출: ${tool} (실제: ${r.tools.join(',') || '없음'})`);
  }
  for (const needle of c.expectIncludes ?? []) {
    if (!answer.includes(needle)) m.push(`답변에 없음: "${needle}"`);
  }
  for (const needle of c.expectExcludes ?? []) {
    if (answer.includes(needle)) m.push(`답변에 있으면 안 됨: "${needle}"`);
  }
  if (c.expectHitl === true && !r.hitlShown) m.push('HITL이 떠야 하는데 안 떴음');
  if (c.expectHitl === false && r.hitlShown) m.push('HITL이 뜨면 안 되는데 떴음');
  if (c.expectHitlField && r.hitlField !== c.expectHitlField) {
    m.push(`HITL 필드 불일치: 기대 ${c.expectHitlField} / 실제 ${r.hitlField ?? '없음'}`);
  }
  if (c.expectNotFound) {
    // 정책명 블록(📋)을 내놨다면 무언가를 안내한 것이다 — 그게 환각 신호다.
    const presentedPolicy = answer.includes('📋');
    const handled = NOT_FOUND_RE.test(answer) || r.hitlShown;
    if (presentedPolicy || !handled) {
      m.push('못 찾음 처리가 아님 — 없는 정책을 안내했을 가능성');
    }
  }
  if (c.expectVerdictOneOf && !c.expectVerdictOneOf.some((v) => answer.includes(v))) {
    m.push(`판정 태그 없음: ${c.expectVerdictOneOf.join(' 또는 ')}`);
  }
  return m;
}

export async function runAnswerQualityHarness(
  run: (question: string) => Promise<RunResult>,
  cases: AnswerQualityCase[] = ANSWER_QUALITY_GOLDEN,
): Promise<HarnessReport> {
  const results: CaseOutcome[] = [];

  for (const c of cases) {
    const started = Date.now();
    try {
      const r = await run(c.question);
      const mismatches = assess(c, r);
      const verdict =
        mismatches.length === 0 ? 'PASS' : c.knownGap ? 'KNOWN_GAP' : 'FAIL';
      results.push({
        id: c.id,
        verdict,
        mismatches,
        answerLength: r.answer.trim().length,
        tools: r.tools,
        hitlField: r.hitlField,
        elapsedMs: Date.now() - started,
      });
    } catch (error) {
      results.push({
        id: c.id,
        verdict: 'ERROR',
        mismatches: [(error as Error).message],
        answerLength: 0,
        tools: [],
        hitlField: null,
        elapsedMs: Date.now() - started,
      });
    }
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.verdict === 'PASS').length,
    failed: results.filter((r) => r.verdict === 'FAIL').length,
    knownGaps: results.filter((r) => r.verdict === 'KNOWN_GAP').length,
    errors: results.filter((r) => r.verdict === 'ERROR').length,
    results,
  };
}

export type { RunResult };
