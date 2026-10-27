// قائمة الألعاب المحظورة مشتركة بين المستورد والمشغّل (نفس ملف data/blocked-games.json).
import blocked from "../data/blocked-games.json" with { type: "json" };

const ids = new Set((blocked.ids ?? []).map(Number));
const slugs = new Set((blocked.slugs ?? []).map((value) => String(value).toLowerCase()));
const names = new Set((blocked.names ?? []).map((value) => String(value).toLowerCase()));

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function isBlockedGame(game) {
  if (game?.id != null && ids.has(Number(game.id))) return true;
  if (game?.slug && slugs.has(String(game.slug).toLowerCase())) return true;
  if (game?.name && (names.has(String(game.name).toLowerCase()) || names.has(normalize(game.name)))) return true;
  return false;
}

export const blockedSlugs = [...slugs];
export const blockedIds = [...ids];
