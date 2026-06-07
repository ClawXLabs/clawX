import { useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Shape { d: string; fill: string; sw: number }
type Pt = [number, number];

// ─── Logo paths ───────────────────────────────────────────────────────────────
const SHAPES: Shape[] = [
  { d:"M519.622 1109.22C598.355 1155.75 605.652 1179.19 705.026 1209.17C715.201 1232.73 738.864 1248.75 768.658 1259.5C799.089 1270.48 836.504 1276.19 874.19 1278.66C944.882 1283.31 1017.19 1276.61 1047.61 1271.44C1045.05 1276.24 1040.8 1281.2 1034.9 1286.24C1027.05 1292.94 1016.52 1299.58 1003.9 1305.94C978.672 1318.67 945.444 1330.16 909.48 1338.96C873.531 1347.76 834.959 1353.86 799.08 1355.86C763.156 1357.86 730.138 1355.74 705.194 1348.27L705.013 1348.21L704.825 1348.18C636.233 1336.78 585.994 1289.97 554.941 1238.75C539.425 1213.16 528.762 1186.57 523.03 1162.93C517.788 1141.33 516.739 1122.49 519.622 1109.22Z", fill:"#742015", sw:6 },
  { d:"M424.15 978.741C427.067 995.351 431.874 1006.85 438.169 1016C445.298 1026.36 454.236 1033.53 463.733 1041.51C473.273 1049.53 483.655 1058.58 494.324 1072.93C504.999 1087.29 516.036 1107.06 526.679 1136.52C548.285 1196.32 585.905 1256.85 655.368 1295.44C722.287 1332.63 818.328 1349.21 957.176 1325.77C893.02 1363.16 816.928 1387.85 745.559 1398.71C668.923 1410.37 598.262 1406 553.792 1384.79C509.065 1363.46 442.125 1308.7 404.23 1235.06C367.228 1163.16 357.918 1073.34 424.15 978.741Z", fill:"#A01D25", sw:6 },
  { d:"M406.756 883.319C436.217 922.09 430.77 961.276 417.352 1001.99C413.953 1012.31 410.058 1022.67 406.105 1033.14C402.159 1043.59 398.155 1054.14 394.578 1064.74C387.427 1085.94 381.906 1107.55 381.906 1129.46C381.906 1214.89 459.541 1359.21 631.927 1406.24C598.877 1414.86 554.153 1413.42 504.378 1403.6C449.447 1392.76 388.752 1371.78 331.562 1343.38C274.365 1314.98 220.791 1279.2 180.029 1238.81C139.242 1198.39 111.5 1153.58 105.477 1107.11C99.4019 1060.24 106.538 1024.88 122.561 997.669C138.598 970.436 163.737 951.033 194.271 936.449C224.826 921.854 260.618 912.165 297.737 904.276C316.286 900.333 335.123 896.848 353.775 893.422C371.767 890.118 389.594 886.865 406.756 883.319Z", fill:"#CC0B0B", sw:6 },
  { d:"M131.526 687.001C179.976 697.031 250.547 722.56 308.136 757.458C337.026 774.965 362.4 794.682 380.079 815.77C397.763 836.863 407.409 858.9 405.832 881.26C399.178 975.599 335.44 1058.75 227.06 1075.51C118.381 1089.08 13.8876 1008.75 5 881.435C5.00857 823.679 9.22291 774.997 27.1455 740.786C36.0322 723.823 48.2652 710.482 65.082 701.328C81.8501 692.201 103.497 687.062 131.526 687.001Z", fill:"#A40303", sw:10 },
  { d:"M197.413 548C305.095 548 392.959 643.196 392.959 761.36V761.413C393.798 825.147 381.717 870.511 356.002 898.257C330.453 925.823 290.552 936.915 233.395 929.999L233.181 929.973L232.966 929.97L231.739 929.949C179.836 928.855 130.799 900.867 94.7012 857.997C58.3321 814.805 35.3788 756.809 36.0127 696.981V696.938C36.0127 637.426 49.7013 600.635 75.9629 578.512C102.397 556.243 142.502 548 197.413 548Z", fill:"#5F1C28", sw:8 },
  { d:"M208.262 386.056C230.922 380.425 250.063 382.904 266.619 391.806C283.231 400.737 297.424 416.232 309.939 436.946C334.999 478.425 352.963 540.189 370.279 609.869L370.325 610.051L370.403 610.222C385.5 643.015 394.29 697.993 390.588 747.445C388.739 772.154 383.781 795.334 375.039 813.599C366.301 831.857 353.88 845.022 337.161 850.137C302.865 860.63 252.359 856.856 206.101 833.105C159.921 809.394 118.06 765.814 100.903 696.774C83.687 627.495 87.7927 555.342 107.65 497.712C127.532 440.01 163.028 397.297 208.262 386.056Z", fill:"#8E0000", sw:4 },
  { d:"M256.606 336.035C290.808 294.052 334.822 271.661 389.431 279.414L389.471 279.419L389.511 279.424C438.682 284.789 483.341 317.4 513.879 366.198C544.199 414.649 560.462 478.878 553.277 547.55C441.564 600.956 412.327 682.23 366.541 752.986C361.073 761.437 353.919 766.635 345.627 769.055C337.291 771.489 327.627 771.163 317.138 768.233C296.119 762.361 272.248 746.151 250.365 722.147C206.64 674.186 171.567 595.907 183.181 510.084C198.017 439.758 222.339 378.099 256.606 336.035Z", fill:"#B71223", sw:5 },
  { d:"M641.027 99.5099C723.808 70.6027 862.13 74.573 987.279 108.001C1049.8 124.702 1108.87 148.712 1155.93 179.507C1201.26 209.169 1235.25 244.997 1250.67 286.471C1170.01 259.005 1045.88 233.07 939.029 239.788C884.512 243.216 834.231 255.157 796.506 279.967C758.981 304.647 734.024 341.975 729.645 395.783C711.672 405.302 700.784 416.634 693.545 429.397C686.194 442.359 682.68 456.686 679.181 471.611C672.177 501.481 665.048 534.663 628.054 568.674C590.788 602.935 557.125 617.522 528.971 625.21C514.855 629.064 502.113 631.19 490.848 633.195C479.67 635.185 469.776 637.079 461.742 640.523C454.02 643.833 448.306 645.612 442.705 647.805C437.192 649.963 432.218 652.38 426.807 656.717C416.124 665.279 403.928 681.186 381.737 716.901C370.977 734.218 358.287 740.157 345.384 737.715C332.119 735.203 317.727 723.711 304.173 703.94C277.158 664.535 254.644 593.911 251.551 505.072C252.437 475.345 263.806 437.668 283.85 397.127C303.891 356.591 332.521 313.362 367.713 272.617C438.135 191.082 534.579 119.771 640.67 99.605L640.851 99.5714L641.027 99.5099Z", fill:"#E23B3B", sw:5 },
  { d:"M894.371 229.465C1004.43 208.692 1106.78 211.945 1236.6 280.784C1218.27 277.135 1192.29 272.692 1166.54 271.658C1150.1 270.998 1133.67 271.722 1119.34 274.971C1105.63 278.08 1093.66 283.544 1085.52 292.513C1060.64 279.908 1034.31 269.696 1007.67 272.684C980.653 275.715 953.804 292.255 928.002 332.289C872.349 319.786 834.819 319.652 804.619 331.076C775.169 342.216 753.01 364.232 727.907 395.558C725.704 384.256 727.384 370.493 732.758 355.632C738.753 339.054 749.289 321.276 763.841 304.338C792.943 270.463 837.967 240.112 894.371 229.465Z", fill:"#731712", sw:4 },
  { d:"M620.232 577.8C651.511 552.163 661.175 520.446 669.073 490.162C677.722 457 684.223 425.989 713.603 404.821C734.539 389.736 750.737 387.937 763.402 390.846C776.276 393.804 785.724 401.609 793.457 406.654C801.156 411.676 816.477 418.951 833.001 420.434C849.13 421.882 866.59 417.799 878.974 400.584C887.965 406.367 895.88 411.544 903.165 415.435C910.898 419.566 918.113 422.354 925.416 422.884C939.91 423.936 953.885 416.066 972.371 395.158C991.512 407.64 1019.16 410.042 1046.92 401.747C1074.14 393.611 1101.67 375.148 1121.83 345.456C1122.81 356.937 1119.53 373.264 1111.77 392.144C1102.83 413.867 1088.08 438.66 1067.64 462.752C1026.75 510.933 963.215 556.182 878.137 568.56L878.115 568.563L878.094 568.567C804.238 580.976 769.83 573.892 737.571 568.787C721.361 566.221 705.601 564.135 685.724 565.288C668.127 566.308 647.37 569.865 620.232 577.8Z", fill:"#731712", sw:4 },
  { d:"M851.965 1058.47C861.185 1056.3 869.538 1056.99 877.287 1059.37C887.532 1062.53 896.654 1068.63 905.236 1074.72C913.919 1080.87 921.984 1086.94 930.432 1090.52C938.755 1094.04 947.309 1095.07 956.959 1091.16C960.358 1089.78 962.496 1088.16 963.847 1086.46C965.188 1084.76 965.861 1082.84 966.109 1080.65C966.361 1078.42 966.169 1075.96 965.792 1073.24C965.604 1071.89 965.376 1070.5 965.143 1069.06C964.912 1067.63 964.677 1066.16 964.486 1064.66C963.723 1058.71 963.598 1052.17 967.291 1046.01C970.799 1040.16 977.529 1035.03 989.406 1030.9C985.983 1019.31 983.017 1004.66 986.203 992.78C987.908 986.423 991.39 980.795 997.503 976.912C1003.19 973.302 1010.97 971.318 1021.31 971.446C1021.08 964.333 1020.81 958.339 1020.96 953.364C1021.12 947.899 1021.79 943.34 1023.77 939.591C1025.79 935.76 1029.05 933.003 1033.9 930.883C1038.38 928.926 1044.31 927.471 1052.05 926.195C1052.39 917.199 1054.35 909.748 1057.87 903.638C1061.6 897.138 1067.02 892.281 1073.8 888.708C1086.11 882.228 1103.02 879.923 1123.01 879.537C1117.53 876.135 1109.21 873.215 1098.71 871.405C1084.99 869.04 1067.87 868.622 1049.29 871.291C1012.14 876.63 969.313 894.286 936.213 933.154L936.199 933.17L936.184 933.186C906.564 966.456 899.265 985.991 891.619 1003.87C887.764 1012.89 883.789 1021.58 876.847 1031.32C871.091 1039.41 863.33 1048.17 851.965 1058.47Z", fill:"#731712", sw:4 },
  { d:"M1124.83 1038.26C1145.66 1012.11 1167.87 971.755 1183.56 935.944C1191.41 918.047 1197.6 901.354 1201.17 888.2C1202.95 881.616 1204.07 875.984 1204.42 871.563C1204.43 871.401 1204.44 871.241 1204.46 871.083C1200.81 880.27 1193.94 890.802 1185.11 900.139C1173.65 912.269 1158.55 922.735 1142.29 925.647C1144.79 942.432 1143.36 958.84 1132.77 971.362C1121.96 984.144 1102.06 992.357 1068.74 993.315C1063.72 1026.39 1047.16 1047.73 1024.6 1061.58C1003.24 1074.68 976.583 1081.03 949.455 1084.48C956.82 1088.29 967.171 1090.72 979.468 1091.62C994.577 1092.72 1012.35 1091.49 1030.49 1087.89C1066.86 1080.68 1104.27 1064.07 1124.83 1038.26Z", fill:"#731712", sw:4 },
  { d:"M1129.72 1209.67C1176.41 1172.34 1217.4 1097.27 1236.56 1019.02C1255.09 943.351 1252.97 865.716 1216.93 816.836C1208.59 907.482 1138.7 996.753 1063.64 1046.04C1025.19 1071.28 985.039 1086.27 950.719 1085.39C933.52 1084.94 917.73 1080.51 904.406 1071.31C891.5 1062.4 881.057 1049.14 873.875 1031.05C859.443 1032.62 848.231 1034.01 839.244 1035.78C829.871 1037.62 823.086 1039.86 817.704 1043.02C807.041 1049.29 801.32 1059.52 792.472 1079.97C783.663 1100.32 774.122 1120.87 758.187 1136.9C742.154 1153.04 719.825 1164.45 685.758 1166.99C620.549 1171.85 562.972 1138.95 519.849 1109.84C522.972 1119.04 529.874 1131.36 540.146 1145.39C552.867 1162.76 570.528 1182.46 591.851 1201.64C634.531 1240.02 691.636 1276.09 752.849 1287.4C876.486 1310.24 1029.08 1318.04 1129.45 1209.92L1129.58 1209.79L1129.72 1209.67Z", fill:"#E23B3B", sw:5 },
];

// ─── Layout ───────────────────────────────────────────────────────────────────
const N   = SHAPES.length;
const CX  = 628;  // visual centroid x
const CY  = 760;  // visual centroid y

// Per-shape spawn circle radii — sized to roughly match each path's scale
const RADII: number[] = [110, 148, 178, 168, 162, 158, 162, 218, 138, 142, 108, 108, 182];

// Domino morph sequence: body → right → top-left → left arm → bottom → right claws
const ORDER: number[]     = [7, 9, 8, 6, 5, 4, 3, 2, 1, 0, 12, 11, 10];
const MORPH_STEP: number[] = new Array(N);
ORDER.forEach((idx, s) => { MORPH_STEP[idx] = s; });

// Render: last-to-morph at SVG bottom (drawn first), first-to-morph on top
const RENDER: number[] = [...ORDER].reverse();

// Spawn: bottom-of-pile circles crystallise first (rendered bottom → top)
const SPAWN_STEP: number[] = new Array(N);
RENDER.forEach((idx, s) => { SPAWN_STEP[idx] = s; });

// ─── Timing constants (seconds) — tweak these to adjust speed ─────────────────
const T_SPAWN_STAGGER = 0.03;  // delay between each circle appearing
const T_SPAWN_DUR     = 0.6;   // how long each circle's pop-in takes
const T_SPAWN_TOTAL   = (N - 1) * T_SPAWN_STAGGER + T_SPAWN_DUR;
const T_PAUSE         = 0.15;  // pause after all circles visible, before morphing
const T_MORPH_OFFSET  = T_SPAWN_TOTAL + T_PAUSE;
const T_MORPH_STAGGER = 0.06;  // delay between each shape starting to morph
const T_MORPH_DUR     = 0.7;   // how long each circle→crab morph takes
const ALL_MORPHED     = T_MORPH_OFFSET + (N - 1) * T_MORPH_STAGGER + T_MORPH_DUR;
const T_SETTLE        = 0.3;   // subtle scale snap after morph completes
const T_HOLD          = 0.5;   // how long the finished logo stays on screen
const T_SCROLL        = 0.8;   // slide-up reveal duration
const TOTAL           = ALL_MORPHED + T_SETTLE + T_HOLD + T_SCROLL;

// ─── Geometry helpers ────────────────────────────────────────────────────────
function mkCircle(cx: number, cy: number, r: number): string {
  if (r < 0.1) return `M${cx},${cy}Z`;
  const k = r * 0.5522847498;
  return (
    `M${cx},${cy - r}` +
    ` C${cx + k},${cy - r} ${cx + r},${cy - k} ${cx + r},${cy}` +
    ` C${cx + r},${cy + k} ${cx + k},${cy + r} ${cx},${cy + r}` +
    ` C${cx - k},${cy + r} ${cx - r},${cy + k} ${cx - r},${cy}` +
    ` C${cx - r},${cy - k} ${cx - k},${cy - r} ${cx},${cy - r}Z`
  );
}

function samplePath(el: SVGPathElement, n: number): Pt[] {
  const len = el.getTotalLength();
  return Array.from({ length: n }, (_, i) => {
    const p = el.getPointAtLength((i / n) * len);
    return [p.x, p.y] as Pt;
  });
}

// Catmull-Rom spline through linearly interpolated control points
function interpPath(A: Pt[], B: Pt[], t: number): string {
  const n = A.length;
  const pts: Pt[] = A.map(([ax, ay], i) => [
    ax + (B[i][0] - ax) * t,
    ay + (B[i][1] - ay) * t,
  ]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d + "Z";
}

// ─── Easing ───────────────────────────────────────────────────────────────────
const easeOutBack    = (t: number): number => { const c1=1.70158,c3=c1+1; return 1+c3*(t-1)**3+c1*(t-1)**2; };
const easeOutCubic   = (t: number): number => 1 - (1 - t) ** 3;
const easeOutQuint   = (t: number): number => 1 - (1 - t) ** 5;
const easeInOutSine  = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutExpo    = (t: number): number => t >= 1 ? 1 : 1 - 2 ** (-10 * t);
const easeInQuart    = (t: number): number => t ** 4;
const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const norm  = (v: number, lo: number, hi: number): number => clamp((v - lo) / (hi - lo));

// ─── Component ───────────────────────────────────────────────────────────────
export default function CrabLogoAnimation({ onComplete }: { onComplete?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef  = useRef<SVGSVGElement>(null);
  const rafRef  = useRef<number>(0);
  const t0Ref   = useRef<number>(-1);
  const cPts    = useRef<Pt[][]>([]);
  const fPts    = useRef<Pt[][]>([]);
  const seeded  = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || seeded.current) return;
    seeded.current = true;

    // ── Sample both shapes (hidden off-screen) ─────────────────────────────
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "g");
    tmp.setAttribute("visibility", "hidden");
    svg.appendChild(tmp);
    SHAPES.forEach((shape, i) => {
      const ce = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
      ce.setAttribute("d", mkCircle(CX, CY, RADII[i]));
      tmp.appendChild(ce);
      cPts.current[i] = samplePath(ce, 200);

      const fe = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
      fe.setAttribute("d", shape.d);
      tmp.appendChild(fe);
      fPts.current[i] = samplePath(fe, 200);
    });
    svg.removeChild(tmp);

    const pathEls = SHAPES.map((_, i) =>
      svg.querySelector<SVGPathElement>(`[data-idx="${i}"]`)
    );
    const groupEl = svg.querySelector<SVGGElement>(".sg");

    // ── RAF loop ──────────────────────────────────────────────────────────
    function tick(now: number): void {
      if (t0Ref.current < 0) t0Ref.current = now;
      const elapsed = (now - t0Ref.current) / 1000;
      if (onComplete && elapsed >= TOTAL) {
        onComplete();
        return;
      }
      const t = elapsed % TOTAL;

      // ── Group-level settle + breathe ─────────────────────────────────────
      if (groupEl) {
        let sc = 1;
        if (t > ALL_MORPHED && t < ALL_MORPHED + T_SETTLE) {
          // Settle: very slight scale-down snap as the last shape locks in
          const st = norm(t, ALL_MORPHED, ALL_MORPHED + T_SETTLE);
          sc = 1 + 0.016 * (1 - easeOutCubic(st)) * Math.sin(st * Math.PI);
        } else if (t >= ALL_MORPHED + T_SETTLE && t < ALL_MORPHED + T_SETTLE + T_HOLD) {
          // Breathe: one slow inhale-exhale during the hold
          const bt = norm(t, ALL_MORPHED + T_SETTLE, ALL_MORPHED + T_SETTLE + T_HOLD);
          sc = 1 + 0.004 * Math.sin(bt * Math.PI);
        }
        if (sc !== 1) {
          groupEl.setAttribute("transform",
            `translate(${CX},${CY}) scale(${sc}) translate(${-CX},${-CY})`);
        } else {
          groupEl.removeAttribute("transform");
        }
      }

      // ── Scroll up ──────────────────────────────────────────────────────────
      if (wrapRef.current) {
        const scrollStart = ALL_MORPHED + T_SETTLE + T_HOLD;
        const scrollRaw = norm(t, scrollStart, scrollStart + T_SCROLL);
        if (scrollRaw > 0) {
          wrapRef.current.style.transform = `translateY(${-easeInOutSine(scrollRaw) * 100}vh)`;
        }
      }

      pathEls.forEach((el, i) => {
        if (!el) return;
        const cp = cPts.current[i];
        const fp = fPts.current[i];
        if (!cp || !fp) return;

        const spawnStep = SPAWN_STEP[i];
        const morphStep = MORPH_STEP[i];

        // ── Spawn ───────────────────────────────────────────────────────────
        // Staggered: bottom of pile (spawnStep=0) crystallises first
        const sDel  = spawnStep * T_SPAWN_STAGGER;
        const sRaw  = norm(t, sDel, sDel + T_SPAWN_DUR);
        const sScale = easeOutBack(sRaw);
        // Subtle upward drift — circles rise gently into position
        const sDrift = 28 * (1 - easeOutCubic(sRaw));

        // ── Morph ───────────────────────────────────────────────────────────
        const mStart  = T_MORPH_OFFSET + morphStep * T_MORPH_STAGGER;
        const mRaw    = norm(t, mStart, mStart + T_MORPH_DUR);
        const mEase   = easeOutQuint(mRaw);

        // ── Opacity (spawn in only — no fade out) ────────────────────────────
        const spawnOp = easeOutExpo(clamp(sRaw * 1.5));
        el.style.opacity = clamp(spawnOp).toFixed(3);

        // ── Glimmer: luminance spike as shape "arrives" ─────────────────────
        // Peaks at ~90% of morph, decays sharply — like light catching a
        // newly-formed surface. Purely aesthetic; imperceptible when paused.
        if (mRaw > 0.72 && mRaw < 1) {
          const gp = norm(mRaw, 0.72, 1);
          const brightness = 1 + 0.22 * Math.sin(gp * Math.PI);
          el.style.filter = `brightness(${brightness.toFixed(3)})`;
        } else {
          el.style.filter = "";
        }

        // ── Path ────────────────────────────────────────────────────────────
        let d: string;
        if (mRaw <= 0) {
          // Pre-morph: circle drifting upward during spawn
          d = mkCircle(CX, CY + sDrift, RADII[i] * Math.max(sScale, 0.001));
        } else if (mRaw >= 1) {
          // Post-morph: native path (avoids recalc every frame)
          d = SHAPES[i].d;
          el.style.filter = "";
        } else {
          // Active morph: smooth interpolation via Catmull-Rom spline
          d = interpPath(cp, fp, mEase);
        }
        el.setAttribute("d", d);
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      seeded.current = false;
      t0Ref.current = -1;
    };
  }, [onComplete]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100vh",
        background: "#F3EEEA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      {/*
        mix-blend-mode: multiply renders the SVG paths against the cream
        background using multiplicative compositing — making the dark reds feel
        like ink pressed into warm paper. A hallmark of premium print design.
      */}
      <svg
        ref={svgRef}
        viewBox="0 0 1402 1551"
        aria-label="Animated crab logo"
        style={{
          width: "min(520px, 88vw)",
          display: "block",
          mixBlendMode: "multiply",
        }}
      >
        <g className="sg">
          {RENDER.map(i => (
            <path
              key={i}
              data-idx={i}
              d={mkCircle(CX, CY, RADII[i])}
              fill={SHAPES[i].fill}
              stroke="#1c0906"
              strokeWidth={SHAPES[i].sw * 0.48}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ opacity: 0, willChange: "opacity" }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}