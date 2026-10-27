import blocked from "@/data/blocked-games.json";

const ids = new Set((blocked.ids ?? []).map(Number));
const slugs = new Set((blocked.slugs ?? []).map((value) => value.toLowerCase()));
const names = new Set((blocked.names ?? []).map((value) => value.toLowerCase()));

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * ألعاب لا نستوردها ولا نعرضها إطلاقًا (محتوى لا يليق بمكتبة mode).
 * القائمة في data/blocked-games.json ويستخدمها أيضًا المستورد والمشغّل.
 */
export function isBlockedGame(game: { id?: number | null; slug?: string | null; name?: string | null }) {
  if (game.id != null && ids.has(Number(game.id))) return true;
  if (game.slug && slugs.has(game.slug.toLowerCase())) return true;
  if (game.name && (names.has(game.name.toLowerCase()) || names.has(normalize(game.name)))) return true;
  return false;
}

export function isBlockedGameKey(slug: string | null | undefined, name: string | null | undefined) {
  return isBlockedGame({ slug, name });
}

export const blockedGameSlugs = [...slugs];
export const blockedGameNames = [...names];
