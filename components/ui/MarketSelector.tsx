import { useState } from "react";

type Market = "BTC" | "AVAX" | "ETH" | null;

const BG: Record<NonNullable<Market>, string> = {
  BTC: "#F7931A",
  AVAX: "#E84142",
  ETH: "#627EEA",
};

// ─── Candlesticks — 5 candles filling ~25% of 483px width = ~120px total ─────
// Candle body width = 14px, total chart width fits in ~120px
const CANDLES = [
  { cx: 14, bodyTop: 38, bodyH: 82, topWick: 26, botWick: 26, delay: "0s", color: "red" },
  { cx: 50, bodyTop: 18, bodyH: 62, topWick: 26, botWick: 26, delay: "0.3s", color: "green" },
  { cx: 80, bodyTop: 28, bodyH: 56, topWick: 22, botWick: 22, delay: "0.55s", color: "red" },
  { cx: 110, bodyTop: 12, bodyH: 62, topWick: 26, botWick: 26, delay: "0.15s", color: "green" },
  { cx: 140, bodyTop: 22, bodyH: 72, topWick: 24, botWick: 24, delay: "0.45s", color: "green" },
];
const CW = 26; // candle body width

function CandlestickChart() {
  return (
    <svg width="15%" height="20%" viewBox="0 0 200 145" fill="none" style={{ marginLeft: "4%", overflow: "visible" }} xmlns="http://www.w3.org/2000/svg">
      {CANDLES.map((c, i) => (
        <g key={i} className={`candle-group candle-${c.color}`} style={{ animation: `candleFloat 2.8s ease-in-out ${c.delay} infinite`, cursor: 'pointer' }}>
          <line x1={c.cx} y1={c.bodyTop - c.topWick} x2={c.cx} y2={c.bodyTop}
            stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" className="candle-line" />
          <rect x={c.cx - CW / 2} y={c.bodyTop} width={CW} height={c.bodyH}
            stroke="#1a1a1a" strokeWidth="1.5" fill="white" className="candle-rect" />
          <line x1={c.cx} y1={c.bodyTop + c.bodyH} x2={c.cx} y2={c.bodyTop + c.bodyH + c.botWick}
            stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" className="candle-line" />
        </g>
      ))}
    </svg>
  );
}

// ─── Exact AVAX SVG (document 4) scaled to 72×72 ─────────────────────────────
function AVAXIcon({ filled, fillColor }: { filled: boolean; fillColor: string }) {
  const scale = 72 / 194;
  return (
    <svg width="72" height="72" viewBox="0 0 194 194" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
      <circle cx="97" cy="97" r="94" stroke="black" strokeWidth="6" fill={filled ? fillColor : "white"} />
      <mask id="avax-mask" fill="white">
        <path d="M115.133 59.6291C116.204 61.4855 116.204 63.7727 115.133 65.6291L79.8086 126.814C78.7368 128.67 76.7561 129.814 74.6124 129.814H48.3937C43.7749 129.814 40.8882 124.814 43.1976 120.814L91.6314 36.9239C93.9408 32.924 99.7143 32.924 102.024 36.9239L115.133 59.6291ZM150.457 120.814C152.767 124.814 149.88 129.814 145.261 129.814H113.688C109.07 129.814 106.183 124.814 108.492 120.814L124.278 93.4702C126.587 89.4701 132.361 89.47 134.67 93.47L150.457 120.814Z" />
      </mask>
      <path d="M124.278 93.4702L119.082 90.4703L124.278 93.4702ZM134.67 93.47L129.474 96.4701L134.67 93.47ZM150.457 120.814L155.654 117.814L150.457 120.814ZM102.024 36.9239L96.8276 39.924L102.024 36.9239ZM79.8086 126.814L85.0048 129.814L79.8086 126.814ZM115.133 65.6291L120.329 68.629L115.133 65.6291ZM115.133 59.6291L120.329 56.6291L115.133 59.6291ZM115.133 65.6291L109.936 62.6291L74.6124 123.814L79.8086 126.814L85.0048 129.814L120.329 68.629L115.133 65.6291ZM74.6124 129.814V123.814H48.3937V129.814V135.814H74.6124V129.814ZM43.1976 120.814L48.3937 123.814L96.8276 39.9239L91.6314 36.9239L86.4353 33.9239L38.0014 117.814L43.1976 120.814ZM102.024 36.9239L96.8276 39.924L109.936 62.6291L115.133 59.6291L120.329 56.6291L107.22 33.9239L102.024 36.9239ZM145.261 129.814V123.814H113.688V129.814V135.814H145.261V129.814ZM108.492 120.814L113.688 123.814L129.474 96.4701L124.278 93.4702L119.082 90.4703L103.296 117.814L108.492 120.814ZM134.67 93.47L129.474 96.4701L145.261 123.814L150.457 120.814L155.654 117.814L139.867 90.47L134.67 93.47ZM124.278 93.4702L129.474 96.4701C129.483 96.4548 129.489 96.4471 129.491 96.4448C129.492 96.4425 129.492 96.4436 129.488 96.4469C129.485 96.4502 129.481 96.4541 129.475 96.4581C129.47 96.4621 129.465 96.4654 129.46 96.4679C129.451 96.4729 129.447 96.4734 129.451 96.4726C129.452 96.4721 129.455 96.4715 129.46 96.4709C129.464 96.4704 129.469 96.4701 129.474 96.4701C129.48 96.4701 129.484 96.4704 129.489 96.4709C129.493 96.4715 129.496 96.4721 129.498 96.4726C129.501 96.4734 129.498 96.4729 129.488 96.4679C129.484 96.4654 129.479 96.4621 129.473 96.4581C129.468 96.4541 129.463 96.4502 129.46 96.4469C129.457 96.4436 129.456 96.4425 129.458 96.4448C129.46 96.4471 129.465 96.4548 129.474 96.4701L134.67 93.47L139.867 90.47C135.248 82.4699 123.7 82.4701 119.082 90.4703L124.278 93.4702ZM113.688 129.814V123.814C113.671 123.814 113.661 123.812 113.658 123.812C113.655 123.812 113.657 123.812 113.661 123.813C113.666 123.814 113.671 123.816 113.678 123.819C113.684 123.822 113.689 123.824 113.694 123.827C113.702 123.832 113.705 123.835 113.702 123.833C113.701 123.832 113.699 123.829 113.696 123.826C113.694 123.822 113.691 123.818 113.688 123.814C113.686 123.809 113.684 123.805 113.682 123.801C113.68 123.797 113.679 123.794 113.679 123.792C113.678 123.789 113.679 123.792 113.679 123.802C113.679 123.808 113.679 123.814 113.678 123.82C113.678 123.827 113.676 123.833 113.675 123.837C113.674 123.842 113.674 123.843 113.675 123.84C113.676 123.838 113.68 123.829 113.688 123.814L108.492 120.814L103.296 117.814C98.6773 125.814 104.451 135.814 113.688 135.814V129.814ZM145.261 129.814V135.814C154.499 135.814 160.272 125.814 155.654 117.814L150.457 120.814L145.261 123.814C145.27 123.829 145.274 123.838 145.275 123.84C145.276 123.843 145.275 123.842 145.274 123.837C145.273 123.833 145.272 123.827 145.271 123.82C145.27 123.814 145.27 123.808 145.27 123.802C145.27 123.792 145.272 123.789 145.271 123.792C145.27 123.794 145.27 123.797 145.268 123.801C145.266 123.805 145.264 123.809 145.261 123.814C145.259 123.818 145.256 123.822 145.253 123.826C145.251 123.829 145.249 123.832 145.247 123.833C145.245 123.835 145.247 123.832 145.256 123.827C145.261 123.824 145.266 123.822 145.272 123.819C145.278 123.816 145.284 123.814 145.288 123.813C145.293 123.812 145.294 123.812 145.291 123.812C145.289 123.812 145.279 123.814 145.261 123.814V129.814ZM91.6314 36.9239L96.8276 39.9239C96.8364 39.9087 96.8422 39.9009 96.844 39.8987C96.8458 39.8964 96.8451 39.8975 96.8417 39.9008C96.8384 39.904 96.8339 39.908 96.8284 39.912C96.8231 39.916 96.8179 39.9193 96.8134 39.9218C96.8043 39.9268 96.8006 39.9273 96.804 39.9264C96.8057 39.926 96.8088 39.9254 96.8131 39.9248C96.8174 39.9243 96.8223 39.924 96.8276 39.924C96.8329 39.924 96.8378 39.9243 96.8421 39.9248C96.8464 39.9254 96.8494 39.926 96.8512 39.9264C96.8546 39.9273 96.8509 39.9268 96.8418 39.9218C96.8372 39.9193 96.8321 39.916 96.8267 39.912C96.8213 39.908 96.8168 39.904 96.8134 39.9008C96.8101 39.8975 96.8094 39.8964 96.8112 39.8987C96.813 39.9009 96.8188 39.9087 96.8276 39.924L102.024 36.9239L107.22 33.9239C102.601 25.924 91.0541 25.924 86.4353 33.9239L91.6314 36.9239ZM48.3937 129.814V123.814C48.3761 123.814 48.3665 123.812 48.3636 123.812C48.3607 123.812 48.3621 123.812 48.3666 123.813C48.3711 123.814 48.3767 123.816 48.383 123.819C48.3891 123.822 48.3945 123.824 48.3989 123.827C48.4079 123.832 48.4102 123.835 48.4077 123.833C48.4064 123.832 48.4043 123.829 48.4017 123.826C48.3991 123.822 48.3964 123.818 48.3937 123.814C48.3911 123.809 48.3889 123.805 48.3872 123.801C48.3855 123.797 48.3846 123.794 48.3841 123.792C48.3831 123.789 48.3846 123.792 48.3847 123.802C48.3848 123.808 48.3846 123.814 48.3838 123.82C48.383 123.827 48.3819 123.833 48.3807 123.837C48.3796 123.842 48.3789 123.843 48.38 123.84C48.3811 123.838 48.3849 123.829 48.3937 123.814L43.1976 120.814L38.0014 117.814C33.3826 125.814 39.1561 135.814 48.3937 135.814V129.814ZM79.8086 126.814L74.6124 123.814V129.814V135.814C78.8997 135.814 82.8612 133.526 85.0048 129.814L79.8086 126.814ZM115.133 65.6291L120.329 68.629C122.472 64.9162 122.472 60.3419 120.329 56.6291L115.133 59.6291L109.936 62.6291V62.6291L115.133 65.6291Z"
        fill="black" mask="url(#avax-mask)" />
    </svg>
  );
}

// ─── Exact BTC SVG (user message) scaled to 72×72 ────────────────────────────
function BTCIcon({ filled, fillColor }: { filled: boolean; fillColor: string }) {
  return (
    <svg width="72" height="72" viewBox="0 0 194 194" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
      <circle cx="97" cy="97" r="94" stroke="black" strokeWidth="6" fill={filled ? fillColor : "white"} />
      <path d="M105 57C114.389 57 122 64.6112 122 74V75C122 84.3888 114.389 92 105 92H75V57H105Z"
        stroke="black" strokeWidth="6" fill="none" />
      <path d="M111 94C120.389 94 128 101.611 128 111V114C128 123.389 120.389 131 111 131H75V94H111Z"
        stroke="black" strokeWidth="6" fill="none" />
      <line x1="61" y1="57" x2="83" y2="57" stroke="black" strokeWidth="6" />
      <line x1="61" y1="131" x2="83" y2="131" stroke="black" strokeWidth="6" />
      <line x1="84" y1="46" x2="84" y2="55" stroke="black" strokeWidth="6" />
      <line x1="84" y1="133" x2="84" y2="142" stroke="black" strokeWidth="6" />
      <line x1="95" y1="46" x2="95" y2="55" stroke="black" strokeWidth="6" />
      <line x1="95" y1="133" x2="95" y2="142" stroke="black" strokeWidth="6" />
    </svg>
  );
}

// ─── ETH — clean diamond matching reference image ─────────────────────────────
function ETHIcon({ filled, fillColor }: { filled: boolean; fillColor: string }) {
  return (
    <svg width="72" height="72" viewBox="0 0 194 194" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ overflow: "visible" }}>
      <circle cx="97" cy="97" r="94" stroke="black" strokeWidth="6" fill={filled ? fillColor : "white"} />
      {/* top diamond */}
      <polygon points="97,38 145,90 97,108 49,90" stroke="black" strokeWidth="6" fill="none" strokeLinejoin="round" />
      {/* bottom diamond */}
      <polygon points="97,156 145,104 97,120 49,104" stroke="black" strokeWidth="6" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Coin flip wrapper ────────────────────────────────────────────────────────
function Coin({
  label,
  fillColor,
  active,
  onEnter,
  onLeave,
  children,
  scale = 1,
}: {
  label: string;
  fillColor: string;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  children: (props: { filled: boolean; fillColor: string }) => React.ReactNode;
  scale?: number;
}) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        marginTop: "5%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 7,
        cursor: "pointer",
        transform: `scale(${scale})`,
        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div style={{ width: 72, height: 72, perspective: 600 }}>
        <div style={{
          width: "100%", height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          transform: active ? "rotateY(180deg)" : "rotateY(0deg)",
        }}>
          {/* front */}
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            {children({ filled: false, fillColor })}
          </div>
          {/* back */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}>
            {children({ filled: true, fillColor })}
          </div>
        </div>
      </div>
      <span style={{
        fontFamily: '"Courier New", monospace',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: active ? "#0D0B08" : "#aaa",
        transition: "color 0.3s",
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MarketSelector() {
  const [hovered, setHovered] = useState<Market>(null);

  return (
    <>
      <style>{`
        @keyframes candleFloat {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-7px); }
        }
        .candle-line, .candle-rect {
          transition: stroke 0.3s, fill 0.3s;
        }
        .candle-red:hover .candle-line, .candle-red:hover .candle-rect {
          stroke: #C0392B;
        }
        .candle-red:hover .candle-rect {
          fill: #C0392B;
        }
        .candle-green:hover .candle-line, .candle-green:hover .candle-rect {
          stroke: #1D9E75;
        }
        .candle-green:hover .candle-rect {
          fill: #1D9E75;
        }
      `}</style>

      <div style={{
        // background: "orange",
        // background: "#FAF8F3",        
        transition: "background 0.4s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        gap: 20,
        boxSizing: "border-box",
        padding: "24px 32px 10%",
        borderRadius: 4,
      }}>

        {/* candlestick chart — constrained to ~25% of width */}
        <CandlestickChart />


        {/* coins */}
        <div style={{ display: "flex", gap: 36, alignItems: "center", overflow: "visible"}}>
          <Coin label="BTC" fillColor="#F7931A"
            active={hovered === "BTC"}
            scale={hovered ? (hovered === "BTC" ? 1.15 : 0.85) : 1}
            onEnter={() => setHovered("BTC")}
            onLeave={() => setHovered(null)}>
            {(p) => <BTCIcon {...p} />}
          </Coin>
          <Coin label="AVAX" fillColor="#E84142"
            active={hovered === "AVAX"}
            scale={hovered ? (hovered === "AVAX" ? 1.15 : 0.85) : 1}
            onEnter={() => setHovered("AVAX")}
            onLeave={() => setHovered(null)}>
            {(p) => <AVAXIcon {...p} />}
          </Coin>
          <Coin label="ETH" fillColor="#627EEA"
            active={hovered === "ETH"}
            scale={hovered ? (hovered === "ETH" ? 1.15 : 0.85) : 1}
            onEnter={() => setHovered("ETH")}
            onLeave={() => setHovered(null)}>
            {(p) => <ETHIcon {...p} />}
          </Coin>
        </div>

        {/* active hint */}
        {/* <div style={{ height: 14 }}>
          {hovered && (
            <span style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#C0392B",
            }}>
              ↳ {hovered} MARKET SELECTED
            </span>
          )}
        </div> */}
      </div>
    </>
  );
}

/*
  ─── Usage ────────────────────────────────────────────────────────────────────
  import MarketSelector from "@/components/MarketSelector";

  {i === 1 && <MarketSelector />}

  ─── Size: 483×322px — same footprint as WalletAnimation ─────────────────────
  ─── No external dependencies ─────────────────────────────────────────────────
*/