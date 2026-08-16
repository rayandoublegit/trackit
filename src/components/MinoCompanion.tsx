"use client";

import { useId } from "react";
import "./mino-companion.css";

const MINO_BODY =
  "M32.00 6.20L33.00 6.42L33.96 7.09L34.82 8.14L35.56 9.53L36.14 11.17L36.57 12.94L36.86 14.75L37.05 16.46L37.19 17.93L37.43 18.88L38.28 18.38L39.42 17.44L40.76 16.36L42.24 15.29L43.80 14.34L45.37 13.60L46.87 13.13L48.23 13.00L49.37 13.21L50.24 13.76L50.79 14.63L51.00 15.77L50.87 17.13L50.40 18.63L49.66 20.20L48.71 21.76L47.64 23.24L46.56 24.58L45.62 25.72L45.12 26.57L46.07 26.81L47.54 26.95L49.25 27.14L51.06 27.43L52.83 27.86L54.47 28.44L55.86 29.18L56.91 30.04L57.58 31.00L57.80 32.00L57.58 33.00L56.91 33.96L55.86 34.82L54.47 35.56L52.83 36.14L51.06 36.57L49.25 36.86L47.54 37.05L46.07 37.19L45.12 37.43L45.62 38.28L46.56 39.42L47.64 40.76L48.71 42.24L49.66 43.80L50.40 45.37L50.87 46.87L51.00 48.23L50.79 49.37L50.24 50.24L49.37 50.79L48.23 51.00L46.87 50.87L45.37 50.40L43.80 49.66L42.24 48.71L40.76 47.64L39.42 46.56L38.28 45.62L37.43 45.12L37.19 46.07L37.05 47.54L36.86 49.25L36.57 51.06L36.14 52.83L35.56 54.47L34.82 55.86L33.96 56.91L33.00 57.58L32.00 57.80L31.00 57.58L30.04 56.91L29.18 55.86L28.44 54.47L27.86 52.83L27.43 51.06L27.14 49.25L26.95 47.54L26.81 46.07L26.57 45.12L25.72 45.62L24.58 46.56L23.24 47.64L21.76 48.71L20.20 49.66L18.63 50.40L17.13 50.87L15.77 51.00L14.63 50.79L13.76 50.24L13.21 49.37L13.00 48.23L13.13 46.87L13.60 45.37L14.34 43.80L15.29 42.24L16.36 40.76L17.44 39.42L18.38 38.28L18.88 37.43L17.93 37.19L16.46 37.05L14.75 36.86L12.94 36.57L11.17 36.14L9.53 35.56L8.14 34.82L7.09 33.96L6.42 33.00L6.20 32.00L6.42 31.00L7.09 30.04L8.14 29.18L9.53 28.44L11.17 27.86L12.94 27.43L14.75 27.14L16.46 26.95L17.93 26.81L18.88 26.57L18.38 25.72L17.44 24.58L16.36 23.24L15.29 21.76L14.34 20.20L13.60 18.63L13.13 17.13L13.00 15.77L13.21 14.63L13.76 13.76L14.63 13.21L15.77 13.00L17.13 13.13L18.63 13.60L20.20 14.34L21.76 15.29L23.24 16.36L24.58 17.44L25.72 18.38L26.57 18.88L26.81 17.93L26.95 16.46L27.14 14.75L27.43 12.94L27.86 11.17L28.44 9.53L29.18 8.14L30.04 7.09L31.00 6.42Z";

export function MinoCompanion({
  size = 32,
  motion = "full",
}: {
  size?: number;
  motion?: "full" | "soft";
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `mino-grad-${uid}`;
  const sheenId = `mino-sheen-${uid}`;
  const compact = size <= 20;

  return (
    <svg
      className={`mino-companion${compact ? " mino-companion--sm" : ""}${motion === "soft" ? " mino-companion--soft" : ""}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="8"
          y1="10"
          x2="56"
          y2="54"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#D6E4FF" />
          <stop offset="38%" stopColor="#6B93FF" />
          <stop offset="72%" stopColor="#0047FF" />
          <stop offset="100%" stopColor="#0034C7" />
        </linearGradient>
        <radialGradient id={sheenId} cx="28%" cy="28%" r="62%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="mino-companion__wander">
        <g className="mino-companion__spin">
          <path d={MINO_BODY} fill={`url(#${gradId})`} />
          <path d={MINO_BODY} fill={`url(#${sheenId})`} />
          <g className="mino-companion__face">
            <g className="mino-companion__look">
              <rect
                className="mino-companion__eye"
                x="26.15"
                y="26.4"
                width="3.35"
                height="7.4"
                rx="1.67"
                fill="#1C140E"
              />
              <rect
                className="mino-companion__eye"
                x="34.5"
                y="26.4"
                width="3.35"
                height="7.4"
                rx="1.67"
                fill="#1C140E"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
