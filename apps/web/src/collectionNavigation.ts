/** Only collection-owned origins may override a species card's normal list return. */
export function collectionOriginPath(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const from = (state as { from?: unknown }).from;
  return typeof from === "string" && (
    from === "/collection" || from === "/collection/tree" || from.startsWith("/collection/tree/")
  ) ? from : null;
}
