# Creator Workspace — fiche créateur, vidéos in-app, dossiers & pipeline — Design

- **Date** : 2026-06-22
- **Branche** : `feature/creator-workspace` (depuis `experiment/discovery-feed`)
- **Statut** : Validé (design)
- **But** : transformer la Discovery en vrai espace de travail créateurs — cliquer un influ ouvre une fiche riche (toute la data + vidéos jouables dans le logiciel), on sauvegarde, on range en dossiers nommables, et on suit un pipeline CRM (Sauvegardé → Contacté → En cours → En éducation → Signé).

---

## 1. Objectif & périmètre

Au clic sur une carte de la feed, ouvrir un **panneau de détail** qui charge *tout* sur le créateur (stats, niches, langue/pays, Renta, Authenticité + explication, perf des dernières vidéos, **vidéos lisibles in-app**, contact, note). Depuis cette fiche (et la feed) : **sauvegarder**, **classer dans des dossiers** nommés librement, et **placer dans un pipeline** d'outreach.

**Non-objectifs** : Instagram/YouTube (la data reste TikTok) ; messagerie d'envoi automatique (on logue les contacts, on n'envoie pas) ; refonte de la feed elle-même.

**Lecture vidéo (décidé)** : **embed officiel TikTok** (iframe `https://www.tiktok.com/embed/v2/{id}`). La vidéo se joue dans le panneau, aucune redirection. Pas de lecteur natif mp4 (URLs TikTok expirantes/géo-bloquées).

## 2. Architecture & composants

- **UI**
  - `src/app/dashboard/CreatorDetailDrawer.tsx` — panneau latéral (plein écran sur mobile). Reçoit le créateur de la liste + fetch `/api/creator/[username]` pour le détail complet (dont `top_videos`). Sections : en-tête, barre d'actions (Sauver/Dossier/Étape/Email), grille de stats, analyse (auth + graphe perf vidéos), galerie vidéos (clic → iframe embed inline), note.
  - `src/app/dashboard/MyCreatorsView.tsx` — nouvelle vue « Mes créateurs » : chips/sidebar de **dossiers** (créer/renommer/couleur/supprimer) + **board Kanban** du pipeline (drag & drop entre colonnes) + bascule vue liste. Clic sur un créateur → même drawer.
  - `src/app/dashboard/DiscoveryFeed.tsx` — brancher `onClick` de la carte (ouvre le drawer) et le bouton « Sauver ».
  - Entrée de navigation « Mes créateurs » dans le dashboard.
- **API** (toutes scoping par `getAuthedUser()` → `user.id`, comme `/api/creators`)
  - `GET /api/creator/[username]` — détail enrichi depuis `creators_index` (+ `top_videos`). Pas d'appel live à l'ouverture (coût crédits) ; la data vient du seed/cron.
  - `GET/POST/PATCH/DELETE /api/saved` — créateurs sauvegardés, `pipeline_status`, `notes`.
  - `GET/POST/PATCH/DELETE /api/folders` — dossiers ; et appartenance via `POST/DELETE /api/folders/items` (`folder_id`, `creator_username`).
- **Lib**
  - `src/lib/scrapecreators.ts` — ajouter `parseVideosRich(raw)` (id, cover animé, share_url, stats, légende, date) en plus de `parseVideos` (stats).
  - `src/lib/creator-video.ts` (nouveau, pur+testé) — `videoEmbedUrl(idOrShareUrl)`, `extractVideoId(shareUrl)`.
  - `src/lib/pipeline.ts` (nouveau, pur+testé) — constantes `PIPELINE_STAGES` ordonnées + libellés FR + couleurs ; helpers.
  - `src/lib/creator-enrichment.ts` — stocker `top_videos` dans la row d'enrichissement.

## 3. Modèle de données (Supabase, durable)

Une **seule migration** (à lancer par l'utilisateur, groupée avec celle du seed) :

```sql
-- créateurs sauvegardés (1 ligne par user+créateur) — porte l'étape pipeline + note
create table if not exists public.discovery_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creator_username text not null,
  platform text not null default 'tiktok',
  display_name text default '',
  avatar_url text default '',
  followers bigint default 0,
  engagement_rate numeric default 0,
  primary_niche text default '',
  country_code text,
  value_score integer,
  snapshot jsonb,                                   -- copie de la data au moment du save
  pipeline_status text not null default 'saved',    -- saved|contacted|in_progress|nurturing|signed|lost
  notes text default '',
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, creator_username)
);

create table if not exists public.discovery_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'gray',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.discovery_folder_items (
  folder_id uuid not null references public.discovery_folders(id) on delete cascade,
  creator_username text not null,
  added_at timestamptz not null default now(),
  primary key (folder_id, creator_username)
);

alter table public.creators_index add column if not exists top_videos jsonb;

create index if not exists discovery_saved_user_idx on public.discovery_saved (user_id, pipeline_status);
create index if not exists discovery_folders_user_idx on public.discovery_folders (user_id, position);
create index if not exists discovery_folder_items_creator_idx on public.discovery_folder_items (creator_username);

alter table public.discovery_saved enable row level security;
alter table public.discovery_folders enable row level security;
alter table public.discovery_folder_items enable row level security;
-- CREATE POLICY n'accepte pas IF NOT EXISTS -> drop puis create (idempotent)
drop policy if exists discovery_saved_owner on public.discovery_saved;
create policy discovery_saved_owner on public.discovery_saved using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists discovery_folders_owner on public.discovery_folders;
create policy discovery_folders_owner on public.discovery_folders using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists discovery_folder_items_owner on public.discovery_folder_items;
create policy discovery_folder_items_owner on public.discovery_folder_items using (exists (select 1 from public.discovery_folders f where f.id = folder_id and f.user_id = auth.uid())) with check (exists (select 1 from public.discovery_folders f where f.id = folder_id and f.user_id = auth.uid()));
```

> Persistance : API routes via service_role (comme `/api/outreach`) **avec scoping manuel `user_id`** ; RLS activée en défense additionnelle. Fichier migration : `supabase/migrations/20260622_000016_creator_workspace.sql`.

**`top_videos`** (jsonb) : `[{ id, cover, shareUrl, playCount, likeCount, commentCount, shareCount, createTime, desc }]` — ~6–9 vidéos non-pub. `cover` = `dynamic_cover` (WebP, proxifié `/api/img-proxy`).

## 4. Flux

1. **Clic carte** → drawer s'ouvre avec la data déjà en liste, puis `GET /api/creator/[username]` complète (top_videos, bio, etc.).
2. **Clic vignette vidéo** → la vignette est remplacée par `<iframe src="https://www.tiktok.com/embed/v2/{id}">` ; lecture inline, aucune navigation.
3. **Sauver** → `POST /api/saved` (upsert) ; ouvre le sélecteur de dossier (`POST /api/folders/items`).
4. **Changer l'étape** → `PATCH /api/saved` (`pipeline_status`). Sur le board, drag entre colonnes = même PATCH.
5. **Note** → `PATCH /api/saved` (`notes`).

## 5. Pipeline (étapes)

`PIPELINE_STAGES` ordonné : `saved` (Sauvegardé) · `contacted` (Contacté) · `in_progress` (En cours) · `nurturing` (En éducation) · `signed` (Signé) · `lost` (Perdu). Board Kanban = une colonne par étape (sauf `lost` repliable). Historique des messages relié à `outreach_history` existant (optionnel en phase 3).

## 6. Gating (plan-limits.ts)

- Ouvrir la fiche + aperçu stats = **gratuit**.
- **Analyse approfondie** (graphe perf, auth détaillée, vidéos in-app) = payant (`canUseAdvancedAnalytics`, pro+) → sinon flou + paywall (réutilise le pattern feed).
- **Sauvegardes** : gratuit jusqu'à `getMaxManagedCreators(free)=3` ; au-delà → paywall.
- **Dossiers + pipeline board** = payant (pro+).

## 7. Phases (chacune livrable)

- **Phase 1 — Fiche + vidéos in-app** : migration · `parseVideosRich` + `top_videos` (lib+enrichment+seed) · `creator-video.ts` · `CreatorDetailDrawer` + embed inline · `GET /api/creator/[username]` · brancher le clic de la feed.
- **Phase 2 — Sauvegardes + dossiers** : `/api/saved` + `/api/folders` (+items) · bouton Sauver + sélecteur dossier · `MyCreatorsView` (liste + dossiers) + nav.
- **Phase 3 — Pipeline** : `pipeline.ts` · board Kanban drag & drop · notes · intégration `outreach_history`.

## 8. Tests

- Unitaires (Vitest) : `parseVideosRich` (extraction id/cover/stats depuis un `aweme_list` d'exemple), `extractVideoId`/`videoEmbedUrl`, helpers `pipeline.ts`, mapping row→detail. 
- API/UI : tests légers + vérif live (drawer s'ouvre, vidéo se joue, save/folder/stage persistent), cohérent avec la profondeur de test du repo.

## 9. Open questions / hypothèses

1. `top_videos` rempli au fil du seed/cron ; les créateurs déjà en base sans `top_videos` montrent stats + vignettes existantes jusqu'à re-enrichissement (best-effort, non bloquant).
2. Embed TikTok : nécessite l'`id` numérique (depuis `aweme_id` ou `share_url`). Si absent → vignette non cliquable (fallback), non bloquant.
3. Limite « managed creators » (3/15/50) réutilisée pour les sauvegardes, ou compteur dédié — à confirmer en phase 2 (défaut : réutilise l'existant).
