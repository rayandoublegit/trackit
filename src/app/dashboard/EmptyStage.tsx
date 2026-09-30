"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/useLang";

export type EmptyScene = "campaign" | "pay" | "analytics";

type Step = { title: string; body: string };

const SCENES_FR: Record<EmptyScene, { nodes: [string, string][] }> = {
  campaign: {
    nodes: [
      ["01", "Brief"],
      ["02", "Créateurs"],
      ["03", "Ventes"],
      ["04", "Paiement"],
    ],
  },
  pay: {
    nodes: [
      ["01", "Vente"],
      ["02", "Partage"],
      ["03", "Dû"],
      ["04", "Payé"],
    ],
  },
  analytics: {
    nodes: [
      ["01", "Suivre"],
      ["02", "Comparer"],
      ["03", "Repérer"],
      ["04", "Agir"],
    ],
  },
};

const SCENES: Record<EmptyScene, { nodes: [string, string][] }> = {
  campaign: {
    nodes: [
      ["01", "Brief"],
      ["02", "Creators"],
      ["03", "Sales"],
      ["04", "Pay"],
    ],
  },
  pay: {
    nodes: [
      ["01", "Sale"],
      ["02", "Split"],
      ["03", "Owed"],
      ["04", "Paid"],
    ],
  },
  analytics: {
    nodes: [
      ["01", "Track"],
      ["02", "Compare"],
      ["03", "Spot"],
      ["04", "Act"],
    ],
  },
};

function Scene({ scene }: { scene: EmptyScene }) {
  const lang = useLang();
  const fr = lang === "fr";
  const nodes = (fr ? SCENES_FR : SCENES)[scene].nodes;
  return (
    <div className={`es-scene es-scene--${scene}`} aria-hidden>
      <div className="es-scene__glow" />
      <ol className="es-rail">
        <span className="es-rail__track">
          <span className="es-rail__fill" />
        </span>
        {nodes.map(([index, label], i) => (
          <li key={label} style={{ animationDelay: `${i * 1.15}s` }}>
            <span className="es-rail__index">{index}</span>
            <span className="es-rail__label">{label}</span>
          </li>
        ))}
      </ol>

      {scene === "campaign" ? (
        <div className="es-card es-card--campaign">
          <div className="es-card__top">
            <span>{fr ? "Collection été" : "Summer drop"}</span>
            <em>12%</em>
          </div>
          <div className="es-avatars">
            <span /><span /><span /><span>+4</span>
          </div>
          <div className="es-meter"><span /></div>
          <div className="es-card__row">
            <span>Commission</span>
            <strong>{fr ? "1 240 €" : "$1,240"}</strong>
          </div>
        </div>
      ) : null}

      {scene === "pay" ? (
        <div className="es-pay">
          <div className="es-pay__sale">
            <span>{fr ? "Commande" : "Order"}</span>
            <strong>{fr ? "86,00 €" : "$86.00"}</strong>
          </div>
          <div className="es-pay__split">
            <span>{fr ? "Créateur" : "Creator"} <b>{fr ? "12,90 €" : "$12.90"}</b></span>
            <span>{fr ? "Vous" : "You"} <b>{fr ? "73,10 €" : "$73.10"}</b></span>
          </div>
          <div className="es-pay__sent">{fr ? "Payé · à l’instant" : "Paid · just now"}</div>
        </div>
      ) : null}

      {scene === "analytics" ? (
        <div className="es-bars" aria-hidden>
          {[42, 68, 36, 84, 55, 92, 48].map((height, i) => (
            <span key={height} style={{ ["--h" as string]: `${height}%`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyStage({
  kicker,
  title,
  lead,
  steps,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  scene,
  isMobile,
}: {
  kicker: string;
  title: ReactNode;
  lead: string;
  steps: Step[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  scene: EmptyScene;
  isMobile?: boolean;
}) {
  return (
    <div className={`es-page${isMobile ? " is-mobile" : ""}`}>
      <div className="es-copy">
        <p className="es-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="es-lead">{lead}</p>
        <ol className="es-steps">
          {steps.map((step, i) => (
            <li key={step.title} style={{ animationDelay: `${0.12 + i * 0.08}s` }}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="es-actions">
          <button type="button" className="es-primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button type="button" className="es-secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
      <Scene scene={scene} />
    </div>
  );
}
