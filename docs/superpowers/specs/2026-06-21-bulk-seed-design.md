# Bulk seed — ~1500 enriched creators in `creators_index` — Design

- **Date** : 2026-06-21
- **Branche** : `experiment/discovery-feed` (= `main`, déployé)
- **Statut** : Validé (design), prêt pour le plan
- **But** : peupler la prod en une fois pour que la recherche/feed servent depuis la DB (zéro appel API par requête).

---

## 1. Objectif
Un **seed massif en une fois** : ~1500 créateurs **TikTok** enrichis + classés, écrits dans `creators_index` (prod), couvrant **toutes les niches × tiers d'abonnés × pays × langues**. Ensuite `/api/discovery-feed` et `/api/discovery` servent **uniquement depuis la DB** (gratuit, instantané) ; le live ScrapeCreators ne reste qu'un filet pour une niche vide. Les crons quotidiens déjà déployés maintiennent la base fraîche ensuite.

Non-objectifs : Instagram/YouTube (vague 2) ; refonte UI ; pas de nouveau schéma (la migration `20260621_000015` suffit).

## 2. Couverture exhaustive
- **Niches** : toutes les requêtes de `buildSeedTargets()` (~17 parents + ~160 sous-niches de `niche-tree.ts`).
- **+ termes localisés** : un set de mots-clés FR/ES/DE/PT (ex. musculation, recettes, maquillage, finanzas…) pour garantir la diversité **langue + pays**.
- **Tiers d'abonnés** (nano→mega) : émergent des résultats de recherche (non filtrés par taille).
- Chaque créateur : **enrich** (vraies vues/engagement/activité/`authenticity_score`) + **classify Claude Haiku** (`primary_niche`, `niches[]`, `language`, `country_code`, `email`) → **tous les filtres** de la recherche ont de la vraie data.

## 3. Pipeline (réutilise le moteur existant)
Par requête niche : `searchTikTokUsersRaw` → top N (par followers, dédup) → `fetchTikTokProfileRaw` + `fetchTikTokVideosRaw` → `buildEnrichmentRow` (vrais metrics + qualité) → `classifyCreator` (best-effort) → **upsert** `creators_index` avec `enrichment_status='enriched'`, `enriched_at`, + colonnes classify.
- **Dédup** par `username` (Set en mémoire + upsert `onConflict: username`).
- **Reprise** : au démarrage, charge les usernames déjà `enriched` depuis la DB et les skip → relançable sans re-payer.
- **Concurrence bornée** (ex. 5) + petit délai entre lots.
- **Budget crédits** : s'arrête à ~`SEED_TARGET` (1500) ou à un plafond de crédits configurable.

## 4. Exécution
Script autonome `scripts/seed-creators-bulk.ts`, lancé **en local contre la prod** (pas de limite serverless, resumable, logs de progression toutes les N upserts).
- **Env requis** : `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (fournis), `SCRAPECREATORS_API_KEY` (Pro), `ANTHROPIC_API_KEY` (récupérée depuis Vercel).
- Lancé via `npx tsx scripts/seed-creators-bulk.ts` (résolution de l'alias `@/` via tsconfig, ou imports relatifs).
- Écrit via `@supabase/supabase-js` (service_role) — upsert par lots.

## 5. Prérequis
1. **Utilisateur** : lancer le SQL de migration `20260621_000015` (1 fois, SQL Editor) — ajoute les colonnes ; sans elles l'upsert échoue.
2. **Moi** : récupérer `ANTHROPIC_API_KEY` depuis Vercel (klayans-projects) pour la classification.

## 6. Résultat & vérification
- `creators_index` ≈ 1500 lignes `enriched`, réparties sur toutes les niches, avec langue/pays/email/tiers variés.
- Vérif : compter par `enrichment_status='enriched'`, par `primary_niche`, par `country_code`, par tier de followers ; tester `/api/discovery-feed` (sert depuis la DB, `count` > 0 sans appel live) et la recherche filtrée.
- Coût ≈ 3-5k crédits SC (sur 25k) + classification Haiku négligeable ; ~30-45 min.

## 7. Open questions / hypothèses
1. Liste exacte des **termes localisés** (à figer dans le script : ~20-30 mots-clés FR/ES/DE/PT sur les niches phares).
2. **N par niche** : ~6-10 enrichis/requête, plafonné à `SEED_TARGET` global.
3. Si la classification (Claude) échoue/indispo : on garde les metrics réels + niche = la niche de recherche ; langue/pays restent nuls (filtres partiels) — best-effort, non bloquant.
