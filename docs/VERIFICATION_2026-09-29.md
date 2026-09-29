# Vérification du 29 septembre 2026

## Ce qui a été testé, et comment

| Test | Résultat | Commande / méthode |
| --- | --- | --- |
| Tests unitaires et API (mocks) | 184 / 184 | `npm test` |
| Toutes les migrations sur un Postgres vierge | 50 / 50 appliquées | `npm run test:db` (PGlite, Postgres 18 en processus) |
| Parcours gifting complet sur vraie base | 37 / 37 contrôles | `npm run test:db` |
| Script de mise en production sur base identique à la prod | appliqué, 7 tables créées | `npm run test:db` |
| Build de production | OK | `next build` |
| Écrans (dashboard, gifting, admin, connexion) | vérifiés au navigateur, clair / sombre / mobile | aperçu local |
| Site en ligne thentrack.it (accueil, tarifs, connexion) | chargent, aucune erreur du site | navigateur |
| Tables de la base de production | sondées en lecture seule (clé publique, `limit=0`) | navigateur |

Le parcours gifting couvre, dans l'ordre, ce que fait `/api/gifting` :

1. **Invitation**
   - Le créateur est retrouvé par `creators` et `creator_links` actif.
   - Un créateur qui n'a jamais rejoint la marque est refusé.
   - Une seule mission par créateur et par campagne.
2. **Parcours complet**
   - Étapes : accepter → signer (consentement et adresse) → expédier → recevoir → déposer → demander une modification → redéposer → valider.
   - Chaque étape interdite dans le désordre est refusée.
3. **Garanties**
   - Contrat figé : modifier la campagne après signature ne change pas le texte signé.
   - Concurrence : une révision périmée est refusée (409), la mission ne bouge pas.
   - `approvedAt` est fixé à la première validation. Une mission validée ou refusée est finale.
4. **Droits en base**, avec les droits par défaut de Supabase reproduits :
   - un créateur ou une marque connectés ne peuvent ni lire ni écrire les tables `gift_*` directement ;
   - seul le rôle serveur peut appeler `gift_commit_mission_action` ;
   - le bucket `gift-videos` est privé (500 Mo, MP4 / MOV / WebM) ;
   - `admin_audit_log` est fermé aux navigateurs.

## Ce que la vérification a trouvé

1. **Base de production thentrack.it (`tokpuhzjhysqxwjkxfya`) :** les tables `gift_*`, `user_sessions` et `admin_audit_log` n'existent pas. Conséquences :
   - le gifting affiche seulement l'exemple ;
   - les sessions et les « utilisateurs actifs » de l'admin sont vides ;
   - le journal d'audit n'est pas stocké.

   Toutes les colonnes dont ces fonctions dépendent existent déjà. Correctif prêt : `supabase/manual/2026-09-29_enable_gifting_audit_sessions.sql`, à coller une fois dans l'éditeur SQL du projet, après sauvegarde.
2. **La base ne pouvait pas être reconstruite depuis le dépôt :**
   - Deux migrations de 2026-03 nommaient leurs politiques avec des apostrophes (SQL invalide). C'est corrigé.
   - Cinq tables (`campaigns`, `creators`, `creators_index`, `scripts`, `shopify_stores`) et une dizaine de colonnes de `profiles` ont été créées à la main en production et ne sont dans aucune migration. Elles sont reproduites pour les tests dans `scripts/db-verify/`.
   - À faire : exporter le schéma de production (`supabase db dump --schema-only`) en migration de base, pour pouvoir monter un environnement de test ou de préproduction.
3. **Limites connues du gifting :**
   - le créateur doit avoir rejoint la marque avant de recevoir une mission ;
   - une seule vidéo par mission ;
   - suivi colis et commande Shopify saisis à la main ;
   - un envoi de vidéo interrompu ne reprend pas après fermeture de l'onglet.

## Non testable d'ici

- **Parcours avec de vrais comptes en production :** connexion, Stripe, Whop, Shopify OAuth, emails Resend, dépôt réel d'une vidéo sur Supabase Storage. Il faut un compte marque et un compte créateur de test.
- **Supabase local complet (Docker) :** Docker Desktop affiche une erreur au démarrage sur ce poste. Le test par PGlite couvre la base, pas l'authentification ni le stockage réels.

## Mise à jour du 29 septembre, après application en production

- **Script appliqué en production :** `supabase/manual/2026-09-29_enable_gifting_audit_sessions.sql`, sur le projet `tokpuhzjhysqxwjkxfya`. Vérifications :
  - les 7 tables, le bucket privé et la fonction sont créés ;
  - `anon` et `authenticated` sont refusés sur `gift_*` et `admin_audit_log` ;
  - les 213 comptes ne sont pas touchés.
- **Faille critique trouvée et corrigée :** `NEXT_PUBLIC_SUPABASE_ANON_KEY` contenait la clé `service_role`, publiée dans le code JavaScript du site. N'importe quel visiteur pouvait lire et écrire toute la base.
  - La variable Vercel (Production et Preview) contient maintenant la clé `anon`, et le site est redéployé.
  - Contrôle après correction : un visiteur obtient 0 profil, 0 vente, et 401 sur les tables gifting.
- **Nouvelle règle :** insertion seule sur `affiliate_applications` (migration `000043`), pour que le formulaire public /affiliation fonctionne avec la vraie clé publique.
- **Reste à faire :**
  - Renouveler la clé `service_role`, exposée publiquement pendant des mois.
  - Vérifier la même variable sur le projet Vercel `partnerads`.
  - Révoquer le PAT Supabase utilisé pour cette intervention.
