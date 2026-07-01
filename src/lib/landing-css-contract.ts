/**
 * Landing page CSS contract — single source of truth for guard tests.
 * If you add a new landing stylesheet or section, update this file AND the test.
 */

export const LANDING_LAYOUT = "src/app/layout.tsx" as const;

/** Stylesheets that layout.tsx must import (order matters for cascade). */
export const LANDING_STYLESHEETS = [
  "src/app/landing.css",
  "src/app/chaotic-work.css",
  "src/app/hero-doodles.css",
] as const;

/** Section banners that must exist (prevents accidental bulk deletion). */
export const LANDING_CSS_SECTIONS: Record<(typeof LANDING_STYLESHEETS)[number], readonly string[]> = {
  "src/app/landing.css": [
    "/* ===== HERO ===== */",
    "/* ===== SECTION generic ===== */",
    "/* ===== TRACKIT SECTION ===== */",
    "/* ===== PROCESS ===== */",
    "/* ===== WHY TRACKIT ===== */",
    "/* ===== PRICING ===== */",
    "/* ===== FOOTER ===== */",
    "/* ===== MOBILE RESPONSIVE ===== */",
  ],
  "src/app/chaotic-work.css": [
    "/* ===== CHAOTIC WORK (features intro) ===== */",
  ],
  "src/app/hero-doodles.css": [
    "HERO DOODLES — FROZEN POSITIONS",
  ],
};

/** Critical selectors / rules — layout breaks visibly when these disappear. */
export const LANDING_CSS_SELECTORS: Record<(typeof LANDING_STYLESHEETS)[number], readonly string[]> = {
  "src/app/landing.css": [
    ".hero {",
    ".dashboard-wrap {",
    ".features-grid",
    ".process-grid",
    "#pricing",
    ".pricing-card",
  ],
  "src/app/chaotic-work.css": [
    ".chaotic-work {",
    ".chaotic-work__icons-layer",
    ".chaotic-work__content",
    ".chaotic-work__title",
    ".chaotic-work__icon--calendar",
    "aspect-ratio: 1024 / 713",
  ],
  "src/app/hero-doodles.css": [
    ".hero-doodle {",
  ],
};

/** Class names ChaoticWorkSection.tsx must keep in sync with chaotic-work.css */
export const CHAOTIC_WORK_COMPONENT_CLASSES = [
  "chaotic-work",
  "chaotic-work__lines-layer",
  "chaotic-work__icons-layer",
  "chaotic-work__content",
  "chaotic-work__title",
  "chaotic-work__title-line",
  "chaotic-work__title-emphasis",
  "chaotic-work__stats",
  "chaotic-work__icon",
  "chaotic-work__app",
  "chaotic-work__badge",
] as const;

export const CHAOTIC_WORK_ASSET = "public/chaotic-work-dots.svg";
