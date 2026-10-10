"use client";

import { useCallback, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { useLang } from "@/lib/useLang";
import {
  IMAGE_ACCEPT,
  imageErrorText,
  prepareImage,
  type MinoImageAttachment,
} from "@/lib/mino-attachments";
import { checkPublicUrl, findSiteUrl } from "@/lib/mino-url-safety";
import "./mino-analysis.css";

// Attachments in Mino's prompt box: a photo (picker, drag and drop, paste)
// and the brand's website (typed in the message or added with "Add your site").

export type MinoAttachmentsState = ReturnType<typeof useMinoAttachments>;

export function useMinoAttachments(prompt: string) {
  const fr = useLang() === "fr";
  const [image, setImage] = useState<MinoImageAttachment | null>(null);
  const [explicitSite, setExplicitSite] = useState<string | null>(null);
  const [ignoredSite, setIgnoredSite] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const detectedSite = useMemo(() => {
    const url = findSiteUrl(prompt);
    return url && url !== ignoredSite ? url : null;
  }, [prompt, ignoredSite]);
  const site = explicitSite ?? detectedSite;

  const addFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError("");
      setReading(true);
      const result = await prepareImage(file);
      setReading(false);
      if ("error" in result) {
        setError(imageErrorText(result.error, fr));
        return;
      }
      setImage(result);
    },
    [fr],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name));
      if (!file) return;
      e.preventDefault();
      void addFile(file);
    },
    [addFile],
  );

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void addFile(e.dataTransfer.files?.[0]);
    },
  };

  /** Sets the site from the "Add your site" field; false when the address is not a public website. */
  const addSite = (raw: string): boolean => {
    const value = raw.trim();
    if (!value) return false;
    const check = checkPublicUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!check.ok) {
      setError(
        check.reason === "social"
          ? fr
            ? "Ajoutez le site de votre marque, pas un profil TikTok ou Instagram."
            : "Add your brand’s website, not a TikTok or Instagram profile."
          : fr
            ? "Cette adresse n’est pas un site public valide."
            : "That address isn’t a valid public website.",
      );
      return false;
    }
    setError("");
    setExplicitSite(check.url.toString());
    return true;
  };

  const removeSite = () => {
    if (explicitSite) setExplicitSite(null);
    else if (detectedSite) setIgnoredSite(detectedSite);
  };

  const clear = () => {
    setImage(null);
    setExplicitSite(null);
    setIgnoredSite(null);
    setError("");
  };

  const restore = (value: { image?: MinoImageAttachment | null; site?: string | null }) => {
    if (value.image) setImage(value.image);
    if (value.site) setExplicitSite(value.site);
  };

  return {
    image,
    site,
    siteDetected: !explicitSite && Boolean(detectedSite),
    error,
    setError,
    reading,
    dragging,
    inputRef,
    addFile,
    onPaste,
    dropProps,
    addSite,
    removeSite,
    removeImage: () => setImage(null),
    clear,
    restore,
    hasAny: Boolean(image || site),
  };
}

function Svg({ children, size = 15 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const ImageIcon = ({ size = 15 }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="1.8" />
    <path d="M21 15l-4.5-4.5L6 21" />
  </Svg>
);

export const GlobeIcon = ({ size = 15 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Svg>
);

const CloseIcon = () => (
  <Svg size={12}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Photo and "Add your site" buttons for the prompt box bar. */
export function MinoAttachButtons({ att, disabled }: { att: MinoAttachmentsState; disabled?: boolean }) {
  const fr = useLang() === "fr";
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteText, setSiteText] = useState("");
  const submitSite = () => {
    if (att.addSite(siteText)) {
      setSiteText("");
      setSiteOpen(false);
    }
  };

  return (
    <div className="mino-attach">
      <input
        ref={att.inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void att.addFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="mino-attach__btn"
        disabled={disabled || att.reading}
        onClick={() => att.inputRef.current?.click()}
        title={fr ? "Ajouter une photo (produit, packaging, pub)" : "Add a photo (product, packaging, ad)"}
        aria-label={fr ? "Ajouter une photo" : "Add a photo"}
      >
        <ImageIcon />
        <span className="mino-attach__label">{fr ? "Photo" : "Photo"}</span>
      </button>
      <button
        type="button"
        className={`mino-attach__btn${siteOpen ? " is-on" : ""}`}
        disabled={disabled}
        onClick={() => setSiteOpen((v) => !v)}
        aria-expanded={siteOpen}
        title={fr ? "Ajouter le site de votre marque" : "Add your brand’s website"}
      >
        <GlobeIcon />
        <span className="mino-attach__label">{fr ? "Votre site" : "Your site"}</span>
      </button>
      {siteOpen ? (
        <div className="mino-attach__site" role="group" aria-label={fr ? "Votre site" : "Your site"}>
          <GlobeIcon size={14} />
          <input
            autoFocus
            value={siteText}
            onChange={(e) => setSiteText(e.target.value)}
            placeholder={fr ? "votremarque.fr" : "yourbrand.com"}
            aria-label={fr ? "Adresse de votre site" : "Your website address"}
            inputMode="url"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSiteOpen(false);
              if (e.key === "Enter") {
                // Inside the Home form: add the site, never send the prompt.
                e.preventDefault();
                e.stopPropagation();
                submitSite();
              }
            }}
          />
          <button type="button" disabled={!siteText.trim()} onClick={submitSite}>
            {fr ? "Ajouter" : "Add"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Chips for what is attached, with remove buttons, and any attachment error. */
export function MinoAttachChips({ att }: { att: MinoAttachmentsState }) {
  const fr = useLang() === "fr";
  if (!att.image && !att.site && !att.error && !att.reading) return null;
  return (
    <div className="mino-attach-chips">
      {att.reading ? <span className="mino-attach-chip is-loading">{fr ? "Lecture de la photo…" : "Reading the photo…"}</span> : null}
      {att.image ? (
        <span className="mino-attach-chip is-image">
          {att.image.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={att.image.previewUrl} alt="" />
          ) : (
            <span className="mino-attach-chip__icon">
              <ImageIcon size={14} />
            </span>
          )}
          <span className="mino-attach-chip__text">{att.image.name}</span>
          <button type="button" onClick={att.removeImage} aria-label={fr ? "Retirer la photo" : "Remove the photo"}>
            <CloseIcon />
          </button>
        </span>
      ) : null}
      {att.site ? (
        <span className="mino-attach-chip is-site">
          <span className="mino-attach-chip__icon">
            <GlobeIcon size={14} />
          </span>
          <span className="mino-attach-chip__text">
            {hostOf(att.site)}
            <small>{att.siteDetected ? (fr ? "site détecté, Mino va l’analyser" : "site detected, Mino will analyse it") : fr ? "Mino va l’analyser" : "Mino will analyse it"}</small>
          </span>
          <button type="button" onClick={att.removeSite} aria-label={fr ? "Ne pas analyser ce site" : "Don’t analyse this site"}>
            <CloseIcon />
          </button>
        </span>
      ) : null}
      {att.error ? (
        <span className="mino-attach-error" role="alert">
          {att.error}
        </span>
      ) : null}
    </div>
  );
}

/** Overlay shown while a file is dragged over the prompt box. */
export function MinoDropHint({ show }: { show: boolean }) {
  const fr = useLang() === "fr";
  if (!show) return null;
  return (
    <div className="mino-drop" aria-hidden>
      <ImageIcon size={20} />
      {fr ? "Déposez votre photo ici" : "Drop your photo here"}
    </div>
  );
}
