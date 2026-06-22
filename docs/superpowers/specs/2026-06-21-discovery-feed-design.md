# Discovery Feed (freemium "rentabilité") — Design

- **Date** : 2026-06-21
- **Branche** : `experiment/discovery-feed` (expérimentation — **jamais pushée**)
- **Statut** : Validé (design), prêt pour le plan d'implémentation
- **Base** : construit sur le moteur live (`discovery-live`, `/api/img-proxy`, avatars+vidéos) committé en `95cdabf`.

---

## 1. Objectif

Refonte complète de l'écran Discovery en un **feed freemium "rentabilité"** :
- **Gratuit** : un feed des **meilleurs créateurs toutes niches**, trié par **rentabilité** (rapport qualité/prix pour une marque). ~9 créateurs nets, puis le reste **flouté** derrière un paywall **"Discover more"**.
- **Filtres affichés mais verrouillés** (cadenas) → cliquer ouvre le paywall.
- **Tout plan payant** (Growth/Pro/Scale) débloque : feed illimité + filtres.

Non-objectifs : ne touche pas le pipeline de précision / crons / schéma DB ; pas de vraie donnée de coût (estimations) ; l'ancien `DiscoveryView` reste dispo (non supprimé).

---

## 2. Score de Rentabilité (le cœur)

Fonctions **pures et testées** dans `src/lib/creator-value.ts`, calculées à la volée depuis les champs existants (`followers`, `engagementRate`, `avgViews`) — **aucune colonne DB ajoutée**.

### Coût estimé par post (USD, barème indicatif marché)
| Followers | Coût/post |
|---|---|
| < 10k | 50 |
| < 50k | 150 |
| < 250k | 500 |
| < 1M | 1 800 |
| < 5M | 5 000 |
| ≥ 5M | 12 000 |

### CPM estimé
`cpm = estimatedCostPerPost / max(avgViews / 1000, 0.1)` (USD pour 1000 vues réelles). Plus bas = meilleure affaire.

### Score de rentabilité (0-100)
```
cpmComponent        = clamp(100 - cpm * 2, 0, 100)        // cpm 0→100, 25→50, 50→0
engagementComponent = clamp(engagementRate * 8, 0, 100)   // ER 12.5%→100
valueScore          = round(0.6 * cpmComponent + 0.4 * engagementComponent)
```
**Tier** (affichage) : `nano | micro | mid | macro | mega` selon followers. **Badge "Top ROI"** si `valueScore >= 80`.

### Cas de référence (tests — exacts avec la formule ci-dessus)
- Micro engagé (45k ab, ER 8%, 40k vues) → coût 150 → cpm ≈ 3.8 → cpmComp ≈ 92, engComp 64 → **score ≈ 81** (top value).
- Mid (200k ab, ER 7%, 90k vues) → coût 500 → cpm ≈ 5.6 → cpmComp ≈ 89, engComp 56 → **score ≈ 76**.
- Gros sain (4M ab, ER 13%, 108k vues) → coût 5 000 → cpm ≈ 46 → cpmComp ≈ 7, engComp 100 → **score ≈ 44**.
- Gros gonflé (6.7M ab, ER 4.7%, 22k vues) → coût 12 000 → cpm ≈ 545 → cpmComp 0, engComp ≈ 38 → **score ≈ 15**.

→ Les micro/mid très engagés remontent ; les gros comptes chers/gonflés descendent. C'est le "mode rentabilité". (La maquette montrait des chiffres illustratifs, pas les valeurs exactes de la formule.)

---

## 3. Source du feed

`src/lib/discovery-feed.ts` → `buildFeed(opts)` renvoie une liste `FeedCreator[]` (= `DiscoveryCreatorResult` + `valueScore`, `estCostPerPost`, `estCpm`, `valueTier`), **dédupliquée** par username, **triée par `valueScore` desc**.

Le **pool de candidats** = les **top créateurs par niche** (notables, déjà filtrés par le moteur live qui prend les plus gros par niche, ou la DB) ; le tri rentabilité les **re-classe** → "les meilleurs, vus sous l'angle ROI" (concilie *les meilleurs* + *mode rentabilité*).

- **Prod (Supabase configuré)** : lit `creators_index` (enriched), calcule la valeur à la volée, trie. Pas de saisie de niche requise (mix toutes niches).
- **Local/test (pas de Supabase)** : agrège en **live** un set de ~6 niches populaires (`fitness, beauty, food, fashion, tech, finance`) via `discovery-live` (mise en cache par niche → crédits bornés), fusionne, calcule la valeur, trie. Cache mémoire de feed (TTL ~30 min) pour éviter de re-payer.

`GET /api/discovery-feed` → `{ creators: FeedCreator[], source }`. Accepte des paramètres de filtre optionnels (utilisés seulement par les plans payants ; ignorés/refusés sinon).

---

## 4. Gating (freemium)

Appliqué côté client dans `DiscoveryFeed.tsx`, à partir du `plan` (déjà fourni par `dashboard/page.tsx`).

| Plan | Feed | Filtres |
|---|---|---|
| `free` | ~9 nets, le reste **flouté** + carte **"Discover more"** | **verrouillés** (cadenas) → clic = `UpgradeModal` |
| payant (`growth`/`pro`/`scale`) | **tout** le feed, scroll normal | **actifs** |

- Constante `FREE_FEED_VISIBLE = 9`.
- Le serveur renvoie jusqu'à ~24 créateurs ; le client floute au-delà de l'index 9 pour les gratuits (le blur porte sur de vraies cartes → effet réaliste). Le bouton du paywall réutilise `handleUpgrade` / `UpgradeModal` existants.
- Barre de filtres : mêmes contrôles que l'idée initiale (Niche, Abonnés, Engagement, Pays, Langue) mais rendus **désactivés + cadenas** en gratuit ; tout clic → paywall. En payant, ils filtrent (re-requête `/api/discovery-feed` avec params, ou filtrage client sur la liste).

### Test des deux états en local
`DEV_BYPASS_PLAN` devient configurable via `NEXT_PUBLIC_DEV_BYPASS_PLAN` (défaut **`free`** pour voir le paywall ; mettre `pro` pour voir l'état débloqué). Switch = éditer `.env.local` + redémarrer.

---

## 5. Cartes du feed

`DiscoveryFeed.tsx` rend des cartes **autonomes** (n'hérite pas du `DiscoveryView` géant) réutilisant la data shape live :
- Avatar (proxifié), nom, niche/tier.
- **3 aperçus vidéo** (les `videoThumbnails` WebP qu'on a déjà, cliquables vers TikTok).
- **Badge Rentabilité /100** (vert), **Top ROI** si ≥ 80.
- Stats : abonnés · engagement réel · **CPM estimé** · coût/post estimé.

---

## 6. Architecture / fichiers

**Créés :**
- `src/lib/creator-value.ts` — pur, testé : `estimatedCostPerPost`, `estimatedCpm`, `valueScore`, `valueTier`, `FREE_FEED_VISIBLE`.
- `src/lib/creator-value.test.ts` — TDD (cas §2).
- `src/lib/discovery-feed.ts` — `buildFeed` (agrégation live multi-niches ou DB + valeur + tri + dédup + cache).
- `src/app/api/discovery-feed/route.ts` — sert le feed.
- `src/app/dashboard/DiscoveryFeed.tsx` — feed + blur/paywall + filtres verrouillés.

**Modifiés :**
- `src/app/dashboard/page.tsx` — la vue `discovery` rend `DiscoveryFeed` (passe `plan`, `onUpgrade*`). `DiscoveryView` conservé (import inchangé, juste plus rendu par défaut).
- `src/lib/dev-bypass.ts` — `DEV_BYPASS_PLAN` lu depuis `NEXT_PUBLIC_DEV_BYPASS_PLAN` (défaut `free`).

---

## 7. Tests
- `creator-value.ts` en **TDD** (coût par paliers, CPM, score sur les 3 cas de référence, clamps, vues=0).
- Vérification visuelle en local via le dev-server : état **free** (9 + blur + paywall, filtres cadenassés) et état **pro** (`NEXT_PUBLIC_DEV_BYPASS_PLAN=pro` → tout débloqué).

---

## 8. Open questions / hypothèses
1. Barème de coût = indicatif (tunable). À affiner avec de vraies fourchettes plus tard.
2. Filtrage en payant : re-requête serveur vs filtrage client de la liste — au choix à l'implémentation (commencer client, simple).
3. Persistance d'un `value_score` en DB (prod) = optimisation future ; pour l'instant calcul à la volée.
