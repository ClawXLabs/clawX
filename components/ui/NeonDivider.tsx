import { clsx } from 'clsx';

interface NeonDividerProps {
  color?: 'red' | 'cyan' | 'gradient';
  className?: string;
  thickness?: number;
}

const COLORS = {
  red:      'from-transparent via-cp-red to-transparent',
  cyan:     'from-transparent via-cp-cyan to-transparent',
  gradient: 'from-cp-red via-cp-cyan to-cp-magenta',
};

const GLOWS = {
  red:      'shadow-[0_0_8px_rgba(255,45,59,0.5)]',
  cyan:     'shadow-[0_0_8px_rgba(0,245,255,0.4)]',
  gradient: '',
};

export default function NeonDivider({ color = 'cyan', className, thickness = 1 }: NeonDividerProps) {
  return (
    <div
      className={clsx(
        'w-full bg-gradient-to-r',
        COLORS[color],
        GLOWS[color],
        className
      )}
      style={{ height: `${thickness}px` }}
    />
  );
}
