# Reprise PartnerAds → Trackit — gifting

État constaté le 25 septembre 2026. Ce document décrit le code **local** de `trackit`, pas une fonctionnalité déjà déployée. Les fichiers gifting et les migrations sont encore non suivis par Git. Ne pas effacer les autres modifications locales du dépôt.

## Contexte produit

Le dépôt `Partnerads` contient `PROJET.md`, qui présente le gifting manuel comme la partie à porter dans Trackit. Trackit possède déjà la découverte de créateurs et des briques affiliation/RPM/paiements. Le gifting ajouté ici est volontairement manuel : campagne, mission, contrat figé, adresse, suivi saisi par la marque, dépôt de vidéo et validation. **Aucune commande Shopify, aucun code promo automatique, aucun paiement et aucune preuve de livraison transporteur** ne sont implémentés dans ce flux.

## Implémenté localement

- Écran marque/créateur : `src/app/dashboard/GiftingView.tsx`, branché dans le dashboard existant.
- Domaine et machine d’états : `src/lib/gifting.ts` ; tests : `src/lib/gifting.test.ts`.
- API : `src/app/api/gifting/route.ts` ; tests d’autorisation et d’upload : `route.test.ts` dans le même dossier.
- Schéma de base : `supabase/migrations/20260923_000040_gifting.sql`.
- Migration de sécurité et média : `supabase/migrations/20260925_000041_gifting_private_media.sql`.
- Un contrat conserve le brief, la date, la contrepartie affichée et l’autorisation ads avec durée et territoires explicites. La modification ultérieure de la campagne ne modifie pas la mission créée.
- La mission est assignée à un `creator_user_id` déjà relié à la marque via un `creator_links` actif. Un pseudo identique ne permet ni de lire le contrat/adresse, ni d’accepter la mission.
- Le créateur accepte, signe avec consentement et adresse, puis la marque renseigne transporteur et suivi. Le créateur ou la marque indique la réception.
- La vidéo est déposée dans un bucket **privé** via un jeton d’upload temporaire ; l’accès en lecture utilise un lien signé de 60 secondes. Formats MP4, MOV, WebM, limite 500 Mo.
- L’envoi navigateur utilise TUS par blocs de 6 Mo, avec relances automatiques et progression. La reprise après fermeture complète de l’onglet n’est pas encore assurée : le jeton d’upload n’est pas persisté.
- Les changements de mission et les métadonnées vidéo sont commités par une fonction SQL atomique avec `revision` pour refuser une transition concurrente. Les écritures directes aux tables gifting sont révoquées aux rôles navigateur ; l’API serveur vérifie l’identité et le workspace.
- Le bouton d’envoi décrit désormais correctement ce qui se passe : il crée une mission pour un créateur déjà connecté, il ne publie pas de lien public.

## Vérification locale

- `npx tsc --noEmit` : OK.
- `npm test` : 153 tests sur 153 passent, 31 fichiers. Un ancien test de seed vérifiait à tort la requête littérale `fitness` ; il a été corrigé pour vérifier le tag canonique.
- `npm run build` sans variables Supabase locales compile, puis échoue à la collecte des routes parce que deux routes préexistantes initialisent Supabase au chargement du module sans URL. **Le build de diagnostic passe** avec URL/clé factices limitées au processus local, jamais déployées.
- `vercel env ls` confirme la **présence des noms** Supabase et RapidAPI en Production et Preview sur le projet Vercel `partnerads` lié à ce dossier ; les valeurs chiffrées n’ont pas été lues. La présence ne garantit pas que les clés pointent vers le bon Supabase.
- Le projet Vercel `partnerads` est accessible dans la CLI et a déjà des déploiements Production. Son objet projet ne contient toutefois pas de liaison Git déclarée ; le remote GitHub du dossier Trackit est `rayandoublegit/trackit` et reste distinct. Ne pas supposer qu’un push GitHub déclenchera un déploiement Vercel.
- **Cible confirmée par l’utilisateur : l’ancien Supabase PartnerAds `tswkvyysmphbqqxtbmdz`**, et non `dquvwpcfhyeejeuwvtyu`. Le PAT déjà communiqué donne effectivement accès à ce projet ; `projects list` le montre actif. Ne jamais déployer les migrations de Trackit vers l’autre projet.
- Vérification en lecture seule de PartnerAds : la base possède déjà `gift_campaigns`, `gift_missions`, `gift_videos` et `creators_index`, mais son historique de migrations distant (`202609210001`…`202609210013`) diffère des migrations locales de Trackit. Les colonnes de `000040` sont déjà présentes, sans que cette migration soit enregistrée sous sa version locale. En revanche, `gift_missions.revision`, `gift_videos.storage_path`, la fonction `gift_commit_mission_action` et le bucket privé `gift-videos` de `000041` sont absents. La table `creator_links`, requise par la route gifting de Trackit pour identifier le créateur autorisé, est absente aussi ; `creators` est absente. `workspaces.id` et `workspace_members.workspace_id` sont de type `text` dans PartnerAds, alors que le schéma Trackit attend des UUID pour les espaces de travail. La base a son propre modèle `workspace_members`/`creators_index` et une intégration Shopify existante. **Il faut adapter le code Trackit ou faire une migration de compatibilité explicite avant de déployer ce flux.**
- La cible `dquvwpcfhyeejeuwvtyu` a été seulement inspectée en lecture seule lors d’une étape antérieure : c’est une autre application, sans tables Trackit nécessaires. Aucune migration n’y a été appliquée et aucune variable Vercel n’a été modifiée.
- Aucune migration n’a été appliquée à PartnerAds non plus : appliquer `000040` en l’état risquerait des conflits de politiques et d’historique, tandis qu’appliquer seulement `000041` retirerait les droits directs sur les tables gifting sans que l’API déployée soit compatible. Le déploiement a été retenu pour éviter de casser le SaaS déjà en ligne.
- **Aucun test d’intégration sur une vraie base Supabase ni test navigateur complet du gifting n’a été exécuté.** Les tests API utilisent des mocks.

## Pour rendre la version en ligne réellement utilisable

1. Revoir les changements locaux du dépôt avant commit : plusieurs fichiers préexistants étaient déjà modifiés, et les nouveaux fichiers gifting étaient non suivis. Ne pas faire de `git reset` ou de nettoyage.
2. Conserver `tswkvyysmphbqqxtbmdz` comme cible. Faire une sauvegarde, comparer les schémas et les politiques existantes, puis écrire des migrations **nouvelles et compatibles avec l’historique PartnerAds**. Adapter l’identité créateur du code à `workspace_members`/au vrai modèle d’invitation PartnerAds, ou créer une liaison d’identité sûre. La route gifting actuelle dépend de `creator_links`, de `gift_commit_mission_action`, de `revision` et du bucket privé `gift-videos` : **ne pas déployer ce code tel quel**.
3. Vérifier les variables dans l’environnement Vercel de **Trackit** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Vérifier leur présence sans jamais afficher ni copier leurs valeurs dans les logs, Git ou ce document. Les secrets envoyés autrefois dans le chat devraient être régénérés s’ils sont encore actifs.
4. Déployer Trackit après migration, puis faire un essai navigateur avec deux comptes réels (marque abonnée et créateur approuvé) : campagne → mission → contrat/signature → adresse → suivi → réception → upload 100 Mo → ouverture/validation ; vérifier refus d’un autre créateur et d’un autre workspace.
5. Vérifier les limites et coûts Supabase Storage (vidéos jusqu’à 500 Mo), l’expiration des URLs signées, l’accessibilité mobile et les erreurs de réseau. Ajouter un traitement du fichier orphelin si l’upload réussit mais que la soumission échoue. Tester le parcours TUS avec un vrai fichier de taille importante et une interruption réseau ; les tests unitaires ne couvrent pas le service Storage réel.

## Reste à construire avant un SaaS « fini »

- **Shopify** : vraie app publique/OAuth multi-boutiques, scopes minimaux, webhooks, produits/variantes, commande gifting ou remise à 100 %, adresse fournie par le créateur, gestion stock/expédition et annulation. Aucun domaine `*.myshopify.com` n’est à saisir en dur : chaque marchand connectera sa boutique. Le flux actuel est manuel, pas une intégration Shopify.
- **Vidéos multiples** : le schéma actuel impose une seule ligne `gift_videos` par mission alors que `video_count` peut monter à 20. Pour le MVP actuel, l’interface ne demande qu’une vidéo. Reconcevoir schéma, états, validation par fichier et téléchargement en lot avant de proposer plusieurs livrables.
- **Invitation autonome** : un créateur doit déjà être relié et approuvé pour recevoir une mission. Un lien de campagne public/privé avec rattachement d’identité, invitation, expiration et anti-usurpation n’existe pas.
- **Paiements/RPM/commissions pour le gifting** : le forfait du contrat est indicatif. Relier explicitement les missions aux systèmes financiers existants et définir les règles de calcul, validation, litige, facture et statut de paiement.
- **Suivi logistique réel** : le transporteur et son numéro sont des champs manuels. Connecteurs transporteurs/Shopify, webhooks et preuve de livraison restent à faire.
- **Contrats** : revue juridique des clauses de droits ads, territoires/durée, consentement, identité de signature, conservation, révocation, mineurs, RGPD ; journal d’audit/timestamp probant et signature électronique adaptée si nécessaire.
- **Exploitation** : migrations testées sur copie de prod, observabilité, alertes, limites d’API/RapidAPI, quotas d’upload, sauvegarde/rétention, suppression des données et export.
- **Dépendances** : Next.js a été relevé de `16.2.6` à `16.3.6`, ce qui supprime l’alerte critique Next de l’audit. `npm audit --omit=dev` signale encore 2 alertes (1 modérée sur `baseline-browser-mapping`, 1 haute sur `xlsx`). Le nouveau paquet `tus-js-client` n’est pas nommé dans ce rapport ; investiguer les alertes restantes avant mise en production, sans mise à jour forcée aveugle.
- **Assistant IA** : l’interface chat préexistante de Trackit n’est pas un agent capable d’exécuter toutes les actions gifting/Shopify de manière sûre ; prévoir outils/actions typés, confirmation des mutations sensibles, permissions et journal d’audit.

## Règles de prudence

Le service role Supabase doit rester exclusivement côté serveur. Une clé publique Supabase n’est pas un secret, mais elle ne donne pas le droit d’ignorer les contrôles RLS. Ne pas appeler le produit « prêt en production » tant que les migrations, variables et le parcours à deux comptes n’ont pas été validés sur l’environnement ciblé.
