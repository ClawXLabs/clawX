import { useState } from "react";

export default function WeighingScale({
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
  const [hovered, setHovered] = useState<"left" | "right" | null>(null);

  // Tilt based solely on hover state:
  // - Left coin hovered: tilts left (-12 degrees)
  // - Right coin hovered: tilts right (+12 degrees)
  // - Card hovered (general): straight 0
  // - Not hovered: straight 0 (completely horizontal)
  const tilt = hovered === "left" ? -12 : hovered === "right" ? 12 : 0;

  // Scales for the coins:
  const leftScale = hovered === "left" ? 1.3 : hovered === "right" ? 0.75 : parentHovered ? 1.1 : 1;
  const rightScale = hovered === "right" ? 1.3 : hovered === "left" ? 0.75 : parentHovered ? 1.1 : 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 654 450"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: "100%", height: "auto", overflow: "visible", ...style }}
    >
      {/* STATIC: Central pillar / stand */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M318.761 2.90539C325.569 -0.97653 328.696 -0.960386 335.239 2.90539L371.627 393H379L390.207 418H399L417 450H237L255 418H263.793L275 393H282.373L318.761 2.90539ZM243.84 446H410.16L396.66 422H257.34L243.84 446ZM268.177 418H385.823L376.409 397H277.591L268.177 418ZM327.098 2.00011C325.369 1.99869 323.479 2.60899 320.653 4.14172L284.382 393H369.618L333.344 4.12316C330.641 2.60749 328.814 2.00157 327.098 2.00011Z"
        fill="black"
      />

      {/* ROTATING BEAM (Only the horizontal beam bar rotates!) */}
      <g
        style={{
          transformOrigin: "327.5px 44.5px",
          transform: `rotate(${tilt}deg)`,
          transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M327.5 15C336.643 15 344.815 19.1603 350.226 25.6904L542 40.2793V48.7207L350.226 63.3086C344.815 69.8392 336.644 74 327.5 74C318.322 74 310.124 69.8088 304.714 63.2363L113 48.7207V40.2793L304.714 25.7627C310.124 19.1907 318.323 15 327.5 15ZM353.151 29.9238C355.6 34.2235 357 39.1981 357 44.5C357 49.8011 355.6 54.775 353.152 59.0742L538 45.0127V43.9863L353.151 29.9238ZM117 43.9873V45.0117L301.808 59.0049C299.384 54.7216 298 49.7725 298 44.5C298 39.2267 299.384 34.2769 301.809 29.9932L117 43.9873Z"
          fill="black"
        />
      </g>

      {/* LEFT HANGING PAN (Moves purely up and down following the end of the beam, keeping perfectly vertical orientation!) */}
      <g
        style={{
          transformOrigin: "327.5px 44.5px",
          transform: `translate(${-214 * (Math.cos((tilt * Math.PI) / 180) - 1)}px, ${-214 * Math.sin((tilt * Math.PI) / 180)}px)`,
          transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <circle cx="113.5" cy="44.5002" r="6" fill="#D9D9D9" stroke="black" strokeWidth="7" />
        <path d="M113.5 42.0002L211.794 305.25H15.2061L113.5 42.0002Z" stroke="black" strokeWidth="4" />

        {/* Left coin — interactive, scales on hover */}
        <g
          style={{
            transformOrigin: "113.5px 262px",
            transform: `scale(${leftScale})`,
            transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
            cursor: "pointer",
          }}
          onMouseEnter={() => setHovered("left")}
          onMouseLeave={() => setHovered(null)}
        >
          <path
            d="M107 201C140.689 201 168 228.311 168 262C168 295.69 140.689 323 107 323C73.3106 323 46 295.69 46 262C46 228.311 73.3106 201 107 201ZM87.1973 271.168H127.505L107.352 236.26L87.1973 271.168Z"
            fill="#545454"
          />
          <path
            d="M168 262H170H168ZM46 262H44H46ZM87.1973 271.168L85.4652 270.168L83.7332 273.168H87.1973V271.168ZM127.505 271.168V273.168H130.969L129.237 270.168L127.505 271.168ZM107.352 236.26L109.084 235.26L107.352 232.26L105.62 235.26L107.352 236.26ZM107 201V203C139.585 203 166 229.415 166 262H168H170C170 227.206 141.794 199 107 199V201ZM168 262H166C166 294.585 139.585 321 107 321V323V325C141.794 325 170 296.794 170 262H168ZM107 323V321C74.4152 321 48 294.585 48 262H46H44C44 296.794 72.2061 325 107 325V323ZM46 262H48C48 229.415 74.4152 203 107 203V201V199C72.2061 199 44 227.206 44 262H46ZM87.1973 271.168V273.168H127.505V271.168V269.168H87.1973V271.168ZM127.505 271.168L129.237 270.168L109.084 235.26L107.352 236.26L105.619 237.26L125.773 272.168L127.505 271.168ZM107.352 236.26L105.62 235.26L85.4652 270.168L87.1973 271.168L88.9293 272.168L109.084 237.26L107.352 236.26Z"
            fill="black"
          />
        </g>

        {/* Left base */}
        <path
          d="M214 304C214 308.99 211.388 313.932 206.312 318.542C201.236 323.153 193.797 327.342 184.418 330.87C175.039 334.399 163.905 337.198 151.651 339.108C139.397 341.017 126.264 342 113 342C99.7365 342 86.6029 341.017 74.349 339.108C62.0951 337.198 50.9609 334.399 41.5822 330.87C32.2035 327.342 24.7639 323.153 19.6882 318.542C14.6124 313.932 12 308.99 12 304L113 304H214Z"
          fill="black"
        />
      </g>

      {/* RIGHT HANGING PAN (Moves purely up and down following the end of the beam, keeping perfectly vertical orientation!) */}
      <g
        style={{
          transformOrigin: "327.5px 44.5px",
          transform: `translate(${213 * (Math.cos((tilt * Math.PI) / 180) - 1)}px, ${213 * Math.sin((tilt * Math.PI) / 180)}px)`,
          transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <circle cx="540.5" cy="44.5002" r="6" fill="#D9D9D9" stroke="black" strokeWidth="7" />
        <path d="M540.5 42.0002L638.794 305.25H442.206L540.5 42.0002Z" stroke="black" strokeWidth="4" />

        {/* Right coin — interactive, scales on hover */}
        <g
          style={{
            transformOrigin: "541.5px 258.5px",
            transform: `scale(${rightScale})`,
            transition: "transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)",
            cursor: "pointer",
          }}
          onMouseEnter={() => setHovered("right")}
          onMouseLeave={() => setHovered(null)}
        >
          <path
            d="M541.5 194C577.122 194 606 222.878 606 258.5C606 294.123 577.122 323 541.5 323C505.878 323 477 294.123 477 258.5C477 222.878 505.878 194 541.5 194ZM520.562 268.194H563.183L541.873 231.283L520.562 268.194Z"
            fill="#545454"
          />
          <path
            d="M520.562 268.194L518.83 267.194L517.098 270.194H520.562V268.194ZM563.183 268.194V270.194H566.647L564.915 267.194L563.183 268.194ZM541.873 231.283L543.605 230.283L541.873 227.283L540.141 230.283L541.873 231.283ZM541.5 194V196C576.018 196 604 223.982 604 258.5H606H608C608 221.773 578.227 192 541.5 192V194ZM606 258.5H604C604 293.018 576.018 321 541.5 321V323V325C578.227 325 608 295.227 608 258.5H606ZM541.5 323V321C506.982 321 479 293.018 479 258.5H477H475C475 295.227 504.773 325 541.5 325V323ZM477 258.5H479C479 223.982 506.982 196 541.5 196V194V192C504.773 192 475 221.773 475 258.5H477ZM520.562 268.194V270.194H563.183V268.194V266.194H520.562V268.194ZM563.183 268.194L564.915 267.194L543.605 230.283L541.873 231.283L540.141 232.283L561.451 269.194L563.183 268.194ZM541.873 231.283L540.141 230.283L518.83 267.194L520.562 268.194L522.295 269.194L543.605 232.283L541.873 231.283Z"
            fill="black"
          />
        </g>

        {/* Right base */}
        <path
          d="M641 304C641 308.99 638.388 313.932 633.312 318.542C628.236 323.153 620.797 327.342 611.418 330.87C602.039 334.399 590.905 337.198 578.651 339.108C566.397 341.017 553.264 342 540 342C526.736 342 513.603 341.017 501.349 339.108C489.095 337.198 477.961 334.399 468.582 330.87C459.203 327.342 451.764 323.153 446.688 318.542C441.612 313.932 439 308.99 439 304L540 304H641Z"
          fill="black"
        />
      </g>
    </svg>
  );
}