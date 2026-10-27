'use client';

import { memo, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * 상태 전환 모션 — 고립된 리프 컴포넌트.
 *
 * 부모(채팅 페이지)는 스트리밍 중 매 토큰마다 리렌더된다. 모션을 여기 가둬
 * 애니메이션이 부모의 리렌더에 휘말리지 않게 한다.
 *
 * 스프링을 쓰는 이유: 선형 이징은 UI가 "미끄러지는" 느낌을 주는데,
 * 스프링은 무게가 있어 실제 물체가 자리를 잡는 것처럼 읽힌다.
 * 다만 감속 모션을 끈 사용자에게는 전부 즉시 표시한다.
 */
const SPRING = { type: 'spring' as const, stiffness: 180, damping: 24, mass: 0.9 };

/** 채팅 메시지 한 건의 등장. 아래에서 살짝 올라오며 자리를 잡는다. */
export const MessageEnter = memo(function MessageEnter({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      // transform/opacity만 움직여 레이아웃을 다시 계산하지 않는다.
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
});

/**
 * HITL 패널처럼 나타났다 사라지는 요소.
 * 퇴장을 더 빠르게 둔다 — 사라지는 걸 기다리게 하면 안 된다.
 */
export const PanelPresence = memo(function PanelPresence({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <>{show ? children : null}</>;

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
          transition={SPRING}
          style={{ willChange: 'transform, opacity' }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});

/** 값이 바뀌는 작은 텍스트(토글 라벨 등). 교차 전환으로 변화를 읽히게 한다. */
export const SwapText = memo(function SwapText({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={token}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
        transition={{ ...SPRING, stiffness: 300 }}
        style={{ display: 'inline-block', willChange: 'transform, opacity' }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
});
