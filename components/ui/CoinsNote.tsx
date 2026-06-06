"use client";

import { useEffect, useRef, useState } from "react";

// ── Config ─────────────────────────────────────
const STACK_COUNT = 4;    // number of coins to stack
// ───────────────────────────────────────────────

function CoinSVG() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 389 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <path
        className="coin-path"
        d="M382.386 49.3818L66.54 92.3965L4.6875 38.9092L289.271 2.0625L382.386 49.3818Z"
        stroke="#0D0B08"
        strokeWidth="4"
      />
      <path
        className="coin-path"
        d="M387 71.7363L67.4521 112.235L67.0381 92.7598L387 52.7646V71.7363Z"
        stroke="#0D0B08"
        strokeWidth="4"
      />
      <path
        className="coin-path"
        d="M66.4346 92.6641L64.7705 111.381L3.93359 56.7715L2.34863 40.9209L66.4346 92.6641Z"
        stroke="#0D0B08"
        strokeWidth="3"
      />
      <path
        d="M155.978 43.321C158.444 40.2273 167.714 37.7256 172.816 38.5893C177.918 39.4529 183.339 42.4883 175.464 45.6831C166.182 49.1714 170.415 52.5469 176.628 53.3788C182.841 54.2107 192.504 53.2975 196.773 47.0968M155.667 38.6438L193.645 54.0405M138.5 46C138.5 54.2843 155.065 61 175.5 61C195.935 61 212.5 54.2843 212.5 46C212.5 37.7157 195.935 31 175.5 31C155.065 31 138.5 37.7157 138.5 46Z"
        stroke="#0D0B08"
        strokeWidth="4"
      />
    </svg>
  );
}

export default function CoinsNote() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // IntersectionObserver will fire when this component (in card 4)
    // slides horizontally into the visible viewport.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          setIsVisible(false); // Reset so it drops again if scrolled back
        }
      },
      { threshold: 0.1 } // Trigger when 10% visible
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      style={{
        width: "100%",
        maxWidth: "calc(25vw - 56px)", // Restrict width to the visible 25% area
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end", // Stack them towards the bottom
        paddingBottom: "40px",
      }}
    >
      <style>{`
        .coin-path {
          fill: #FAF8F3;
          transition: fill 0.2s ease;
        }
        .coin-wrapper {
          cursor: pointer;
        }
        .coin-wrapper:hover .coin-path {
          fill: #1D9E75; /* Turn green on hover */
        }
        @keyframes coinDrop {
          0%   { transform: translateY(-300px); opacity: 0; }
          40%  { opacity: 1; }
          70%  { transform: translateY(0); }
          85%  { transform: translateY(-12px); }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {Array.from({ length: STACK_COUNT }).map((_, i) => (
          <div
            key={i}
            className="coin-wrapper"
            style={{
              width: "100%",
              // More negative margin pulls coins up so they overlap more tightly
              marginTop: i === 0 ? 0 : "-22%",
              position: "relative",
              zIndex: STACK_COUNT - i, // Top coin has highest z-index
              opacity: 0, // start invisible
              // Delay reversed: bottom coin (i=3) drops first (delay 0), top coin (i=0) drops last
              animation: isVisible
                ? `coinDrop 0.6s cubic-bezier(0.04, 1.56, 0.64, 1) ${(STACK_COUNT - 1 - i) * 0.12}s forwards`
                : "none",
            }}
          >
            <CoinSVG />
          </div>
        ))}
      </div>
    </section>
  );
}