const LOGO_SRC = '/api/brand-logo';

type BrandMarkProps = {
  className?: string;
  shellClassName?: string;
};

export function BrandMark({
  className: _className,
  shellClassName = 'h-12 w-12 rounded-2xl',
}: BrandMarkProps) {
  return (
    <div className={`relative overflow-hidden ${shellClassName}`}>
      <img
        src={LOGO_SRC}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-[-8%] top-1/2 h-[150%] w-auto max-w-none -translate-y-1/2 select-none"
      />
    </div>
  );
}

type BrandLockupProps = {
  compact?: boolean;
  showCaption?: boolean;
};

export function BrandLockup({ compact = false, showCaption = true }: BrandLockupProps) {
  return (
    <div className="min-w-0">
      <div
        className={`relative overflow-hidden ${
          compact ? 'h-[48px] w-[182px]' : 'h-[74px] w-[296px] max-w-full'
        }`}
      >
        <img
          src={LOGO_SRC}
          alt="WelfareAI"
          className="pointer-events-none absolute left-0 top-1/2 h-[146%] w-auto max-w-none -translate-y-1/2 select-none"
        />
      </div>

      {showCaption && !compact ? (
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          필요한 지원을 질문 한 번으로 빠르게 찾기
        </p>
      ) : null}
    </div>
  );
}
