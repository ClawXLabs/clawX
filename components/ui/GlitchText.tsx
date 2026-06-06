import { useEffect, useRef } from 'react';
import { clsx } from 'clsx';

interface GlitchTextProps {
  text: string;
  className?: string;
  intensity?: 'low' | 'medium' | 'high';
  color?: string;
}

export default function GlitchText({
  text,
  className,
  intensity = 'medium',
  color = 'inherit',
}: GlitchTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const CHARS = '!@#$%^&*<>?/\\|[]{}01';
    const duration = { low: 60, medium: 40, high: 20 }[intensity];
    let frame: ReturnType<typeof setTimeout>;

    const glitch = () => {
      let iter = 0;
      const interval = setInterval(() => {
        if (!ref.current) { clearInterval(interval); return; }
        ref.current.textContent = text
          .split('')
          .map((char, idx) => {
            if (idx < iter) return text[idx];
            if (char === ' ') return ' ';
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join('');
        if (iter >= text.length) {
          clearInterval(interval);
          if (ref.current) ref.current.textContent = text;
        }
        iter += 0.5;
      }, duration);
    };

    glitch();

    const startRandom = () => {
      const delay = 3000 + Math.random() * 5000;
      frame = setTimeout(() => { glitch(); startRandom(); }, delay);
    };
    startRandom();

    return () => clearTimeout(frame);
  }, [text, intensity]);

  return (
    <span
      ref={ref}
      className={clsx('inline-block', className)}
      style={{ color, fontFamily: 'Orbitron, monospace' }}
      data-text={text}
    >
      {text}
    </span>
  );
}
