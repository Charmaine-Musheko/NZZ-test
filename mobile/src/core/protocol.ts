export type Preferences = {
  theme: "light" | "dark";
  fontScale: number;
  bookmarks: string[];
  read: string[];
  recent: { id: string; title: string; path: string }[];
};

export const defaults: Preferences = {
  theme: "light",
  fontScale: 1,
  bookmarks: [],
  read: [],
  recent: [],
};

export function parseMessage(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function articlePath(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== new URL(origin).origin ||
      !/^\/article\/[\w-]+$/.test(url.pathname)
    )
      return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function pageUrl(
  path: string,
  origin: string,
  consent: string | null,
): string {
  const url = new URL(path, origin);
  url.hash = consent === null ? "" : `consent=${encodeURIComponent(consent)}`;
  return url.href;
}

// Per-document ledger: duplicate ready messages never repeat the initial snapshot.
export class StateDelivery {
  private sent = new Map<string, string>();
  changes(
    state: Preferences,
    page: "front" | "article",
    insets: { top: number; bottom: number },
  ) {
    const entries: [string, object][] = [
      ["app:fontScale", { value: state.fontScale }],
      ["app:theme", { value: state.theme }],
      ["app:bookmarks", { ids: state.bookmarks }],
      ...(page === "front"
        ? [["app:read", { ids: state.read }] as [string, object]]
        : [["app:insets", insets] as [string, object]]),
    ];
    return entries.filter(([name, detail]) => {
      const value = JSON.stringify(detail);
      if (this.sent.get(name) === value) return false;
      this.sent.set(name, value);
      return true;
    });
  }
}

export function markRead(
  state: Preferences,
  article: Preferences["recent"][number],
): Preferences {
  return {
    ...state,
    read: [...new Set([...state.read, article.id])],
    recent: [article, ...state.recent.filter((a) => a.id !== article.id)].slice(
      0,
      5,
    ),
  };
}

export function restorePreferences(raw: string | null): Preferences {
  const value = raw ? parseMessage(raw) : null;
  if (!value) return defaults;
  const ids = (v: unknown): string[] =>
    Array.isArray(v)
      ? [...new Set(v.filter((id): id is string => typeof id === "string"))]
      : [];
  return {
    theme: value.theme === "dark" ? "dark" : "light",
    fontScale:
      typeof value.fontScale === "number" && Number.isFinite(value.fontScale)
        ? Math.max(0.8, Math.min(1.6, value.fontScale))
        : 1,
    bookmarks: ids(value.bookmarks),
    read: ids(value.read),
    recent: Array.isArray(value.recent)
      ? value.recent
          .filter(
            (a) =>
              a &&
              typeof a.id === "string" &&
              typeof a.title === "string" &&
              typeof a.path === "string",
          )
          .slice(0, 5)
      : [],
  };
}
