import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { ConsentService } from "../core/consent";
import {
  defaults,
  markRead,
  restorePreferences,
  type Preferences,
} from "../core/protocol";
import { TrackingService } from "../core/tracking";
import { APP_VERSION, SERVER } from "../config";

export const tracking = new TrackingService({
  namespace: "news-app",
  endpoint: SERVER,
  appVersion: APP_VERSION,
  platform: Platform.OS === "ios" ? "ios" : "android",
});
export const consent = new ConsentService(SERVER, tracking.allow);
const STORAGE_KEY = "news-reader.preferences.v1";
let writes = Promise.resolve();
type Store = {
  preferences: Preferences;
  hydrated: boolean;
  storageError: boolean;
  toggleTheme(): void;
  changeFont(delta: number): void;
  toggleBookmark(id: string): void;
  read(article: Preferences["recent"][number]): void;
};
const Context = createContext<Store | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (alive) setPreferences(restorePreferences(raw));
      })
      .catch(() => {
        if (alive) setStorageError(true);
      })
      .finally(() => {
        if (alive) setHydrated(true);
      });
    void consent.refresh();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && previous !== "active") void consent.refresh();
      previous = next;
    });
    return () => {
      alive = false;
      subscription.remove();
      consent.dispose();
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    // Serialize writes so a slower earlier write cannot overwrite the newest preferences.
    writes = writes
      .then(() =>
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)),
      )
      .catch(() => setStorageError(true));
  }, [preferences, hydrated]);
  return (
    <Context.Provider
      value={{
        preferences,
        hydrated,
        storageError,
        toggleTheme: () =>
          setPreferences((p) => ({
            ...p,
            theme: p.theme === "light" ? "dark" : "light",
          })),
        changeFont: (delta) =>
          setPreferences((p) => ({
            ...p,
            fontScale:
              Math.round(
                Math.max(0.8, Math.min(1.6, p.fontScale + delta)) * 10,
              ) / 10,
          })),
        toggleBookmark: (id) =>
          setPreferences((p) => ({
            ...p,
            bookmarks: p.bookmarks.includes(id)
              ? p.bookmarks.filter((x) => x !== id)
              : [...p.bookmarks, id],
          })),
        read: (article) => setPreferences((p) => markRead(p, article)),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useApp() {
  const store = useContext(Context);
  if (!store) throw new Error("Missing AppProvider");
  return store;
}
export function useConsent() {
  return useSyncExternalStore(
    consent.subscribe,
    consent.snapshot,
    consent.snapshot,
  );
}
export function useColors() {
  const { preferences } = useApp();
  return preferences.theme === "dark"
    ? {
        background: "#11151a",
        card: "#20262d",
        text: "#f4f2ee",
        muted: "#aeb7c3",
        line: "#343e49",
        accent: "#9bbbe4",
      }
    : {
        background: "#f8f7f4",
        card: "#ffffff",
        text: "#18222f",
        muted: "#657181",
        line: "#dce0e4",
        accent: "#234d7b",
      };
}
