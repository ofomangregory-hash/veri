/**
 * Routes image URLs through the server-side proxy to bypass CORS restrictions
 * in the Telegram webview. Covers all known image sources used by the app.
 *
 * Proxied hosts:
 *   - image.pollinations.ai  — AI-generated selfies / avatars
 *   - telegra.ph             — ephemeral chat images
 *   - picsum.photos          — placeholder avatars
 *   - *.supabase.co          — Supabase Storage (character assets)
 *   - api.dicebear.com       — generated avatar SVGs
 *
 * All other URLs are returned unchanged.
 */

const PROXIED_HOSTS = [
  "image.pollinations.ai",
  "telegra.ph",
  "picsum.photos",
  "api.dicebear.com",
];

const PROXIED_HOST_SUFFIXES = [
  ".supabase.co",
];

function shouldProxy(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    if (PROXIED_HOSTS.includes(hostname)) return true;
    if (PROXIED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) return true;
  } catch {
    // not a valid URL — let it pass through
  }
  return false;
}

export function proxyImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (shouldProxy(url)) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
