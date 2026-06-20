export type CreatorProfileExtras = {
  age?: number;
  location?: string;
};

const STORAGE_PREFIX = "trackit_creator_profile_";

function storageKey(userId: string, creatorId: string) {
  return `${STORAGE_PREFIX}${userId}_${creatorId}`;
}

export function loadCreatorProfileExtras(userId: string, creatorId: string): CreatorProfileExtras {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(userId, creatorId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CreatorProfileExtras;
    return {
      age: typeof parsed.age === "number" ? parsed.age : undefined,
      location: typeof parsed.location === "string" ? parsed.location : undefined,
    };
  } catch {
    return {};
  }
}

export function saveCreatorProfileExtras(
  userId: string,
  creatorId: string,
  extras: Partial<CreatorProfileExtras>,
) {
  if (typeof window === "undefined") return;
  try {
    const current = loadCreatorProfileExtras(userId, creatorId);
    localStorage.setItem(
      storageKey(userId, creatorId),
      JSON.stringify({ ...current, ...extras }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function mergeCreatorProfileExtras<T extends { id: string; age: number; location: string }>(
  userId: string,
  creator: T,
): T {
  const extras = loadCreatorProfileExtras(userId, creator.id);
  return {
    ...creator,
    age: extras.age ?? creator.age,
    location: extras.location ?? creator.location,
  };
}
