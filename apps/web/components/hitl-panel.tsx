'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react';
import type {
  HitlChoice,
  HitlQuestion,
  HitlQuestionnaire,
} from '../hooks/useChat';

type Answers = Record<string, { value: string; label: string } | 'skipped'>;

export function HitlPanel({
  questionnaire,
  onSubmit,
  onDismiss,
}: {
  questionnaire: HitlQuestionnaire;
  onSubmit: (composedText: string, answers: Answers) => void;
  onDismiss: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [cursorIndex, setCursorIndex] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const questions = questionnaire.questions;
  const total = questions.length;
  const current = questions[pageIndex];
  const totalChoices = current?.choices.length ?? 0;

  useEffect(() => {
    setCursorIndex(0);
    setCustomMode(false);
    setCustomValue('');
  }, [pageIndex]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (customMode) {
      customInputRef.current?.focus();
    }
  }, [customMode]);

  const advanceOrSubmit = useCallback(
    (next: Answers) => {
      if (pageIndex + 1 >= total) {
        const composed = composeAnswerText(questions, next);
        onSubmit(composed, next);
        return;
      }
      setPageIndex((prev) => prev + 1);
    },
    [onSubmit, pageIndex, questions, total],
  );

  const handleChoice = useCallback(
    (choice: HitlChoice) => {
      if (!current) return;
      const next: Answers = {
        ...answers,
        [current.fieldKey]: { value: choice.id, label: choice.label },
      };
      setAnswers(next);
      advanceOrSubmit(next);
    },
    [advanceOrSubmit, answers, current],
  );

  const handleSkip = useCallback(() => {
    if (!current) return;
    const next: Answers = { ...answers, [current.fieldKey]: 'skipped' };
    setAnswers(next);
    advanceOrSubmit(next);
  }, [advanceOrSubmit, answers, current]);

  const submitCustom = useCallback(() => {
    if (!current) return;
    const trimmed = customValue.trim();
    if (!trimmed) return;
    const next: Answers = {
      ...answers,
      [current.fieldKey]: { value: trimmed, label: trimmed },
    };
    setAnswers(next);
    advanceOrSubmit(next);
  }, [advanceOrSubmit, answers, current, customValue]);

  const goPrev = useCallback(() => {
    setPageIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goNext = useCallback(() => {
    setPageIndex((prev) => Math.min(total - 1, prev + 1));
  }, [total]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (customMode) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setCustomMode(false);
          setCustomValue('');
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursorIndex((prev) =>
          totalChoices === 0 ? 0 : Math.min(totalChoices - 1, prev + 1),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursorIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const choice = current?.choices[cursorIndex];
        if (choice) handleChoice(choice);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (current?.allowSkip) handleSkip();
        else onDismiss();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      }
    },
    [current, cursorIndex, customMode, goNext, goPrev, handleChoice, handleSkip, onDismiss, totalChoices],
  );

  const summary = useMemo(() => {
    const entries = Object.entries(answers);
    if (entries.length === 0) return null;
    return entries
      .map(([key, value]) => {
        if (value === 'skipped') return `${labelForField(key)}: 건너뜀`;
        return `${labelForField(key)}: ${value.label}`;
      })
      .join(' · ');
  }, [answers]);

  if (!current) {
    // eslint-disable-next-line no-console
    console.warn('[HitlPanel] no current question', { questionnaire, pageIndex, total });
    return null;
  }

  // eslint-disable-next-line no-console
  console.warn('[HitlPanel] render', { promptId: current.id, choices: current.choices.length });

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-labelledby="hitl-panel-title"
      style={{
        flex: '1 1 auto',
        width: '100%',
        minWidth: 0,
        maxWidth: 720,
        background: 'var(--bg-surface)',
        border: '2px solid var(--accent, #2f6f63)',
        borderRadius: 16,
        boxShadow: 'var(--shadow)',
        outline: 'none',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            id="hitl-panel-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current.prompt}
          </h3>
          {questionnaire.detail && (
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {questionnaire.detail}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {total > 1 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              <button
                type="button"
                onClick={goPrev}
                disabled={pageIndex === 0}
                aria-label="이전 질문"
                className="btn-ghost"
                style={{ padding: 4, borderRadius: 6 }}
              >
                <ChevronLeft size={14} />
              </button>
              <span>
                {total}개 중 {pageIndex + 1}개
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={pageIndex + 1 >= total}
                aria-label="다음 질문"
                className="btn-ghost"
                style={{ padding: 4, borderRadius: 6 }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="btn-ghost"
            style={{ padding: 4, borderRadius: 6 }}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {current.choices.map((choice, index) => {
          const isActive = index === cursorIndex && !customMode;
          return (
            <li key={choice.id}>
              <button
                type="button"
                onMouseEnter={() => setCursorIndex(index)}
                onClick={() => handleChoice(choice)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 18px',
                  background: isActive ? 'var(--bg-muted)' : 'transparent',
                  border: 'none',
                  borderTop: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    background: isActive ? 'var(--accent)' : 'var(--bg-canvas)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {choice.label}
                </span>
                {choice.description && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {choice.description}
                  </span>
                )}
                {isActive && <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </button>
            </li>
          );
        })}
      </ul>

      {current.allowCustom && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 18px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <Pencil size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          {customMode ? (
            <input
              ref={customInputRef}
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCustom();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setCustomMode(false);
                  setCustomValue('');
                }
              }}
              placeholder="직접 입력 후 Enter"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 13,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              기타 · 직접 입력
            </button>
          )}
          {current.allowSkip && (
            <button
              type="button"
              onClick={handleSkip}
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              건너뛰기
            </button>
          )}
        </div>
      )}

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 18px',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: 11,
        }}
      >
        <div>
          <span className="kbd">↑↓</span> 탐색 · <span className="kbd">Enter</span> 선택
          {current.allowSkip && (
            <>
              {' '}· <span className="kbd">Esc</span> 건너뛰기
            </>
          )}
        </div>
        {summary && (
          <div
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            aria-live="polite"
          >
            {summary}
          </div>
        )}
      </footer>
    </div>
  );
}

function labelForField(fieldKey: string): string {
  switch (fieldKey) {
    case 'policy_name':
      return '정책명';
    case 'region':
      return '지역';
    case 'age':
      return '나이대';
    case 'income':
      return '소득';
    case 'housing':
      return '주거';
    case 'category':
      return '분야';
    default:
      return fieldKey;
  }
}

function composeAnswerText(questions: HitlQuestion[], answers: Answers) {
  const fragments = questions
    .map((question) => {
      const answer = answers[question.fieldKey];
      if (!answer || answer === 'skipped') return null;
      return `${labelForField(question.fieldKey)}: ${answer.label}`;
    })
    .filter((fragment): fragment is string => Boolean(fragment));

  if (fragments.length === 0) {
    return '방금 답변은 건너뛸게요. 기존 정보로 다시 찾아주세요.';
  }

  return `방금 확인한 정보로 다시 찾아주세요 — ${fragments.join(', ')}`;
}
