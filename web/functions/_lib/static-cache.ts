/**
 * How long a browser may keep a static file without asking again.
 *
 * Pages serves every static file with `max-age=0, must-revalidate`, so a returning guest re-asked for all forty
 * house photos on every visit. Vite's `/assets/` files carry a content hash in the name and never change, so they
 * are immutable. House photos are named by room, not by content, so they get a week and a day of stale grace:
 * a replaced photo shows up within a week, and nobody waits on a revalidation to see a picture.
 *
 * Everything else — the HTML, `llms.txt`, the sitemap — returns null and keeps the Pages default, because a
 * cached page would hide a fix.
 */
export function staticCacheControl(pathname: string): string | null {
  if (/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|svg|png|jpg|webp)$/.test(pathname)) {
    return 'public, max-age=31536000, immutable';
  }
  if (/^\/houses\/(?:[a-z]+\/)?[a-z0-9-]+\.(jpe?g|webp)$/i.test(pathname)) {
    return 'public, max-age=604800, stale-while-revalidate=86400';
  }
  return null;
}
