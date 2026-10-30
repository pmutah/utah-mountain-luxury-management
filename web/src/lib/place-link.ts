const SECRET = /door\s*code|wi-?fi|password/i;

/** A published https website. Anything else stays off the page. */
export function placeSite(url: string | undefined): string | null {
  const text = url?.trim() ?? '';
  if (!/^https:\/\//i.test(text) || SECRET.test(text)) return null;
  try {
    return new URL(text).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The place website, or a map search when the guide has no website. */
export function placeHref(place: { name: string; area?: string; url?: string }): string {
  const text = place.url?.trim() ?? '';
  if (placeSite(text)) return text;
  const query = [place.name, place.area, 'Utah'].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
