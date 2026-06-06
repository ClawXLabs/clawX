import { motion, HTMLMotionProps } from 'framer-motion';
import { clsx } from 'clsx';

type Variant = 'glass' | 'solid' | 'bordered' | 'neon-red' | 'neon-cyan';

interface CpCardProps extends HTMLMotionProps<'div'> {
  variant?: Variant;
  clip?: boolean;
  glow?: 'red' | 'cyan' | 'none';
}

const VARIANTS: Record<Variant, string> = {
  glass:     'bg-black/40 backdrop-blur-xl border border-white/[0.06]',
  solid:     'bg-cp-surface border border-white/[0.06]',
  bordered:  'bg-transparent border border-cp-red/30',
  'neon-red': 'bg-black/60 backdrop-blur-xl border border-cp-red/30',
  'neon-cyan': 'bg-black/60 backdrop-blur-xl border border-cp-cyan/20',
};

const GLOW: Record<'red' | 'cyan' | 'none', string> = {
  red:  'hover:shadow-neon-red hover:border-cp-red/60',
  cyan: 'hover:shadow-neon-cyan hover:border-cp-cyan/40',
  none: '',
};

export default function CpCard({
  variant = 'glass',
  clip = false,
  glow = 'none',
  className,
  children,
  ...rest
}: CpCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={clsx(
        'transition-all duration-300',
        VARIANTS[variant],
        GLOW[glow],
        clip && 'cp-card',
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
