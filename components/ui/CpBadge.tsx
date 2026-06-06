import { clsx } from 'clsx';

type Variant = 'live' | 'up' | 'down' | 'info' | 'warn' | 'open' | 'closed';

interface CpBadgeProps {
  variant?: Variant;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}

const STYLES: Record<Variant, { wrapper: string; dot: string }> = {
  live:   { wrapper: 'bg-cp-red/15 border-cp-red/30 text-cp-red',          dot: 'bg-cp-red cp-dot-pulse' },
  up:     { wrapper: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
  down:   { wrapper: 'bg-red-500/15 border-red-500/30 text-red-400',        dot: 'bg-red-400' },
  info:   { wrapper: 'bg-cp-cyan/10 border-cp-cyan/20 text-cp-cyan',        dot: 'bg-cp-cyan cp-dot-pulse-cyan' },
  warn:   { wrapper: 'bg-amber-500/15 border-amber-500/30 text-amber-400',  dot: 'bg-amber-400' },
  open:   { wrapper: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
  closed: { wrapper: 'bg-zinc-700/30 border-zinc-700/30 text-zinc-500',     dot: 'bg-zinc-500' },
};

export default function CpBadge({
  variant = 'info',
  pulse = false,
  className,
  children,
}: CpBadgeProps) {
  const { wrapper, dot } = STYLES[variant];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase border font-mono',
        'cp-btn-clip-sm',
        wrapper,
        className
      )}
    >
      {pulse && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dot)} />}
      {children}
    </span>
  );
}
