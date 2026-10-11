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

// Per-document ledger. A value counts as delivered only once the page has
// acknowledged the sequence number that carried it. An injection the platform
// drops is therefore sent again, instead of being recorded as delivered and
// lost for the lifetime of the document.
export class StateDelivery {
  private confirmed = new Map<string, string>();
  private inFlight: { seq: number; values: Map<string, string> } | null = null;
  private counter = 0;

  next(
    state: Preferences,
    page: "front" | "article",
    insets: { top: number; bottom: number },
  ): { seq: number; events: [string, object][] } {
    const entries: [string, object][] = [
      ["app:fontScale", { value: state.fontScale }],
      ["app:theme", { value: state.theme }],
      ["app:bookmarks", { ids: state.bookmarks }],
      ...(page === "front"
        ? [["app:read", { ids: state.read }] as [string, object]]
        : [["app:insets", insets] as [string, object]]),
    ];
    const values = new Map<string, string>();
    const events = entries.filter(([name, detail]) => {
      const value = JSON.stringify(detail);
      values.set(name, value);
      return this.confirmed.get(name) !== value;
    });
    // Re-asking for an unchanged payload keeps the sequence number, so a
    // resend stays the same message rather than becoming a new one.
    if (!this.inFlight || !sameValues(this.inFlight.values, values))
      this.inFlight = { seq: ++this.counter, values };
    return { seq: this.inFlight.seq, events };
  }

  ack(seq: number) {
    if (!this.inFlight || this.inFlight.seq !== seq) return;
    this.inFlight.values.forEach((value, name) =>
      this.confirmed.set(name, value),
    );
    this.inFlight = null;
  }

  get awaiting() {
    return this.inFlight !== null;
  }
}

function sameValues(a: Map<string, string>, b: Map<string, string>) {
  if (a.size !== b.size) return false;
  for (const [name, value] of a) if (b.get(name) !== value) return false;
  return true;
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
