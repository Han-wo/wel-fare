export type PipelineStatus = 'success' | 'running' | 'failed' | 'pending';

const MAP: Record<PipelineStatus, { bg: string; color: string; dot: string; label: string }> = {
  success: { bg: 'var(--success-soft)', color: 'var(--success)', dot: 'var(--success)', label: '성공' },
  running: { bg: 'var(--warning-soft)', color: 'var(--warning-text)', dot: 'var(--warning)', label: '실행 중' },
  failed: { bg: 'var(--danger-soft)', color: 'var(--danger)', dot: 'var(--danger)', label: '실패' },
  pending: { bg: 'var(--bg-hover)', color: 'var(--text-muted)', dot: 'var(--text-muted)', label: '대기' },
};

export function StatusPill({ status, label }: { status: PipelineStatus; label?: string }) {
  const s = MAP[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.color,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: s.dot,
          display: 'inline-block',
        }}
      />
      {label ?? s.label}
    </span>
  );
}

export function StatusDot({ status }: { status: PipelineStatus }) {
  const s = MAP[status];
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: s.dot,
        display: 'inline-block',
      }}
    />
  );
}
