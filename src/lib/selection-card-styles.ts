import type { CSSProperties } from "react";

export const TRACKIT_SELECTION_BLUE = "#0047FF";

type SelectionCardOptions = {
  unselectedBorder?: string;
  unselectedBackground?: string;
};

export function selectionCardStyle(
  selected: boolean,
  options: SelectionCardOptions = {}
): Pick<CSSProperties, "border" | "background"> {
  const unselectedBorder = options.unselectedBorder ?? "1px solid #E5E7EB";
  const unselectedBackground = options.unselectedBackground ?? "#FAFAFA";
  return {
    border: selected ? `1px solid ${TRACKIT_SELECTION_BLUE}` : unselectedBorder,
    background: selected ? TRACKIT_SELECTION_BLUE : unselectedBackground,
  };
}

export function selectionTextPrimary(selected: boolean): string {
  return selected ? "#FFFFFF" : "#1A1A1A";
}

export function selectionTextSecondary(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.85)" : "#6B7280";
}

export function selectionTextMuted(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.75)" : "#9A9A9A";
}

export function selectionTextSubtle(selected: boolean): string {
  return selected ? "rgba(255,255,255,0.7)" : "#7A7A7A";
}

export function selectionAccentText(selected: boolean): string {
  return selected ? "#FFFFFF" : TRACKIT_SELECTION_BLUE;
}

export function selectionPillColors(selected: boolean): Pick<CSSProperties, "background" | "color" | "borderColor"> {
  return {
    background: selected ? TRACKIT_SELECTION_BLUE : "#FFFFFF",
    color: selected ? "#FFFFFF" : "#1A1A1A",
    borderColor: selected ? TRACKIT_SELECTION_BLUE : "#E5E5E5",
  };
}
