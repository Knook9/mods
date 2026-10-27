const ARCHIVE = /\.(?:7z|zip|rar|jar|pak|mod|wotmod|dll|exe|tar|gz|tgz|bin|nsp|xdelta)$/i;

export type DownloadSourceMod = {
  downloadUrl: string;
  sourceUrl: string | null;
  downloadFileName: string | null;
  downloadSize: number | null;
};

export type ResolvedDownload =
  | { status: "ok"; url: string; fileName: string | null; size: number | null; provider: "direct" }
  | { status: "page"; pageUrl: string };

export function isDirectFileUrl(raw: string | null | undefined, fileName?: string | null) {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return ARCHIVE.test(decodeURIComponent(url.pathname)) || Boolean(fileName?.trim());
  } catch {
    return false;
  }
}

export async function resolveModDownload(mod: DownloadSourceMod): Promise<ResolvedDownload> {
  if (isDirectFileUrl(mod.downloadUrl, mod.downloadFileName)) {
    return {
      status: "ok",
      url: mod.downloadUrl,
      fileName: mod.downloadFileName,
      size: mod.downloadSize,
      provider: "direct",
    };
  }
  return { status: "page", pageUrl: mod.sourceUrl ?? mod.downloadUrl };
}
