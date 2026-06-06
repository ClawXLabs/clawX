import { clsx } from 'clsx';

interface StatBlockProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'amber' | 'cyan' | 'red' | 'green' | 'white';
  className?: string;
  id?: string;
}

const ACCENT_COLORS: Record<string, string> = {
  amber: 'text-amber-300',
  cyan:  'text-cp-cyan',
  red:   'text-cp-red',
  green: 'text-emerald-400',
  white: 'text-white',
};

export default function StatBlock({
  label,
  value,
  sub,
  accent = 'white',
  className,
  id,
}: StatBlockProps) {
  return (
    <div
      className={clsx(
        'flex flex-col px-4 py-4 bg-black/40 border border-white/[0.06] backdrop-blur',
        className
      )}
    >
      <p className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase font-mono mb-1">{label}</p>
      <p
        id={id}
        className={clsx(
          'text-2xl font-black font-display tabular-nums',
          ACCENT_COLORS[accent] ?? 'text-white'
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>}
    </div>
  );
}
