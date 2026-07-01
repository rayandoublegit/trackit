import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  LANDING_LAYOUT,
  LANDING_STYLESHEETS,
  LANDING_CSS_SECTIONS,
  LANDING_CSS_SELECTORS,
  CHAOTIC_WORK_COMPONENT_CLASSES,
  CHAOTIC_WORK_ASSET,
} from "./landing-css-contract";

const ROOT = join(import.meta.dirname, "../..");

function readRepoFile(relPath: string): string {
  const abs = join(ROOT, relPath);
  expect(existsSync(abs), `missing file: ${relPath}`).toBe(true);
  return readFileSync(abs, "utf8");
}

describe("landing CSS guard", () => {
  it("layout.tsx imports every landing stylesheet", () => {
    const layout = readRepoFile(LANDING_LAYOUT);
    for (const sheet of LANDING_STYLESHEETS) {
      const importPath = `./${sheet.replace("src/app/", "")}`;
      expect(layout, `layout must import ${sheet}`).toContain(importPath);
    }
  });

  it("landing stylesheets exist and keep required section banners", () => {
    for (const sheet of LANDING_STYLESHEETS) {
      const css = readRepoFile(sheet);
      for (const section of LANDING_CSS_SECTIONS[sheet]) {
        expect(css, `${sheet} must contain section “${section}”`).toContain(section);
      }
    }
  });

  it("landing stylesheets keep critical selectors", () => {
    for (const sheet of LANDING_STYLESHEETS) {
      const css = readRepoFile(sheet);
      for (const selector of LANDING_CSS_SELECTORS[sheet]) {
        expect(css, `${sheet} must contain “${selector}”`).toContain(selector);
      }
    }
  });

  it("chaotic-work asset exists", () => {
    expect(existsSync(join(ROOT, CHAOTIC_WORK_ASSET))).toBe(true);
  });

  it("ChaoticWorkSection uses classes defined in chaotic-work.css", () => {
    const component = readRepoFile("src/components/ChaoticWorkSection.tsx");
    const css = readRepoFile("src/app/chaotic-work.css");
    for (const cls of CHAOTIC_WORK_COMPONENT_CLASSES) {
      expect(component, `ChaoticWorkSection must reference .${cls}`).toContain(cls);
      expect(css, `chaotic-work.css must style .${cls}`).toContain(`.${cls}`);
    }
  });

  it("landing.css points to chaotic-work.css instead of inlining removed block", () => {
    const landing = readRepoFile("src/app/landing.css");
    expect(landing).toContain("chaotic-work.css");
    expect(landing).not.toMatch(/^\.chaotic-work\s*\{/m);
  });
});
