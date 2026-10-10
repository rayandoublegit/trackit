"use client";

// Settings > General: which mail app the "Contact" buttons open.
import { useEffect, useState } from "react";
import { MailClientChoices } from "./ContactCreatorSheet";
import { detectMailClient, readStoredMailClient, storeMailClient, type MailClient } from "@/lib/mail-client";
import { useLang } from "@/lib/useLang";

export function MailClientSetting({ email }: { email: string }) {
  const appLang = useLang();
  const lang = appLang === "fr" ? "fr" : "en";
  const fr = lang === "fr";
  const [value, setValue] = useState<MailClient | null>(null);

  useEffect(() => {
    setValue(readStoredMailClient() ?? detectMailClient(email));
  }, [email]);

  return (
    <section
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: 16,
        border: "1px solid var(--ws-border)",
        background: "var(--ws-surface)",
        color: "var(--ws-text)",
        maxWidth: 720,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {fr ? "Messagerie pour contacter les créateurs" : "Mail app for contacting creators"}
      </h3>
      <p style={{ margin: "4px 0 14px", fontSize: 13, color: "var(--ws-text-muted)", lineHeight: 1.5 }}>
        {fr
          ? "Le bouton Contacter ouvre cette messagerie avec l’e-mail prêt à envoyer. Choix enregistré sur cet appareil."
          : "The Contact button opens this mail app with the email ready to send. Saved on this device."}
      </p>
      <MailClientChoices
        lang={lang}
        value={value}
        onChange={(next) => {
          storeMailClient(next);
          setValue(next);
        }}
      />
    </section>
  );
}
