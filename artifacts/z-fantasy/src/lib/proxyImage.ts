/**
 * Wraps Pollinations image URLs through the server-side proxy to bypass
 * Telegram webview CORS restrictions. All other URLs are returned unchanged.
 */
export function proxyImage(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes("image.pollinations.ai")) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
