import { useEffect, useRef, useState } from "react";

export default function FiveMinTimer({
  width = "100%",
  height = "100%",
  style,
  hovered: parentHovered = false,
}: {
  width?: string;
  height?: string;
  style?: React.CSSProperties;
  hovered?: boolean;
}) {
  const [sweepAngle, setSweepAngle] = useState(0);
  const [localHovered, setLocalHovered] = useState(false);

  const isHovered = parentHovered || localHovered;

  const rafRef = useRef<number>(0);
  const tRef = useRef(0);

  // Slow, smooth sweeping animation when hovered
  useEffect(() => {
    if (!isHovered) {
      // Smooth return to 0
      let startAngle = sweepAngle;
      let startTime = performance.now();
      const duration = 500; // ms

      const returnToZero = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - (1 - progress) * (1 - progress);
        setSweepAngle(startAngle * (1 - ease));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(returnToZero);
        }
      };

      rafRef.current = requestAnimationFrame(returnToZero);
      return () => cancelAnimationFrame(rafRef.current);
    }

    // Slow and calm rotation loop
    const animate = () => {
      tRef.current += 0.012; // slow increment for a very calm rotation speed
      setSweepAngle((tRef.current * 180) / Math.PI);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isHovered]);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 349 517"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        cursor: "none",
        ...style,
      }}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => setLocalHovered(false)}
    >
      {/* Sleek, clean outer circular dial */}
      <circle
        cx="174.5"
        cy="258.5"
        r="110"
        stroke="black"
        strokeWidth="6"
        fill="white"
      />

      {/* Shaded 5-minute sector (from 12 to 1 o'clock - 30 degrees) */}
      <path
        d="M 174.5 258.5 L 174.5 148.5 A 110 110 0 0 1 229.5 163.5 Z"
        fill="black"
        opacity="0.15"
      />

      {/* Slow-sweeping minimal pointer hand */}
      <g
        style={{
          transformOrigin: "174.5px 258.5px",
          transform: `rotate(${sweepAngle}deg)`,
        }}
      >
        <line
          x1="174.5"
          y1="258.5"
          x2="174.5"
          y2="168.5"
          stroke="black"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Tail counterweight */}
        <line
          x1="174.5"
          y1="258.5"
          x2="174.5"
          y2="283.5"
          stroke="black"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>

      {/* Small center pin */}
      <circle
        cx="174.5"
        cy="258.5"
        r="8"
        fill="black"
        stroke="black"
        strokeWidth="2"
      />
    </svg>
  );
}