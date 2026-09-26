// This branch is a read-only static build: nothing can be saved.
export const STATIC_DEMO = true;

// GitHub Pages serves the site under /<repo>; plain URLs (CSS backgrounds, <img>)
// don't get next.config's basePath automatically, so they are prefixed here
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function assetUrl(url: string) {
  return url.startsWith("/") ? `${BASE_PATH}${url}` : url;
}
