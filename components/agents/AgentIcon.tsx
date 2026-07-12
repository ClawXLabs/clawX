import React from 'react';
import { Zap, Brain, Snowflake, Globe, Bot } from 'lucide-react';

interface AgentIconProps {
  agentId?: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function AgentIcon({ agentId, size = 22, color = 'currentColor', className, style }: AgentIconProps) {
  const props = { size, color, strokeWidth: 1.5, className, style };
  
  switch (agentId) {
    case 'ava-strike':
      return <Zap {...props} />;
    case 'peak-mind':
      return <Brain {...props} />;
    case 'frost-logic':
      return <Snowflake {...props} />;
    case 'subnet-sage':
      return <Globe {...props} />;
    default:
      return <Bot {...props} />;
  }
}
