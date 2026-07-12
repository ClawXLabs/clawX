import React from 'react';
import { Bot } from 'lucide-react';
import AvaStrikeIcon from '../svgs/AvaStrikeIcon';
import PeakMindIcon from '../svgs/PeakMindIcon';
import FrostLogicIcon from '../svgs/FrostLogicIcon';
import SubnetSageIcon from '../svgs/SubnetSageIcon';

interface AgentIconProps {
  agentId?: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function AgentIcon({ agentId, size = 22, color = 'currentColor', className, style }: AgentIconProps) {
  const props = { size, color, className, style };
  
  switch (agentId) {
    case 'ava-strike':
      return <AvaStrikeIcon {...props} />;
    case 'peak-mind':
      return <PeakMindIcon {...props} />;
    case 'frost-logic':
      return <FrostLogicIcon {...props} />;
    case 'subnet-sage':
      return <SubnetSageIcon {...props} />;
    default:
      return <Bot size={size} color={color} strokeWidth={1.5} className={className} style={style} />;
  }
}
