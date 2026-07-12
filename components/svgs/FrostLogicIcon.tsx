import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function FrostLogicIcon({ size = 22, color = 'currentColor', className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {/* Custom FrostLogic snowflake/crystal path */}
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
      <path d="M12 5l3 3-3 3-3-3z" />
      <path d="M12 13l3 3-3 3-3-3z" />
      <path d="M5 12l3 3-3 3-3-3z" />
      <path d="M13 12l3 3-3 3-3-3z" />
    </svg>
  );
}
