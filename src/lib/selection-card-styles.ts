import type { CSSProperties } from "react";

export const TRACKIT_SELECTION_BLUE = "var(--ws-accent, #0047FF)";

type SelectionCardOptions = {
  unselectedBorder?: string;
  unselectedBackground?: string;
};

export function selectionCardStyle(
  selected: boolean,
  options: SelectionCardOptions = {}
): Pick<CSSProperties, "border" | "background"> {
  const unselectedBorder = options.unselectedBorder ?? "1px solid var(--ws-border, #E5E7EB)";
  const unselectedBackground = options.unselectedBackground ?? "var(--ws-surface-2, #FAFAFA)";
  return {
    border: selected ? `1px solid ${TRACKIT_SELECTION_BLUE}` : unselectedBorder,
    background: selected ? TRACKIT_SELECTION_BLUE : unselectedBackground,
  };
}

export function selectionTextPrimary(selected: boolean): string {
  return selected ? "#FFFFFF" : "var(--ws-text, #1A1A1A)";
}

export function selectionTextSecondary(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.85)" : "var(--ws-text-muted, #6B7280)";
}

export function selectionTextMuted(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.75)" : "var(--ws-text-dim, #9A9A9A)";
}

export function selectionTextSubtle(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.7)" : "var(--ws-text-muted, #7A7A7A)";
}

export function selectionAccentText(selected: boolean): string {
  return selected ? "#FFFFFF" : TRACKIT_SELECTION_BLUE;
}

export function selectionPillColors(selected: boolean): Pick<CSSProperties, "background" | "color" | "borderColor"> {
  return {
    background: selected ? TRACKIT_SELECTION_BLUE : "var(--ws-surface, #FFFFFF)",
    color: selected ? "#FFFFFF" : "var(--ws-text, #1A1A1A)",
    borderColor: selected ? TRACKIT_SELECTION_BLUE : "var(--ws-border, #E5E5E5)",
  };
}
