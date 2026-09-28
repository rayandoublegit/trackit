# Admin Trackit — plan

État au 28 septembre 2026. L'admin actuel tient en trois pages isolées : `/admin/console` (métriques Stripe et liste d'utilisateurs), `/admin/stats` (catalogue créateurs et demandes) et `/admin/add` (ajout manuel d'un créateur). Il n'y a ni navigation commune, ni vue de l'activité réelle des marques, ni santé du système, ni trace des actions staff.

Objectif : une console unique `/admin`, avec une barre de navigation, qui répond en moins de dix secondes à « comment va le SaaS aujourd'hui ? » et qui permet d'agir sur un compte sans ouvrir Supabase, Stripe ou Whop.

## Principes

- **Accès :** chaque route API revérifie la session et le rôle (`requireAdmin`), avec la liste d'emails `ADMIN_EMAILS` ou le rôle `admin`/`staff`. La page seule ne donne aucun droit.
- **Lecture d'abord :** les écrans lisent la base avec la clé service, côté serveur uniquement. Une table absente ou une requête en erreur affiche « — » et un avertissement, jamais un zéro inventé.
- **Actions tracées :** chaque action staff qui modifie un compte (plan, rôle, annulation, cadeau) écrit une ligne dans un journal d'audit.
- **Pas de données fictives en production :** les jeux d'exemple ne servent qu'en local, avec `NEXT_PUBLIC_DEV_BYPASS_PLAN` et hors `NODE_ENV=production`.

## Sections

| Section | Question à laquelle elle répond | Sources |
| --- | --- | --- |
| **Vue d'ensemble** | Combien d'inscrits, d'actifs, de payants aujourd'hui ? Qu'est-ce qui demande mon attention ? | `profiles`, `user_sessions`, `campaigns`, `sales`, `creators_index`, `niche_requests`, `gift_missions` |
| **Utilisateurs** | Qui est ce compte, que fait-il, combien il paie, et comment je le corrige ? | `profiles`, auth users, `user_sessions`, `campaigns`, `creators`, `sales`, `outreach_history`, Stripe |
| **Revenus** | MRR, ARR, répartition par plan, croissance, impayés, sources d'acquisition, entonnoir | Stripe (`computeMetrics`, `computeGrowth`, `computeOps`), `profiles` |
| **Activité** | Les marques utilisent-elles vraiment le produit ? | `campaigns`, `sales`, `payouts`, `outreach_history`, `gift_missions`, `creator_content` |
| **Catalogue** | Combien de créateurs, par niche, plateforme et palier ? | `creators_index`, lien vers l'ajout manuel |
| **Demandes** | Qu'est-ce que les clients cherchent sans le trouver ? | `niche_requests`, `creator_lookup_requests`, `v2_waitlist` |
| **Système** | Tout est-il branché ? Quelles tables manquent ? Qu'a fait le staff ? | variables d'environnement (présence seulement), tables sondées, commit déployé, `admin_audit_log` |

## Détail par section

1. **Vue d'ensemble**
   - Compteurs animés : inscrits, nouveaux sur 7 jours, actifs sur 1, 7 et 30 jours, payants, MRR, campagnes actives, ventes et chiffre d'affaires suivis sur 30 jours, taille du catalogue.
   - Courbes des inscriptions et des ventes sur 30 jours.
   - « À traiter » : impayés, demandes de niche récentes, créateurs introuvables, tables manquantes.
2. **Utilisateurs**
   - Tableau filtrable (plan, rôle, marque ou créateur, payant ou offert) et triable.
   - Fiche latérale : identité, facturation (Stripe ou Whop), sessions récentes, usage (campagnes, créateurs, ventes, messages) et actions existantes (plan, cadeau d'un mois, révocation, rôle, annulation).
   - Chaque action est journalisée.
3. **Revenus**
   - Répartition par plan, croissance mensuelle sur 6 mois, ARPU, LTV, entonnoir inscription → onboarding → paiement.
   - Liste des factures impayées avec lien de paiement, et répartition des sources d'acquisition.
4. **Activité**
   - Campagnes par statut, ventes et chiffre d'affaires par jour, top marques par ventes.
   - Paiements créateurs par statut, messages de prospection, missions gifting par étape, contenus déposés.
5. **Catalogue**
   - Total, part vérifiée, niches, plateformes, paliers (nano < 10 000, micro 10 000–99 999, influenceur ≥ 100 000).
   - Accès à l'ajout manuel.
6. **Demandes**
   - Niches et créateurs demandés, regroupés et comptés, avec la dernière date. Inscriptions à la liste d'attente v2.
7. **Système**
   - Présence des clés (Supabase, Stripe et son mode, Whop, Resend, RapidAPI, ScrapeCreators, Anthropic) sans jamais afficher de valeur.
   - Sondage des tables attendues, commit et environnement déployés.
   - Journal d'audit des 100 dernières actions staff.

## Livraison

- **Lot 1 (ce commit) :**
  - Coquille `/admin` et les sept sections.
  - API `overview`, `activity`, `requests`, `system`, `audit`, et fiche utilisateur enrichie.
  - Graphiques SVG sans dépendance, redirections `/admin/console` → `/admin/users` et `/admin/stats` → `/admin/catalog`.
  - Migration du journal d'audit, écrite mais **non appliquée**.
- **Lot 2 :**
  - Appliquer `admin_audit_log` sur Supabase de production.
  - Exports CSV, recherche globale, alertes email sur impayés et pics d'erreurs.
  - Métriques Whop en direct quand l'API le permet.

## Hors périmètre volontaire

- Se connecter à la place d'un client (usurpation de session) : risque trop élevé sans journal et consentement.
- Suppression définitive de comptes depuis l'admin : reste manuelle, dans Supabase.
