import React from "react";

// ─── Candle data ──────────────────────────────────────────────────────────────
const CANDLES = [
//   { cx: 20,  bodyTop: 28, bodyH: 80,  topWick: 20, botWick: 18, delay: "0s",    color: "red"   },
//   { cx: 58,  bodyTop: 10, bodyH: 100, topWick: 18, botWick: 20, delay: "0.35s", color: "green" },
  { cx: 56,  bodyTop: 22, bodyH: 50,  topWick: 32, botWick: 26, delay: "0s",  color: "red"   },
  { cx: 104, bodyTop: 8,  bodyH: 128,  topWick: 30, botWick: 22, delay: "0.3s",  color: "green" },
//   { cx: 172, bodyTop: 18, bodyH: 78,  topWick: 16, botWick: 20, delay: "0.5s",  color: "green" },
];
const CW = 28; // candle body width

// ─── CandlestickChart ─────────────────────────────────────────────────────────
function CandlestickChart() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 155"
      fill="none"
      style={{ overflow: "visible" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {CANDLES.map((c, i) => (
        <g
          key={i}
          className={`candle-group candle-${c.color}`}
          style={{ animation: `candleFloat 2.8s ease-in-out ${c.delay} infinite`, cursor: "pointer" }}
        >
          <line
            x1={c.cx} y1={c.bodyTop - c.topWick}
            x2={c.cx} y2={c.bodyTop}
            stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" className="candle-line"
          />
          <rect
            x={c.cx - CW / 2} y={c.bodyTop}
            width={CW} height={c.bodyH}
            stroke="#1a1a1a" strokeWidth="1.5" fill="white" className="candle-rect"
          />
          <line
            x1={c.cx} y1={c.bodyTop + c.bodyH}
            x2={c.cx} y2={c.bodyTop + c.bodyH + c.botWick}
            stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" className="candle-line"
          />
        </g>
      ))}
    </svg>
  );
}

// ─── ArrowUp: arrow + two spring lines beneath it ────────────────────────────
// The arrow bounces off the two horizontal lines (spring effect).
// Only the arrow head animates; the lines stay static as the "floor".
function ArrowUp() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 181 286"
      fill="none"
      style={{ overflow: "visible" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Static floor lines */}
      <line x1="51" y1="255" x2="128" y2="255" stroke="#0D0B08" strokeWidth="6" strokeLinecap="round" />
      <line x1="51" y1="278" x2="128" y2="278" stroke="#0D0B08" strokeWidth="6" strokeLinecap="round" />

      {/* Animated arrow (bounces off the lines above) */}
      <g style={{
        animation: "arrowUpBounce 2.4s ease-in-out infinite",
        transformOrigin: "90px 260px"
      }}>
        <mask id="upArrow-mask" fill="white">
          <path d="M180.116 116.791H128.063V224.872H52.0508V116.791H0L90.0576 0L180.116 116.791Z" />
        </mask>
        <path
          d="M180.116 116.791V122.791H192.32L184.868 113.127L180.116 116.791ZM128.063 116.791V110.791H122.063V116.791H128.063ZM128.063 224.872V230.872H134.063V224.872H128.063ZM52.0508 224.872H46.0508V230.872H52.0508V224.872ZM52.0508 116.791H58.0508V110.791H52.0508V116.791ZM0 116.791L-4.75145 113.127L-12.2032 122.791H0V116.791ZM90.0576 0L94.809 -3.66387L90.0576 -9.82571L85.3062 -3.66384L90.0576 0ZM180.116 116.791V110.791H128.063V116.791V122.791H180.116V116.791ZM128.063 116.791H122.063V224.872H128.063H134.063V116.791H128.063ZM128.063 224.872V218.872H52.0508V224.872V230.872H128.063V224.872ZM52.0508 224.872H58.0508V116.791H52.0508H46.0508V224.872H52.0508ZM52.0508 116.791V110.791H0V116.791V122.791H52.0508V116.791ZM0 116.791L4.75145 120.455L94.8091 3.66384L90.0576 0L85.3062 -3.66384L-4.75145 113.127L0 116.791ZM90.0576 0L85.3062 3.66387L175.365 120.455L180.116 116.791L184.868 113.127L94.809 -3.66387L90.0576 0Z"
          fill="#0D0B08"
          mask="url(#upArrow-mask)"
        />
      </g>
    </svg>
  );
}

// ─── ArrowDown: plain arrow pointing down with a gentle wave animation ────────
function ArrowDown() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 181 225"
      fill="none"
      style={{ overflow: "visible", animation: "arrowDownWave 2.4s ease-in-out infinite", transformOrigin: "90px 112px" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask id="downArrow-mask" fill="white">
        <path d="M180.116 108.081H128.063V0H52.0508V108.081H0L90.0576 224.872L180.116 108.081Z" />
      </mask>
      <path
        d="M180.116 108.081V102.081H192.32L184.868 111.745L180.116 108.081ZM128.063 108.081V114.081H122.063V108.081H128.063ZM128.063 0V-6H134.063V0H128.063ZM52.0508 0H46.0508V-6H52.0508V0ZM52.0508 108.081H58.0508V114.081H52.0508V108.081ZM0 108.081L-4.75145 111.745L-12.2032 102.081H0V108.081ZM90.0576 224.872L94.809 228.536L90.0576 234.698L85.3062 228.536L90.0576 224.872ZM180.116 108.081V114.081H128.063V108.081V102.081H180.116V108.081ZM128.063 108.081H122.063V0H128.063H134.063V108.081H128.063ZM128.063 0V6H52.0508V0V-6H128.063V0ZM52.0508 0H58.0508V108.081H52.0508H46.0508V0H52.0508ZM52.0508 108.081V114.081H0V108.081V102.081H52.0508V108.081ZM0 108.081L4.75145 104.417L94.8091 221.208L90.0576 224.872L85.3062 228.536L-4.75145 111.745L0 108.081ZM90.0576 224.872L85.3062 221.208L175.365 104.417L180.116 108.081L184.868 111.745L94.809 228.536L90.0576 224.872Z"
        fill="#0D0B08"
        mask="url(#downArrow-mask)"
      />
    </svg>
  );
}

function Lock() {
    return(
        <svg width="100%" height="100%" viewBox="0 0 154 154" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="77" cy="77" r="74" stroke="black" stroke-width="6"/>
        <rect x="47.6484" y="65.1177" width="58.7059" height="52.8824" rx="17" stroke="black" stroke-width="6"/>
        <path d="M76.3545 34.7059C85.0611 34.7059 92.1191 41.764 92.1191 50.4706V62.9999H60.5898V50.4706C60.5899 41.764 67.6479 34.706 76.3545 34.7059Z" stroke="black" stroke-width="6"/>
        <path d="M77.0007 89.9412C79.8596 89.9412 82.1772 92.5053 82.1772 95.6683C82.1772 98.0507 80.8622 100.093 78.9916 100.956V108.444C78.9916 109.661 78.1003 110.647 77.0007 110.647C75.9011 110.647 75.0097 109.661 75.0097 108.444V100.956C73.1391 100.093 71.8242 98.0507 71.8242 95.6683C71.8242 92.5053 74.1418 89.9412 77.0007 89.9412Z" fill="black"/>
        </svg>

    )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
interface UpnDownProps {
  /** Optional element to render in the bottom-right corner of the section */
  
  bottomRight?: React.ReactNode;
}

export default function UpnDown({ bottomRight }: UpnDownProps = {}) {
  return (
    <>
      <style>{`
        @keyframes candleFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        .candle-line, .candle-rect {
          transition: stroke 0.3s, fill 0.3s;
        }
        .candle-red:hover .candle-line,
        .candle-red:hover .candle-rect  { stroke: #C0392B; }
        .candle-red:hover .candle-rect  { fill: #C0392B; }
        .candle-green:hover .candle-line,
        .candle-green:hover .candle-rect { stroke: #1D9E75; }
        .candle-green:hover .candle-rect { fill: #1D9E75; }

        /* Arrow Up: drop → squish against the spring lines → launch up → settle */
        @keyframes arrowUpBounce {
        0%   { transform: translateY(0px);  }
        30%  { transform: translateY(18px); }   /* arrow drifts down toward lines */
        50%  { transform: translateY(22px); }   /* closest point — compressed */
        65%  { transform: translateY(-22px); }  /* launches up — spring release */
        78%  { transform: translateY(-8px); }   /* settles back down */
        88%  { transform: translateY(2px);  }   /* tiny overshoot */
        100% { transform: translateY(0px);  }   /* rest */
        }

        /* Arrow Down: gentle sine-wave float */
        @keyframes arrowDownWave {
          0%, 100% { transform: translateY(0px)   rotate(0deg);   }
          25%      { transform: translateY(10px)    rotate(0deg); }
          75%      { transform: translateY(-10px)   rotate(0deg);}
        }
      `}</style>

      {/*
        Outer wrapper: constrained to the visible slice of the card.
        Card 03 sits at left: 50%, card 04 at 75%, so only ~25vw is visible.
        We cap width to that and keep everything left-aligned.
      */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "calc(25vw - 28px)",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          padding: "clamp(8px, 1.5vw, 20px)",
        }}
      >
        {/* ── Candlestick chart — centered, responsive ── */}
        <div
          style={{
            width:  "clamp(80px, 100%, 260px)",
            height: "clamp(120px, 100%, 400px)",
          }}
        >
          <CandlestickChart />
        </div>

        {/* ── Arrow Up — top-right of the visible area ── */}
        <div
          style={{
            position: "absolute",
            top:   "clamp(30px, 4%, 12px)",
            right: "clamp(44px, 2%, 12px)",
            width:  "clamp(31px, 5.2vw, 85px)",
            height: "clamp(44px, 9.8vw, 220px)",
            pointerEvents: "none",
          }}
        >
          <ArrowUp />
        </div>

        {/* ── Arrow Down — bottom-left of the visible area ── */}
        <div
          style={{
            scale: 1,
            position: "absolute",
            bottom: "clamp(2px, 8%, 12px)",
            left:   "clamp(2px, 6%, 32px)",
            width:  "clamp(31px, 5.2vw, 85px)",
            height: "clamp(44px, 9.8vw, 220px)",
            pointerEvents: "none",
          }}
        >
          <ArrowDown />
        </div>
        
        {/* <div
        style={{
            position: "absolute",
            bottom: "clamp(2px, 4%, 2px)",
            right:  "clamp(22px, 2%, 32px)",
            width:  "clamp(31px, 5.2vw, 85px)",
            height: "clamp(44px, 9.8vw, 220px)",
            pointerEvents: "none",
        }}
        >
        <Lock />
        </div> */}
      </div>
    </>
  );
}