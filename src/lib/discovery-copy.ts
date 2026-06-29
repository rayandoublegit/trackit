import type { Lang } from "@/lib/useLang";

export function discoveryCopy(lang: Lang) {
  const fr = lang === "fr";
  return {
    findItTitle: "Find It",
    findItSubtitle: fr
      ? "Trouve les meilleurs créateurs pour ton produit."
      : "Find the best creators for your product.",
    yourProduct: fr ? "Votre produit ou marque" : "Your product or brand",
    productPlaceholder: fr ? "Ex. Trackit, compléments fitness…" : "e.g. Trackit, fitness supplements…",
    search: fr ? "Recherche" : "Search",
    searchPlaceholder: fr ? "@créateur ou email" : "@creator or email",
    emailAvailable: fr ? "Email disponible" : "Email available",
    hideSaved: fr ? "Masquer les profils sauvegardés" : "Hide saved profiles",
    required: fr ? "Requis" : "Required",
    all: fr ? "Tous" : "All",
    enabled: fr ? "Activé" : "On",
    disabled: fr ? "Désactivé" : "Off",
    demographics: fr ? "Démographie" : "Demographics",
    niche: fr ? "Niche" : "Niche",
    allNiches: fr ? "Toutes niches" : "All niches",
    location: fr ? "Localisation" : "Location",
    france: fr ? "France" : "France",
    unitedStates: fr ? "États-Unis" : "United States",
    age: fr ? "Âge" : "Age",
    language: fr ? "Langue" : "Language",
    allLanguages: fr ? "Toutes" : "All",
    french: fr ? "Français" : "French",
    english: fr ? "Anglais" : "English",
    spanish: fr ? "Espagnol" : "Spanish",
    german: fr ? "Allemand" : "German",
    portuguese: fr ? "Portugais" : "Portuguese",
    performance: fr ? "Performance" : "Performance",
    followersFrom: fr ? "Abonnés — de" : "Followers — from",
    followersTo: fr ? "Abonnés — à" : "Followers — to",
    engagementRate: fr ? "Taux d'engagement" : "Engagement rate",
    viewsFrom: fr ? "Vues — de" : "Views — from",
    viewsTo: fr ? "Vues — à" : "Views — to",
    followers: fr ? "Abonnés" : "Followers",
    engagement: fr ? "Engagement" : "Engagement",
    engagementShort: fr ? "Engage." : "Eng.",
    save: fr ? "Sauvegarder" : "Save",
    saved: fr ? "Sauvegardé" : "Saved",
    saveToList: fr ? "Sauvegarder dans une liste" : "Save to list",
    saveWithoutList: fr ? "Sauvegarder sans liste" : "Save without list",
    createList: fr ? "Créer" : "Create",
    listNamePlaceholder: fr ? "Nom de la liste…" : "List name…",
    noListsYet: fr ? "Aucune liste. Crée-en une ci-dessous." : "No lists yet. Create one below.",
    removeFromSaved: fr ? "Retirer des sauvegardés" : "Remove from saved",
    listsPaidOnly: fr ? "Les listes sont disponibles avec un plan payant." : "Lists are available on paid plans.",
    view: fr ? "Voir" : "View",
    verified: fr ? "Vérifié" : "Verified",
    unlockFeed: fr ? "Débloquer le feed complet" : "Unlock the full feed",
    unlockFeedSub: fr ? "Filtres avancés · scroll illimité" : "Advanced filters · unlimited scroll",
    later: fr ? "Plus tard" : "Not now",
    loading: fr ? "Chargement…" : "Loading…",
    creatorCount: (n: number) =>
      fr ? `${n} créateur${n !== 1 ? "s" : ""}` : `${n} creator${n !== 1 ? "s" : ""}`,
    error: fr ? "Erreur" : "Error",
    noCreators: fr ? "Aucun créateur pour ces filtres." : "No creators match these filters.",
    paywallTitle: fr ? "Des milliers de créateurs t'attendent" : "Thousands of creators await",
    paywallBody: fr
      ? "Accède à tout le feed, aux filtres avancés et au défilement illimité."
      : "Access the full feed, advanced filters, and unlimited scrolling.",
    filterPaywallTitle: fr ? "Le filtrage est payant" : "Filtering is a paid feature",
    filterPaywallBody: fr
      ? "Filtrer par niche, plateforme, abonnés, engagement, pays, langue et plus est réservé aux plans payants."
      : "Filtering by niche, platform, followers, engagement, country, language, and more is available on paid plans.",
    morePlatformsComing: fr ? "Plus de plateformes bientôt" : "More platforms coming soon",
    loadMore: fr ? "Charger plus" : "Load more",
    // Drawer
    back: fr ? "← Retour" : "← Back",
    contact: fr ? "✉ Contacter" : "✉ Contact",
    noEmail: fr ? "Pas d'email" : "No email",
    verifiedAccount: fr ? "Compte vérifié" : "Verified account",
    viewOn: (platform: string) => (fr ? `Voir sur ${platform} →` : `View on ${platform} →`),
    reachOut: fr ? "Contacter →" : "Reach out →",
    folders: fr ? "Listes" : "Lists",
    noFoldersYet: fr ? "Aucun dossier encore." : "No folders yet.",
    newFolder: fr ? "Nouveau dossier" : "New folder",
    pipelineStage: fr ? "Étape" : "Stage",
    pipelineStageAria: fr ? "Étape pipeline" : "Pipeline stage",
    overview: fr ? "Aperçu" : "Overview",
    avgViews: fr ? "Vues moy." : "Avg. views",
    avgViewsLong: fr ? "Vues moyennes" : "Avg. views",
    avgLikes: fr ? "Likes moyens" : "Avg. likes",
    avgComments: fr ? "Commentaires moy." : "Avg. comments",
    avgShares: fr ? "Partages moyens" : "Avg. shares",
    authenticity: fr ? "Authenticité" : "Authenticity",
    reachPerFollower: fr ? "Portée / abonnés" : "Reach / followers",
    postsAnalyzed: fr ? "Posts analysés" : "Posts analyzed",
    performanceSection: fr ? "Performance" : "Performance",
    lockedAnalysis: fr ? "Analyse réservée aux plans payants" : "Analysis available on paid plans",
    popularPosts: fr ? "Popular posts" : "Popular posts",
    noVideos: fr ? "Pas encore de vidéos pour ce créateur." : "No videos for this creator yet.",
    playVideo: fr ? "Lire la vidéo" : "Play video",
    views: fr ? "vues" : "views",
    aiAnalysis: fr ? "Analyse du contenu (IA)" : "Content analysis (AI)",
    analyzingVideos: fr ? "Analyse des vidéos en cours…" : "Analyzing videos…",
    analysisUnavailable: fr ? "Analyse indisponible pour ce créateur." : "Analysis unavailable for this creator.",
    style: fr ? "Style" : "Style",
    production: fr ? "Production" : "Production",
    brandFit: fr ? "Fit marque" : "Brand fit",
    brandSensitive: fr ? "Contenu potentiellement sensible pour une marque." : "Content may be sensitive for brand partnerships.",
    privateNote: fr ? "Note privée" : "Private note",
    notePlaceholder: fr ? "Tes notes sur ce créateur…" : "Your notes on this creator…",
    noteSaveFirst: fr ? "Sauvegarde le créateur pour ajouter une note." : "Save the creator to add a note.",
    activeToday: fr ? "actif aujourd'hui" : "active today",
    activeYesterday: fr ? "actif hier" : "active yesterday",
    activeDaysAgo: (d: number) => (fr ? `actif il y a ${d} j` : `active ${d}d ago`),
    activeMonthsAgo: (m: number) => (fr ? `actif il y a ${m} mois` : `active ${m}mo ago`),
    engagementInsightHigh: fr
      ? "Engagement élevé pour un compte de cette taille."
      : "High engagement for an account this size.",
    engagementInsightAbove: fr
      ? "Engagement au-dessus de la moyenne pour un compte de cette taille."
      : "Engagement above average for an account this size.",
    engagementInsightAverage: fr
      ? "Engagement dans la moyenne pour un compte de cette taille."
      : "Engagement around average for an account this size.",
    engagementInsightLow: fr
      ? "Engagement en dessous de la moyenne — à croiser avec la niche."
      : "Engagement below average — consider the niche.",
    // My Creators
    myCreators: fr ? "Mes créateurs" : "My creators",
    myCreatorsSubtitle: fr
      ? "Sauvegarde des créateurs, range-les en dossiers et suis ton pipeline d'outreach."
      : "Save creators, organize them in folders, and track your outreach pipeline.",
    paidOnly: fr ? "Réservé aux plans payants" : "Available on paid plans",
    paidOnlyBody: fr
      ? "Les dossiers et le pipeline CRM (contacté, en cours, signé…) sont inclus dans les plans payants."
      : "Folders and the CRM pipeline (contacted, in progress, signed…) are included in paid plans.",
    upgradePlan: fr ? "Passer à un plan payant" : "Upgrade plan",
    pipeline: fr ? "Pipeline" : "Pipeline",
    list: fr ? "Liste" : "List",
    allCount: (n: number) => (fr ? `Tous (${n})` : `All (${n})`),
    folderPlaceholder: fr ? "+ liste" : "+ list",
    deleteFolder: (name: string) => (fr ? `Supprimer ${name}` : `Delete ${name}`),
    emptySaved: fr
      ? "Aucun créateur sauvegardé. Va dans Recherche et clique « Sauvegarder » sur un créateur."
      : "No saved creators yet. Go to Discovery and click Save on a creator.",
    valueScore: fr ? "Renta" : "Value",
    followersAbbr: fr ? "ab." : "fol.",
    // Manage lists (Gérer)
    managePageTitle: fr ? "Gérer vos créateurs" : "Manage Creators",
    allCreatorsList: fr ? "Tous les créateurs" : "All creators list",
    listNameCol: fr ? "Nom de la liste" : "List name",
    noCreatorsCol: fr ? "Nb. créateurs" : "No. Creators",
    lastUpdateCol: fr ? "Dernière mise à jour" : "Last update",
    createdAtCol: fr ? "Créée le" : "Created at",
    createdByCol: fr ? "Créée par" : "Created by",
    newList: fr ? "Nouvelle liste" : "New list",
    channelCol: fr ? "Réseau" : "Channel",
    usernameCol: fr ? "Pseudo" : "Username",
    statusCol: fr ? "Statut" : "Status",
    emailCol: fr ? "E-mail" : "Email address",
    emptyLists: fr ? "Aucune liste pour le moment" : "No lists yet",
    emptyListCreators: fr ? "Aucun créateur dans cette liste" : "No creators in this list",
    backToLists: fr ? "Retour aux listes" : "Back to lists",
    filterBtn: fr ? "Filtrer" : "Filter",
    listSearchPlaceholder: fr ? "Rechercher…" : "Search...",
    creatorCol: (n: number) => (fr ? `Créateur (${n})` : `Creator (${n})`),
    allPlatforms: fr ? "Toutes les plateformes" : "All platforms",
    allStatuses: fr ? "Tous les statuts" : "All statuses",
    copy: fr ? "Copier" : "Copy",
    actions: fr ? "Actions" : "Actions",
    importBtn: fr ? "Importer" : "Import",
    importTitle: fr ? "Importer" : "Import",
    importDragTitle: fr ? "Glisser-déposer pour importer" : "Drag and drop to upload",
    importFileTypes: fr ? "Fichiers CSV ou XLSX" : "CSV or XLSX files",
    importChooseFile: fr ? "Choisir un fichier" : "Choose file",
    importHeading: fr ? "Importer vos créateurs" : "Import your creators",
    importBody: fr
      ? "Importez vos créateurs existants dans Trackit. Nous faisons correspondre vos données aux bons champs."
      : "Bring your existing creators into Trackit. We match your data to the right fields.",
    importReqTitle: fr
      ? "Pour commencer, incluez l'un de ces éléments dans votre fichier :"
      : "To get started, include one of these in your spreadsheet:",
    importReqProfile: fr ? "URL du profil" : "Profile URL",
    importReqHandle: fr ? "@pseudo" : "@handle",
    importReqEmail: fr ? "Adresse e-mail" : "Email address",
    importAdvancedTitle: fr ? "Vous suivez déjà plus d'infos ?" : "Already tracking more?",
    importAdvancedBody: fr
      ? "Ajoutez statuts, étiquettes, notes et tarifs. Nous ferons correspondre vos colonnes automatiquement."
      : "Include statuses, labels, notes, and rates. We'll match your columns automatically.",
    importSeeExamples: fr ? "Voir des exemples" : "See examples",
    importComingSoon: fr
      ? "Bientôt disponible — l'import CSV sera disponible dans une prochaine mise à jour."
      : "Coming soon — CSV import will be available in the next update.",
    importProcessing: fr ? "Import en cours…" : "Importing…",
    importSuccess: (n: number, list: boolean) =>
      fr
        ? `${n} créateur${n !== 1 ? "s" : ""} importé${n !== 1 ? "s" : ""}${list ? " dans la liste" : ""}.`
        : `${n} creator${n !== 1 ? "s" : ""} imported${list ? " into the list" : ""}.`,
    importPartial: (ok: number, skip: number) =>
      fr
        ? `${ok} importé${ok !== 1 ? "s" : ""}, ${skip} ignoré${skip !== 1 ? "s" : ""}.`
        : `${ok} imported, ${skip} skipped.`,
    importEmpty: fr
      ? "Aucun créateur reconnu dans ce fichier. Vérifiez les colonnes (pseudo, URL ou e-mail)."
      : "No creators recognized in this file. Check columns (handle, URL, or email).",
    importInvalidFile: fr ? "Format non supporté. Utilisez un fichier CSV ou XLSX." : "Unsupported format. Use a CSV or XLSX file.",
    importLimit: fr
      ? "Limite de créateurs atteinte. Passez à un plan supérieur pour en importer plus."
      : "Creator limit reached. Upgrade your plan to import more.",
    importError: fr ? "Erreur lors de l'import. Réessayez." : "Import failed. Please try again.",
    // List table columns
    colLastEmail: fr ? "Dernier e-mail" : "Last email",
    colConversation: fr ? "Conversation" : "Conversation",
    colCommission: fr ? "Commission" : "Commission",
    invalidCommission: fr ? "Entrez un pourcentage entre 0 et 100" : "Enter a percentage between 0 and 100",
    colPromoCode: fr ? "Code promo" : "Promo code",
    colLabel: fr ? "Label" : "Label",
    colDocuments: fr ? "Documents" : "Documents",
    colScripts: fr ? "Script" : "Script",
    uploadScript: fr ? "Ajouter" : "Add",
    scriptPanelBack: fr ? "Retour à la liste" : "Back to list",
    scriptPanelTitle: fr ? "Script créateur" : "Creator script",
    scriptPanelSubtitle: (name: string) =>
      fr ? `Brief et script pour ${name}` : `Brief and script for ${name}`,
    scriptDragTitle: fr ? "Importer un fichier" : "Upload a file",
    scriptFileTypes: fr ? "Image, PDF, DOC ou TXT" : "Image, PDF, DOC, or TXT",
    scriptChooseFile: fr ? "Choisir un fichier" : "Choose file",
    scriptTitleLabel: fr ? "Titre du script" : "Script title",
    scriptTitlePlaceholder: fr ? "Ex : Brief vidéo UGC" : "e.g. UGC video brief",
    scriptContentLabel: fr ? "Contenu du script" : "Script content",
    scriptContentPlaceholder: fr
      ? "Écrivez le script, le hook, les points clés…"
      : "Write the script, hook, key points…",
    scriptLinkLabel: fr ? "Lien externe (optionnel)" : "External link (optional)",
    scriptSave: fr ? "Enregistrer le script" : "Save script",
    scriptSaving: fr ? "Enregistrement…" : "Saving…",
    scriptSavedBtn: fr ? "Enregistré" : "Saved",
    scriptError: fr ? "Impossible d'enregistrer le script." : "Could not save script.",
    scriptExisting: fr ? "Scripts existants" : "Existing scripts",
    colNotes: fr ? "Notes" : "Notes",
    colBirthday: fr ? "Anniversaire" : "Birthday",
    colAddress: fr ? "Adresse" : "Address",
    colPhone: fr ? "Téléphone" : "Phone",
    colAvgViews: fr ? "Vues moy." : "Avg. views",
    colAvgLikes: fr ? "Likes moy." : "Avg. likes",
    colAvgComments: fr ? "Com. moy." : "Avg. comments",
    colAvgShares: fr ? "Partages moy." : "Avg. shares",
    colDelete: fr ? "Supprimer" : "Delete",
    addField: fr ? "Ajouter…" : "Add…",
    invalidEmail: fr ? "Adresse e-mail invalide (ex. nom@gmail.com)" : "Invalid email address (e.g. name@gmail.com)",
    sendEmail: fr ? "Envoyer un e-mail" : "Send an email",
    uploadDoc: fr ? "Ajouter" : "Add",
    noDocs: fr ? "—" : "—",
    importGoTrackit: "Go Trackit",
    importExamplesTitle: fr ? "Exemple de fichier" : "Example file",
    importExamplesSubtitle: fr
      ? "Voici à quoi peut ressembler votre feuille de calcul — une ligne par créateur."
      : "Here's what your spreadsheet can look like — one row per creator.",
    importExamplesRequired: fr ? "Colonnes minimales" : "Minimum columns",
    importExamplesOptional: fr ? "Colonnes optionnelles" : "Optional columns",
    importExamplesDownload: fr ? "Télécharger le modèle CSV" : "Download CSV template",
    // Niches (filter labels)
    nicheBeauty: fr ? "Beauté" : "Beauty",
    nicheFashion: fr ? "Mode" : "Fashion",
    nicheTravel: fr ? "Voyage" : "Travel",
    nicheLifestyle: fr ? "Lifestyle" : "Lifestyle",
    nicheWellness: fr ? "Bien-être" : "Wellness",
    nicheBusiness: fr ? "Business" : "Business",
  };
}

export function engagementInsightCopy(lang: Lang, rate: number): string {
  const c = discoveryCopy(lang);
  if (rate >= 6) return c.engagementInsightHigh;
  if (rate >= 3) return c.engagementInsightAbove;
  if (rate >= 1) return c.engagementInsightAverage;
  return c.engagementInsightLow;
}

export function daysAgoCopy(lang: Lang, iso: string | null): string | null {
  if (!iso) return null;
  const c = discoveryCopy(lang);
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return c.activeToday;
  if (d === 1) return c.activeYesterday;
  if (d < 30) return c.activeDaysAgo(d);
  return c.activeMonthsAgo(Math.floor(d / 30));
}
