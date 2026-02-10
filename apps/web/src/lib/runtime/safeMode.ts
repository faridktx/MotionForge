export function isSafeModeEnabled(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return params.get("safe") === "1";
}

export function shouldRenderViewport(safeModeEnabled: boolean): boolean {
  return !safeModeEnabled;
}
