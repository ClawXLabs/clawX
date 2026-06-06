import { useEffect, useRef, useState } from "react";

interface PupilPos {
  x: number;
  y: number;
}

const EYE_LEFT = { cx: 120, cy: 207.254, r: 14 };
const EYE_RIGHT = { cx: 229, cy: 207.254, r: 14 };

function clampPupil(
  mouseX: number,
  mouseY: number,
  eye: { cx: number; cy: number; r: number }
): { x: number; y: number } {
  const dx = mouseX - eye.cx;
  const dy = mouseY - eye.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= eye.r) return { x: mouseX, y: mouseY };
  return {
    x: eye.cx + (dx / dist) * eye.r,
    y: eye.cy + (dy / dist) * eye.r,
  };
}

export default function RobotAgent({
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [pupilL, setPupilL] = useState<PupilPos>({ x: EYE_LEFT.cx, y: EYE_LEFT.cy });
  const [pupilR, setPupilR] = useState<PupilPos>({ x: EYE_RIGHT.cx, y: EYE_RIGHT.cy });
  const [antRotL, setAntRotL] = useState(0);
  const [antRotR, setAntRotR] = useState(0);
  const [localHovered, setLocalHovered] = useState(false);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);

  const isHovered = parentHovered || localHovered;

  // Antenna sway animation
  useEffect(() => {
    const animate = () => {
      tRef.current += 0.018;
      const t = tRef.current;
      const boost = isHovered ? 2.5 : 1;
      setAntRotL(Math.sin(t) * 4 * boost);
      setAntRotR(Math.sin(t + Math.PI * 0.6) * 4 * boost);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isHovered]);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const scaleX = 349 / rect.width;
      const scaleY = 517 / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      setPupilL(clampPupil(mx, my, EYE_LEFT));
      setPupilR(clampPupil(mx, my, EYE_RIGHT));
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const resetPupils = () => {
    setPupilL({ x: EYE_LEFT.cx, y: EYE_LEFT.cy });
    setPupilR({ x: EYE_RIGHT.cx, y: EYE_RIGHT.cy });
  };

  // Highlight offset relative to pupil
  const hlOffsetX = -10;
  const hlOffsetY = -10;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox="0 0 349 517"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        cursor: "none",
        filter: isHovered
          ? "drop-shadow(0 0 18px rgba(80,80,200,0.18))"
          : "none",
        transition: "filter 0.3s",
        ...style,
      }}
      onMouseEnter={() => setLocalHovered(true)}
      onMouseLeave={() => {
        setLocalHovered(false);
        resetPupils();
      }}
    >
      {/* Left antenna */}
      <g
        style={{
          transformOrigin: "103.672px 128.293px",
          transform: `rotate(${antRotL}deg)`,
          transition: "transform 0.4s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <line
          x1="244.39"
          y1="126.666"
          x2="325.111"
          y2="1.62708"
          stroke="black"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>

      {/* Right antenna */}
      <g
        style={{
          transformOrigin: "103.672px 128.293px",
          transform: `rotate(${antRotR}deg)`,
          transition: "transform 0.4s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <line
          x2="103.672"
          y2="128.293"
          x1="23"
          y1="3"
          stroke="black"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>

      {/* Head */}
      <rect
        x="43"
        y="123.245"
        width="263"
        height="168"
        rx="84"
        stroke="black"
        strokeWidth="6"
        fill="white"
      />

      {/* Body */}
      <path
        d="M99 291.745H250C302.743 291.745 345.5 334.502 345.5 387.245V512.745H99C46.2568 512.745 3.5 469.989 3.5 417.245V387.245C3.5 334.502 46.2568 291.745 99 291.745Z"
        stroke="black"
        strokeWidth="7"
        fill="white"
      />

      {/* Left eye */}
      <circle cx="120" cy="207.254" r="39.5" stroke="black" fill="white" />
      <circle cx={pupilL.x} cy={pupilL.y} r="25.5" fill="black" />
      <circle
        cx={pupilL.x + hlOffsetX}
        cy={pupilL.y + hlOffsetY}
        r="7"
        fill="white"
        opacity="0.6"
      />

      {/* Right eye */}
      <circle cx="229" cy="207.254" r="39.5" stroke="black" fill="white" />
      <circle cx={pupilR.x} cy={pupilR.y} r="25.5" fill="black" />
      <circle
        cx={pupilR.x + hlOffsetX}
        cy={pupilR.y + hlOffsetY}
        r="7"
        fill="white"
        opacity="0.6"
      />
    </svg>
  );
}