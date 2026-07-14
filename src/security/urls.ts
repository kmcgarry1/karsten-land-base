const IMAGE_HOSTS = new Set(["cards.scryfall.io", "svgs.scryfall.io"]);

export function safeScryfallImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !IMAGE_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

export function isAllowedScryfallResponseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "api.scryfall.com" &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
