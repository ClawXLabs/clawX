'use client';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';
import { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'cyan' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CpButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  clip?: boolean;
  glow?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-cp-red text-white hover:bg-red-500 shadow-neon-red hover:shadow-neon-red-lg',
  outline: 'border border-cp-red text-cp-red hover:bg-cp-red/10 hover:shadow-neon-red',
  ghost: 'text-zinc-400 hover:text-white hover:bg-white/5',
  cyan: 'border border-cp-cyan text-cp-cyan hover:bg-cp-cyan/10 hover:shadow-neon-cyan',
  danger: 'bg-red-700 text-white hover:bg-red-600',
};

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-1.5 text-[10px] tracking-[0.25em]',
  md: 'px-6 py-2.5 text-[11px] tracking-[0.3em]',
  lg: 'px-8 py-3.5 text-sm tracking-[0.3em]',
};

export default function CpButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  clip = true,
  glow = false,
  className,
  children,
  disabled,
  onClick,
  type = 'button',
  ...rest
}: CpButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-black uppercase font-display transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        clip && 'cp-btn-clip',
        className
      )}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </motion.button>
  );
}

