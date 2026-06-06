import { clsx } from 'clsx';

interface SectionHeaderProps {
  tag?: string;
  title: React.ReactNode;
  subtitle?: string;
  className?: string;
  align?: 'center' | 'left';
}

export default function SectionHeader({
  tag,
  title,
  subtitle,
  className,
  align = 'center',
}: SectionHeaderProps) {
  return (
    <div className={clsx(align === 'center' ? 'text-center' : 'text-left', 'mb-14', className)}>
      {tag && (
        <p
          className="text-[11px] font-black tracking-[0.4em] text-cp-cyan uppercase mb-3 font-mono"
        >
          // {tag}
        </p>
      )}
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight font-display text-white">
        {title}
      </h2>
      <div
        className={clsx(
          'mt-4 h-px w-24 bg-gradient-to-r from-cp-red via-cp-cyan to-transparent',
          align === 'center' ? 'mx-auto' : ''
        )}
      />
      {subtitle && (
        <p className="mt-4 text-sm text-zinc-400 max-w-lg leading-relaxed"
          style={{ marginLeft: align === 'center' ? 'auto' : undefined, marginRight: align === 'center' ? 'auto' : undefined }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
