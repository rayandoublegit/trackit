# Base créateurs auto-nourrie, auto-évolutive & précise — Design

- **Date** : 2026-06-21
- **Branche** : `feature/discovery-precision`
- **Statut** : Validé (design), prêt pour le plan d'implémentation
- **Périmètre** : partie Recherche & Créateurs (`/api/discovery`, `/api/cron/*`, table `creators_index`)

---

## 1. Contexte & problème

TRACKIT propose une recherche de créateurs (UI `DiscoveryView`) avec filtres
Niche / Plateforme / Abonnés / Engagement / Localisation / Langue. La donnée vient
de **ScrapeCreators** (recherche TikTok) stockée dans la table Supabase
`creators_index`, alimentée par un cron quotidien (`/api/cron/seed-niches`, 03:00).

**Le squelette "auto-nourri + cron" existe déjà.** Ce qui manque :

1. **La précision.** Aujourd'hui plusieurs champs sont *inventés* :
   - `engagement_rate` = palier de followers (`estimateEngagement()`), pas mesuré.
   - `avg_views` = `followers × 0.1`.
   - `niches` = mot-clé de recherche (pas le contenu réel).
   - `language` / `location` / genre = devinés (regex bio, marché par défaut).
2. **L'auto-évolution.** Le cron *ajoute* des créateurs mais ne *rafraîchit*
   jamais les anciens → les metrics se périment, la base ne "vit" pas.

### Preuve mesurée (test live ScrapeCreators, 2026-06-21)

Créateur `@eresfitness` (6 726 894 abonnés), 10 dernières vidéos réelles :

| Métrique | Code actuel (estimé) | Réalité mesurée | Écart |
|---|---|---|---|
| Vues moyennes | 672 689 (`followers×0.1`) | **22 176** (médiane) | **~30× trop haut** |
| Engagement | 2,0 % (palier) | **4,65 %** /vue · **0,03 %** /abonné | faux |

Le code actuel le classerait **#1** (tri par followers) en promettant des chiffres
totalement faux. Ratio vues/abonnés = 0,33 % et engagement/abonné = 0,03 % :
signature d'un compte **gonflé / dormant**. → Sans score de qualité, les plus gros
comptes (souvent les plus gonflés) polluent le haut des résultats.

---

## 2. Objectifs & non-objectifs

### Objectifs
- Remplacer toute donnée estimée par de la **donnée mesurée** (engagement, vues,
  niche, langue, pays, activité).
- Détecter les **faux followers / comptes morts** via un `authenticity_score`.
- Cron quotidien qui **découvre** ET **ré-enrichit** (auto-nourri + auto-évolue),
  avec un **budget plafonné** (un seul réglage).
- **Les filtres doivent fonctionner sur la donnée réelle** — exigence centrale,
  testée (section 6).
- Pipeline **global, multi-plateforme par design**, rempli par vagues.

### Non-objectifs (pour cette branche)
- Démographie d'audience (âge/genre/pays des *followers*) → nécessiterait une API
  premium (Modash/HypeAuditor). **Hors scope** (non retenu).
- Bright Data (dispo, gardé en réserve pour élargir la découverte plus tard).
- Refonte visuelle de l'UI au-delà de l'ajout des nouveaux filtres.

---

## 3. Approche retenue

**Tout ScrapeCreators + Claude** (un seul fournisseur de data, déjà intégré).

- **ScrapeCreators** = découverte (search) + enrichissement (profil + vidéos).
- **Claude (Haiku, en batch)** = classification niche/langue/email/brand-safety.

Faisabilité confirmée : `/v3/tiktok/profile/videos` renvoie par vidéo
`play_count`, `digg_count`, `comment_count`, `share_count`, `collect_count`,
`create_time` et `is_ad` → tout le calcul de précision est possible.

---

## 4. Architecture — pipeline 4 étapes piloté par le cron

```
CRON QUOTIDIEN (03:00, budget N enrichissements/jour)
        │  auto-nourrit + auto-évolue
        ▼
[1] DÉCOUVRIR ──► [2] ENRICHIR ──► [3] CLASSER ──► [4] SCORER ──► creators_index ──► RECHERCHE (filtres réels)
  search niche     profil+vidéos     Claude:           qualité /        (data réelle,        ▲
  (candidats)      vrais metrics     niche, langue,    faux followers   fraîche)             │
                                     email                                                   └─ refresh des + anciens
```

1. **Découvrir** (large, ~1 crédit/niche/page) — `search/users` (TikTok),
   `search` channels (YouTube). Insère des candidats `enrichment_status='pending'`.
   Généralise `seed-niches` au multi-plateforme + pays.
2. **Enrichir** (précis, ~2 crédits/créateur) — `profile` + `profile/videos`
   (≈12 derniers posts **organiques**, hors `is_ad`). Calcule les vrais metrics.
3. **Classer** (Claude Haiku, batch, ~centimes) — bio + captions réelles →
   niche(s), langue, email, brand-safety.
4. **Scorer** — `authenticity_score` par anomalies → parque les comptes
   morts/gonflés (`quality_status`).

### Crons : découverte + budget/rotation (auto-évolution)
**Deux crons quotidiens** forment le pipeline (responsabilités séparées) :
- `seed-niches` (**découverte**, existant) : parcourt une **tranche tournante** de
  niches × pays × plateformes → insère des candidats `enrichment_status='pending'`
  (la couverture ↑ chaque jour).
- `enrich-creators` (**précision + auto-évolution**, nouveau) : dans un **budget
  fixe** `ENRICH_BUDGET_PER_RUN`, traite d'abord les `pending`, puis ré-enrichit
  les `enriched` **les plus anciens** (`enriched_at` le plus vieux → `stale`).

Toute la base se rafraîchit en cycle de ~`taille_base / budget` jours. Le budget
est l'unique réglage qui plafonne le coût quotidien.

---

## 5. Modèle de données — `creators_index`

> La table existe déjà en prod (créée hors migrations, hors repo). On **ajoute**
> des colonnes via une migration. ⚠️ **À confirmer** : le schéma live exact avant
> d'écrire la migration.

**Migration** : `supabase/migrations/20260621_000015_creators_index_precision.sql`
(suit la convention `YYYYMMDD_NNNNNN_description.sql`).

### Colonnes existantes (réutilisées, sémantique corrigée)
| Colonne | Type | Changement |
|---|---|---|
| `engagement_rate` | numeric | **devient l'engagement réel par vue (médiane)** — les filtres existants continuent de marcher, sur du vrai |
| `avg_views` | int8 | **devient la médiane réelle des `play_count`** |
| `niches` | text[] | **classées par IA** (au lieu du mot-clé de recherche) |
| `language` | text | **détectée** (code ISO, ex. `fr`) |
| `last_scraped_at` | timestamptz | inchangé (date du dernier scrape brut) |

### Colonnes ajoutées
| Colonne | Type | Sens |
|---|---|---|
| `avg_likes` | int8 | médiane `digg_count` |
| `avg_comments` | int8 | médiane `comment_count` |
| `avg_shares` | int8 | médiane `share_count` |
| `views_per_follower` | numeric | `avg_views / followers` — **signal anti-gonflage** |
| `engagement_by_follower` | numeric | engagement médian / followers (%) |
| `posts_analyzed` | int | nb de posts utilisés pour les metrics |
| `last_post_at` | timestamptz | date du post le plus récent → filtre "actif" |
| `post_frequency` | numeric | posts/semaine (cadence) |
| `authenticity_score` | int (0-100) | score qualité anti faux-followers |
| `quality_status` | text | `ok` \| `low_quality` \| `dead` \| `inflated` |
| `email` | text | extrait de la bio (outreach) |
| `primary_niche` | text | niche dominante (classée IA) |
| `country_code` | text(2) | pays réel (région des vidéos + IA) |
| `enriched_at` | timestamptz | date du dernier enrichissement → pilote la rotation |
| `enrichment_status` | text | `pending` \| `enriched` \| `stale` \| `failed` (défaut `pending`) |

Index recommandés : `platform`, `niches` (GIN), `engagement_rate`,
`followers`, `authenticity_score`, `last_post_at`, `enriched_at`.

---

## 6. Filtrage — EXIGENCE CENTRALE (testée)

Chaque filtre de l'UI mappe une **colonne réelle** et une sémantique SQL précise.
La recherche (`/api/discovery`) AND-combine les filtres actifs.

| Filtre UI | Colonne | Sémantique |
|---|---|---|
| Niche | `niches`, `primary_niche` | `niches @> ARRAY[niche]` (tags IA) |
| Plateforme | `platform` | `platform = $` |
| Abonnés (min/max) | `followers` | `followers BETWEEN $min AND $max` |
| Engagement (min) | `engagement_rate` | `engagement_rate >= $` (réel, par vue) |
| Localisation | `country_code` | `country_code = $` (réel) |
| Langue | `language` | `language = $` (réelle) |
| **Vues min** *(nouveau)* | `avg_views` | `avg_views >= $` |
| **Actif depuis** *(nouveau)* | `last_post_at` | `last_post_at >= now() - $jours` |
| **Qualité** *(nouveau)* | `authenticity_score` | `authenticity_score >= $seuil` |
| **A un email** *(nouveau)* | `email` | `email IS NOT NULL` |

### Règles de comportement
- **Garde-fou qualité par défaut** : la recherche exclut
  `authenticity_score < SEUIL_DEFAUT` (≈40) et `quality_status IN ('dead','inflated')`,
  sauf si l'utilisateur désactive le garde-fou. → @eresfitness ne ressort pas.
- **Tri par défaut** : `engagement_rate` (réel) puis `authenticity_score`,
  **jamais `followers` seul**. Les créateurs `curated` gardent leur priorité.
- On **supprime** `estimateEngagement()` et `followers × 0.1` de
  `/api/discovery` (plus aucune estimation servie).

### Critères d'acceptation (tests)
- Chaque filtre seul ne renvoie **que** des lignes qui le respectent.
- Filtres combinés = intersection (AND).
- Par défaut, aucun créateur `inflated`/`dead` ni `score < seuil` n'apparaît.
- Le tri ne met jamais un gros compte gonflé devant un petit compte sain.

---

## 7. Formules de précision (exactes)

Sur les ~12 derniers posts **organiques** (`is_ad == false`), **médiane** partout
(robuste aux virales) :

- `avg_views` = `median(play_count)`
- `avg_likes / avg_comments / avg_shares` = `median(digg/comment/share_count)`
- `engagement_rate` (par vue, %) =
  `median((digg+comment+share)/play_count) × 100`
- `engagement_by_follower` (%) =
  `mean(digg+comment+share) / followers × 100`
- `views_per_follower` = `avg_views / followers`
- `last_post_at` = `max(create_time)` ; `post_frequency` = `posts / span_jours × 7`

### `authenticity_score` (0-100, heuristique tunable)
Départ 100, pénalités cumulées :
- `views_per_follower < 0.005` **et** `followers > 100k` → −40 (reach gonflée)
- `engagement_rate (par vue) < 1%` → −25 (engagement faible/bots)
- `jours_depuis_last_post > 90` → −40 (`dead`) ; `> 30` → −15 (dormant)
- clamp [0, 100].
`quality_status` dérivé : `inflated` si reach gonflée, `dead` si > 90 j,
`low_quality` si score < seuil, sinon `ok`. (Seuils dans un module config.)

---

## 8. Périmètre & vagues (concilie "global partout" + "quelques milliers propres")

- **Vague 1** : TikTok + YouTube, ~15 niches × pays clés (US, FR, UK, DE, BR…) →
  **~2-5k créateurs entièrement enrichis et propres**. Valider les filtres.
- **Vague 2** : Instagram (découverte hashtags → auteurs), élargir pays/niches,
  monter le budget cron.

Le pipeline est multi-plateforme dès le design ; on remplit par vagues pour
garder la qualité.

---

## 9. Coût / crédits

- Découverte ≈ 1 crédit / niche / page. Enrichissement ≈ 2 crédits / créateur.
- 3 000 créateurs ≈ **6 000-9 000 crédits** one-time, + refresh quotidien.
- Le plan gratuit (100 crédits) ne couvre que les tests. Le budget cron
  (`ENRICH_BUDGET_PER_RUN`) se cale sur le **volume de crédits mensuel**.
- Classification Claude Haiku en batch = négligeable.
- ⚠️ **Open question** : volume de crédits ScrapeCreators mensuel cible
  (détermine la vitesse de remplissage et le budget cron).

---

## 10. Changements de code

| Fichier | Action |
|---|---|
| `supabase/migrations/20260621_000015_creators_index_precision.sql` | **nouveau** : colonnes + index |
| `src/lib/creator-enrichment.ts` | **nouveau** : fetch profil+vidéos, calcul metrics, `authenticity_score` (fonctions pures testables) |
| `src/lib/creator-classify.ts` | **nouveau** : classification Claude (niche/langue/email/safety), batch + parsing testable |
| `src/lib/niche-tree.ts` | + plateformes & pays cibles, helper de tranche tournante |
| `src/app/api/cron/seed-niches/route.ts` | → étape Découverte (multi-plateforme) |
| `src/app/api/cron/enrich-creators/route.ts` | **nouveau** : enrichissement + rotation refresh (budget) |
| `src/app/api/discovery/route.ts` | retire les estimations, filtre sur colonnes réelles + garde-fou qualité + tri |
| `src/app/dashboard/DiscoveryView.tsx` | nouveaux filtres (Vues min, Actif, Qualité, Email) |
| `vercel.json` | ajoute le cron `enrich-creators` |
| `.env.local` | `SCRAPECREATORS_API_KEY` (gitignoré, **jamais commité**) |

---

## 11. Stratégie de test (TDD)

Tests d'abord sur les **fonctions pures** (sans réseau, données mockées) :
- calcul des metrics (médianes, exclusion `is_ad`, cas 0 vidéo/0 vue) ;
- `authenticity_score` (cas sain, gonflé `@eresfitness`-like, mort, dormant) ;
- parsing de la sortie de classification Claude ;
- **construction de la requête de filtrage** (chaque filtre → bonne clause ;
  garde-fou qualité actif par défaut ; tri correct).
- Smoke d'intégration sur un petit échantillon réel (budget crédits limité) pour
  valider le pipeline bout-en-bout avant de scaler.

---

## 12. Sécurité
- `SCRAPECREATORS_API_KEY` et `CRON_SECRET` en variables d'environnement
  (`.env.local` gitignoré ; Vercel env en prod). Jamais dans le code ni Git.
- Les crons restent protégés par `Authorization: Bearer ${CRON_SECRET}`.
- La clé partagée dans le chat devrait être **régénérée** côté ScrapeCreators.

---

## 13. Open questions / hypothèses
1. **Volume de crédits ScrapeCreators mensuel** (→ budget cron & vitesse). *En attente.*
2. **Schéma live exact de `creators_index`** à confirmer avant la migration.
3. **Définition d'engagement par défaut affichée** : par vue (retenu) vs par
   abonné — on stocke les deux, on affiche "par vue".
4. **Découverte Instagram** (pas de search user par mot-clé) : via hashtags →
   auteurs (vague 2, à prototyper).
