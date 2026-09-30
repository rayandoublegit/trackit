import { SITE_EMAIL, SITE_LEGAL_NAME, SITE_URL } from "@/lib/site-seo";

/**
 * Company details shown in the legal notice (mentions légales).
 *
 * Fields left at `null` are unknown and are simply not rendered. Fill them in
 * (do not guess) and the legal notice becomes complete everywhere:
 * French law (LCEN art. 6-III) expects the registered address, the
 * registration number, the share capital, the VAT number where applicable,
 * and the name of the publication director.
 */
export type LegalEntity = {
  /** Company name, as registered. */
  name: string;
  /** Legal form, e.g. "Delaware C-Corporation" or "SAS". */
  legalForm: string | null;
  /** Share capital, e.g. "1 000 €" / "$1,000". */
  shareCapital: string | null;
  /** Full registered office address. */
  registeredAddress: string | null;
  /** Registry the company is recorded in, e.g. "RCS Paris" or "Delaware Division of Corporations". */
  registry: string | null;
  /** Registration number in that registry (SIREN / RCS number, state file number…). */
  registrationNumber: string | null;
  /** Intra-community VAT number, if any. */
  vatNumber: string | null;
  /** Full name of the publication director (directeur de la publication). */
  publicationDirector: string | null;
  /** Public phone number, optional. */
  phone: string | null;
  email: string;
  website: string;
};

export const LEGAL_ENTITY: LegalEntity = {
  name: SITE_LEGAL_NAME,
  legalForm: null,
  shareCapital: null,
  registeredAddress: null,
  registry: null,
  registrationNumber: null,
  vatNumber: null,
  publicationDirector: null,
  phone: null,
  email: SITE_EMAIL,
  website: SITE_URL,
};

/** Website host (hébergeur), as required by LCEN art. 6-III. */
export const LEGAL_HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, USA",
  website: "https://vercel.com",
} as const;

/** Fields the owner still has to fill (handy for an admin check). */
export function missingLegalEntityFields(entity: LegalEntity = LEGAL_ENTITY): (keyof LegalEntity)[] {
  const required: (keyof LegalEntity)[] = [
    "legalForm",
    "shareCapital",
    "registeredAddress",
    "registry",
    "registrationNumber",
    "vatNumber",
    "publicationDirector",
  ];
  return required.filter((key) => entity[key] == null || entity[key] === "");
}
