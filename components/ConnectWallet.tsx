import { motion } from 'framer-motion';
import { Wallet, ChevronRight } from 'lucide-react';

interface ConnectWalletProps {
  account:   string | null;
  onConnect: () => void;
}

export default function ConnectWallet({ account, onConnect }: ConnectWalletProps) {
  if (account) {
    return (
      <div className="flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/5 px-4 py-2"
        style={{ clipPath: 'polygon(6px 0,100% 0,calc(100% - 6px) 100%,0 100%)' }}>
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
        <span className="text-sm text-emerald-300 font-mono">
          {account.slice(0, 6)}…{account.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <motion.button
      onClick={onConnect}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className="flex items-center gap-2 bg-cp-red text-white px-5 py-2 text-sm font-black shadow-neon-red hover:bg-red-500 hover:shadow-neon-red-lg transition-all font-display tracking-widest uppercase"
      style={{ clipPath: 'polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)' }}
    >
      <Wallet className="w-3.5 h-3.5" />
      Connect
      <ChevronRight className="w-3.5 h-3.5" />
    </motion.button>
  );
}
