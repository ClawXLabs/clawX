import { clsx } from 'clsx';

interface SkeletonPulseProps {
  width?: string;
  height?: string;
  className?: string;
  rounded?: boolean;
}

export default function SkeletonPulse({ width = '100%', height = '1rem', className, rounded = false }: SkeletonPulseProps) {
  return (
    <div
      className={clsx('skeleton', rounded && 'rounded-full', className)}
      style={{ width, height }}
    />
  );
}
