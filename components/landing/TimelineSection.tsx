import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import WalletAnimation from "../ui/WalletAnimation";
import MarketSelector from "../ui/MarketSelector";
import UpnDown from "../ui/UpnDown";
import CoinsNote from "../ui/CoinsNote";

// Register once at module level
gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    n: "01",
    tag: "CONNECT",
    title: "Link Your Wallet",
    body: "Install MetaMask and switch to Avalanche Fuji C-Chain (chain 43113). Our relay pays your gas — zero AVAX required.",
    note: "No AVAX needed from you.",
  },
  {
    n: "02",
    tag: "SELECT",
    title: "Pick a Market",
    body: "Choose BTC, ETH, or AVAX. Each market runs 5-minute prediction rounds settled by Chainlink oracle prices.",
    note: "Oracle-settled on every round.",
  },
  {
    n: "03",
    tag: "POSITION",
    title: "Take UP or DOWN",
    body: "Lock TUSDC into the round contract before the window closes. Your position is immutable on-chain once submitted.",
    note: "Commit before window closes.",
  },
  {
    n: "04",
    tag: "SETTLE",
    title: "Claim Your Winnings",
    body: "Chainlink oracle settles the round at expiry. Winners claim a proportional share of the losing side's pool instantly.",
    note: "Instant on-chain settlement.",
  },
];

// Card 1 anchors at 0%. Cards 2-4 slide in and rest at 75%, 50%, 25%.
const REST_POSITIONS = [0, 0.25, 0.5, 0.75];

export default function TimelineSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const fill = progressFillRef.current;
    if (!section || !fill) return;

    const cards = cardsRef.current.filter(Boolean) as HTMLDivElement[];
    const dots = dotsRef.current;
    const totalSteps = STEPS.length;

    // ─────────────────────────────────────────────────────────────────────────
    // gsap.context() scopes every tween and ScrollTrigger created inside it to
    // this component instance. When ctx.revert() is called on cleanup it undoes
    // all GSAP work — including removing the pin spacer node — without ever
    // touching React-managed DOM nodes. This is what prevents the
    // "Node.removeChild: node is not a child" crash that occurs when:
    //   1. React StrictMode double-invokes the effect and unmounts on the first
    //      pass while GSAP's pin spacer is still in the tree, or
    //   2. ScrollTrigger.getAll().kill() removes ScrollTriggers from *other*
    //      component instances, leaving orphaned spacers behind.
    // ─────────────────────────────────────────────────────────────────────────
    const ctx = gsap.context(() => {
      /* ── Initial states ── */
      cards.forEach((card, i) => {
        gsap.set(card, i === 0 ? { left: "0%", opacity: 1 } : { left: "100%", opacity: 0 });
      });

      /* ── Dot helper ── */
      const setActiveDot = (index: number) => {
        dots.forEach((d, i) => {
          if (!d) return;
          d.style.background = i <= index ? "#C0392B" : "rgba(13,11,8,0.15)";
          d.style.transform =
            i === index ? "scale(1.4)" : i < index ? "scale(1.1)" : "scale(1)";
        });
      };

      setActiveDot(0);

      /* ── Master scrub timeline ── */
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "50% 50%",
          // Each card gets 1.5× viewport height of scroll room
          end: () => `+=${section.offsetHeight * (totalSteps - 1) * 1.5}`,
          pin: true,
          scrub: 0.7,
          anticipatePin: 1,
          onUpdate: (self) => {
            fill.style.width = self.progress * 100 + "%";
            const rawStep = self.progress * (totalSteps - 1);
            setActiveDot(Math.min(Math.round(rawStep), totalSteps - 1));
          },
        },
      });

      // Phase i (0-indexed from 1): card slides in during timeline [i-1 … i]
      for (let i = 1; i < totalSteps; i++) {
        const restPct = REST_POSITIONS[i] * 100;
        // Fade in quickly at phase start
        tl.to(cards[i], { opacity: 1, duration: 0.15, ease: "none" }, i - 1);
        // Slide from 100% to rest position over the full phase
        tl.to(cards[i], { left: `${restPct}%`, duration: 1, ease: "power2.inOut" }, i - 1);
      }

      /* ── Entry Animation for WalletAnimation (Card 01) ── */
      gsap.fromTo(
        ".wallet-anim-container",
        { scale: 1, rotateX: 120, opacity: 0 },
        {
          scale: 1,
          rotateX: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top 85%", // start when section is slightly into the viewport
            end: "50% 50%",   // end when the section pins
            scrub: true,
          },
        }
      );

      ScrollTrigger.refresh();
    }, sectionRef); // ← scope to the section element

    return () => {
      // ctx.revert() cleanly reverses everything — tweens, ScrollTriggers, pin
      // spacers — without ever calling removeChild on React-owned nodes.
      ctx.revert();
    };
  }, []);

  return (
    <section
      id="how"
      ref={sectionRef}
      style={{
        background: "#FAF8F3",
        borderBottom: "3px solid #0D0B08",
        overflow: "hidden",
        width: "100%",
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Section header ── */}
      <div
        style={{
          borderBottom: "1px solid #0D0B08",
          padding: "10px 32px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, height: 1, background: "#0D0B08" }} />
        <span
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#0D0B08",
            whiteSpace: "nowrap",
          }}
        >
          HOW IT WORKS
        </span>
        <div style={{ flex: 1, height: 1, background: "#0D0B08" }} />
      </div>

      {/* ── Red scrub progress bar ── */}
      <div style={{ height: 2, background: "rgba(13,11,8,0.08)", flexShrink: 0 }}>
        <div
          ref={progressFillRef}
          style={{
            height: "100%",
            width: "0%",
            background: "#C0392B",
            transition: "width 0.08s linear",
          }}
        />
      </div>

      {/* ── Card stack container ── */}
      <div
        style={{
          position: "relative",
          flex: 1,
          width: "100%",
          overflow: "hidden",
        }}
      >
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            ref={(el) => { cardsRef.current[i] = el; }}
            style={{
              position: "absolute",
              top: 0,
              left: i === 0 ? "0%" : "100%", // GSAP takes over from here
              width: "100%",
              height: "100%",
              background: "#FAF8F3",
              borderLeft: i > 0 ? "3px solid #0D0B08" : "none",
              zIndex: i + 1, // each card sits on top of the previous
              padding: "36px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: i === 0 ? 1 : 0,
              boxSizing: "border-box",
            }}
          >
            {/* Step number + tag */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: 48,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: "#E8E5DF",
                  letterSpacing: "-0.02em",
                }}
              >
                {step.n}
              </span>
              <span
                style={{
                  fontFamily: '"Courier New", monospace',
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#C0392B",
                }}
              >
                {step.tag}
              </span>
            </div>

            {/* Title */}
            <h3
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 1.2,
                color: "#0D0B08",
                margin: 0,
              }}
            >
              {step.title}
            </h3>

            {/* Thin rule */}
            <div style={{ height: 1, background: "rgba(13,11,8,0.12)", flexShrink: 0 }} />

            {/* Body */}
            <p
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 13,
                lineHeight: 1.75,
                color: "#5A5248",
                margin: 0,
                maxWidth: 360,
              }}
            >
              {step.body}
            </p>

            {i === 0 && (
              <div style={{ marginTop: 'auto', transform: "scale(0.55)", transformOrigin: "left top", perspective: 1200 }}>
                <div className="wallet-anim-container" style={{ transformOrigin: "bottom center" }}>
                  <WalletAnimation />
                </div>
              </div>
            )}
            {i === 1 && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <MarketSelector />
              </div>
            )}
            {i === 2 && (
              <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
                <UpnDown/>
              </div>
            )}
            {i === 3 && (
              <div style={{ flex: 1, minHeight: 0, width: "100%" }}>
                <CoinsNote/>
              </div>
            )}

            {/* Note */}
            <p
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#888",
                margin: 0,
                marginTop: "auto",
              }}
            >
              ↳ {step.note}
            </p>
          </div>
        ))}
      </div>

      {/* ── Step dot indicators ── */}
      {/* <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 7,
            padding: "10px 0 4px",
            flexShrink: 0,
          }}
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              ref={(el) => { dotsRef.current[i] = el; }}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: i === 0 ? "#C0392B" : "rgba(13,11,8,0.15)",
                transition: "background 0.25s, transform 0.25s",
                transform: i === 0 ? "scale(1.4)" : "scale(1)",
              }}
            />
          ))}
        </div> */}

      {/* ── Footer chain info ── */}
      <div
        style={{
          borderTop: "1px solid #0D0B08",
          padding: "10px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          flexShrink: 0,
        }}
      >
        {["Chainlink Oracle", "Avalanche Fuji C-Chain", "Gasless Entry"].map((item, i) => (
          <span
            key={item}
            style={{
              fontFamily: '"Courier New", monospace',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#888",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {i > 0 && <span style={{ color: "rgba(13,11,8,0.2)" }}>·</span>}
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}