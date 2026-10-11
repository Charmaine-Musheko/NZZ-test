import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Device from "expo-device";
import { APP_BUILD, APP_VERSION, SERVER } from "../config";
import {
  articlePath,
  pageUrl,
  parseMessage,
  StateDelivery,
} from "../core/protocol";
import { useApp, useColors, useConsent, tracking } from "../state/AppState";
import { bootstrapScript, stateScript } from "../web/bootstrap";

type Props = {
  page: "front" | "article";
  path: string;
  articleId?: string;
  active: boolean;
  insets: { top: number; bottom: number };
  reloadKey: number;
  onOpen(path: string): void;
  onAnchor?(y: number): void;
  onRead?(title: string): void;
  onLoading?(loading: boolean): void;
};
type Document = { key: number; url: string; consent: string | null };

export function NewsPage(props: Props) {
  const { hydrated } = useApp();
  const consent = useConsent();
  const colors = useColors();
  const [document, setDocument] = useState<Document | null>(null);
  const [refresh, setRefresh] = useState(0);
  const requested = useRef("");
  const counter = useRef(0);
  useEffect(() => {
    if (!hydrated || consent.waiting) return;
    const request = `${props.path}:${props.reloadKey}:${refresh}`;
    const needsConsent =
      document && document.consent === null && consent.value !== null;
    if (requested.current !== request || needsConsent) {
      requested.current = request;
      setDocument({
        key: ++counter.current,
        url: pageUrl(props.path, SERVER, consent.value),
        consent: consent.value,
      });
    }
  }, [hydrated, consent, props.path, props.reloadKey, refresh, document]);
  const retry = () => setRefresh((value) => value + 1);
  if (!document)
    return (
      <View
        style={[styles.placeholder, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.muted }}>Preparing your news…</Text>
      </View>
    );
  return (
    <LoadedDocument
      key={document.key}
      {...props}
      url={document.url}
      retry={retry}
    />
  );
}

function LoadedDocument(props: Props & { url: string; retry(): void }) {
  const { preferences, toggleBookmark } = useApp();
  const colors = useColors();
  const web = useRef<WebView>(null);
  const delivery = useRef(new StateDelivery());
  const didReady = useRef(false);
  const didLoad = useRef(false);
  const didScreen = useRef(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [networkError, setNetworkError] = useState(false);
  const [height, setHeight] = useState(1);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const [script] = useState(() =>
    bootstrapScript({
      page: props.page,
      articleId: props.articleId,
      insets: props.insets,
      context: {
        appVersion: APP_VERSION,
        appBuild: APP_BUILD,
        os: Platform.OS,
        deviceType:
          Device.deviceType === Device.DeviceType.TABLET ? "tablet" : "phone",
      },
    }),
  );
  const { onLoading } = props;

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    const timer = setTimeout(() => {
      if (!didReady.current) {
        setNetworkError(!didLoad.current);
        setError("This page took too long to become ready.");
        setPhase("error");
      }
    }, 18000);
    return () => {
      clearTimeout(timer);
      listener.remove();
    };
  }, []);
  useEffect(() => {
    onLoading?.(phase === "loading");
  }, [phase, onLoading]);
  const send = useCallback(
    (ready: boolean, active: boolean) => {
      const { seq, events } = delivery.current.next(
        preferences,
        props.page,
        props.insets,
      );
      web.current?.injectJavaScript(
        stateScript(events, active, ready, props.insets, seq),
      );
    },
    [preferences, props.page, props.insets],
  );
  const resend = useRef(send);
  useEffect(() => {
    resend.current = send;
  }, [send]);
  useEffect(() => {
    if (phase !== "ready") return;
    send(true, props.active && foreground);
  }, [send, phase, props.active, foreground]);

  // An injection can be dropped while the web view is still settling. Nothing
  // is recorded as delivered until the page acknowledges it, so repeat the
  // outstanding payload for a short while; the page ignores one it has applied.
  useEffect(() => {
    if (phase !== "ready") return;
    let tries = 0;
    const timer = setInterval(() => {
      if (!delivery.current.awaiting) {
        tries = 0;
        return;
      }
      if (tries >= 8) return;
      tries += 1;
      resend.current(true, latest.current.active);
    }, 400);
    return () => clearInterval(timer);
  }, [phase]);

  // NetInfo alone cannot detect the fixture's unreachable switch: probe the server while failed.
  useEffect(() => {
    if (phase !== "error" || !networkError) return;
    let disposed = false;
    let busy = false;
    let controller: AbortController | undefined;
    const probe = async () => {
      if (disposed || busy || AppState.currentState !== "active") return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 3000);
      try {
        const response = await fetch(`${SERVER}/front`, {
          signal: controller.signal,
        });
        if (response.ok && !disposed) latest.current.retry();
      } catch {
        /* Stay on the readable error state until the server returns. */
      } finally {
        busy = false;
        clearTimeout(timeout);
      }
    };
    const interval = setInterval(() => void probe(), 4000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void probe();
    });
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(interval);
      listener.remove();
    };
  }, [phase, networkError]);

  const lastLink = useRef({ url: "", at: 0 });
  function open(url: string) {
    if (!props.active) return;
    const path = articlePath(url, SERVER);
    const target = path || url;
    if (
      lastLink.current.url === target &&
      Date.now() - lastLink.current.at < 700
    )
      return;
    lastLink.current = { url: target, at: Date.now() };
    if (path) props.onOpen(path);
    else
      void Linking.openURL(url).catch(() => {
        setError("No app on this device could open that link.");
      });
  }
  function message(event: WebViewMessageEvent) {
    const raw = event.nativeEvent.data;
    tracking.web(raw);
    const data = parseMessage(raw);
    if (!data) return;
    if (
      data.type === "ready" &&
      data.protocol === 1 &&
      data.page === props.page &&
      (props.page === "front" || data.articleId === props.articleId)
    ) {
      if (didReady.current || phase === "error") return;
      didReady.current = true;
      web.current?.injectJavaScript(script);
      if (!didScreen.current) {
        didScreen.current = true;
        tracking.screen(props.page, props.articleId);
      }
      setPhase("ready");
    }
    if (data.type === "native:stateAck" && typeof data.seq === "number")
      delivery.current.ack(data.seq);
    if (
      data.type === "height" &&
      typeof data.value === "number" &&
      Number.isFinite(data.value) &&
      data.value > 0 &&
      data.value < 200000
    )
      setHeight(Math.ceil(data.value));
    if (
      data.type === "toggleBookmark" &&
      data.articleId === props.articleId &&
      typeof data.articleId === "string"
    )
      toggleBookmark(data.articleId);
    if (data.type === "openArticle" && typeof data.path === "string") {
      const path = articlePath(data.path, SERVER);
      if (path) open(path);
    }
    if (data.type === "native:link" && typeof data.url === "string")
      open(data.url);
    if (
      data.type === "native:anchor" &&
      typeof data.y === "number" &&
      Number.isFinite(data.y)
    )
      props.onAnchor?.(Math.max(0, data.y));
    if (
      data.type === "native:read" &&
      data.articleId === props.articleId &&
      typeof data.title === "string" &&
      props.active &&
      foreground &&
      didReady.current
    )
      props.onRead?.(data.title);
    if (data.type === "native:refresh" && phase === "ready") props.retry();
  }
  function fail(text: string) {
    setNetworkError(true);
    setError(text);
    setPhase("error");
  }
  return (
    <View
      style={[
        props.page === "article"
          ? styles.fill
          : { height: phase === "ready" ? height : 420 },
        { backgroundColor: colors.background },
      ]}
    >
      {phase !== "error" && (
        <WebView
          ref={web}
          source={{ uri: props.url }}
          style={{
            flex: 1,
            backgroundColor: colors.background,
            opacity: phase === "ready" ? 1 : 0,
          }}
          injectedJavaScriptBeforeContentLoaded={script}
          injectedJavaScript={script}
          onMessage={message}
          onLoad={() => { didLoad.current = true; }}
          scrollEnabled={props.page === "article"}
          nestedScrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          textZoom={100}
          setBuiltInZoomControls={false}
          showsVerticalScrollIndicator={props.page === "article"}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled={false}
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(request) => {
            if (request.isTopFrame === false) return true;
            const base = props.url.split("#")[0];
            if (
              request.url === props.url ||
              request.url === "about:blank" ||
              request.url.split("#")[0] === base
            )
              return true;
            open(request.url);
            return false;
          }}
          onOpenWindow={(event) => open(event.nativeEvent.targetUrl)}
          onError={() =>
            fail(
              "We couldn’t connect to the newsroom. We’ll retry when it is available.",
            )
          }
          onHttpError={(event) => {
            if (event.nativeEvent.url.split("#")[0] === props.url.split("#")[0])
              fail(
                `The newsroom returned an error (${event.nativeEvent.statusCode}).`,
              );
          }}
          onContentProcessDidTerminate={() => props.retry()}
          onRenderProcessGone={() => props.retry()}
        />
      )}
      {phase !== "ready" && (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.placeholder,
            {
              backgroundColor: colors.background,
              paddingTop: props.insets.top,
            },
          ]}
        >
          {phase === "loading" ? (
            <>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={{ color: colors.muted }}>Opening the newsroom…</Text>
            </>
          ) : (
            <>
              <Text style={[styles.errorTitle, { color: colors.text }]}>
                News will be back.
              </Text>
              <Text style={[styles.errorText, { color: colors.muted }]}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={props.retry}
                style={[styles.retry, { backgroundColor: colors.accent }]}
              >
                <Text style={{ color: colors.background, fontWeight: "700" }}>
                  Try again
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  placeholder: {
    minHeight: 300,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 28,
  },
  errorTitle: { fontSize: 25, fontWeight: "600" },
  errorText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 320,
  },
  retry: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 8 },
});
