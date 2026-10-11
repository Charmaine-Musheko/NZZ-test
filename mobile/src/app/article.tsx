import { useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useFocused } from "../state/useFocused";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsPage } from "../components/NewsPage";
import { ToolbarButton } from "../components/ToolbarButton";
import { tracking, useApp, useColors } from "../state/AppState";
import { articlePath } from "../core/protocol";
import { SERVER } from "../config";

export default function ArticleScreen() {
  const params = useLocalSearchParams<{ path: string }>();
  const path = articlePath(params.path || "", SERVER);
  const id = path?.split("?")[0].split("/").pop() || "";
  const { preferences, changeFont, toggleTheme, toggleBookmark, read } =
    useApp();
  const colors = useColors();
  const safe = useSafeAreaInsets();
  const focused = useFocused();
  const [reload] = useState(0);
  const hasRead = useRef(false);
  const top = safe.top + 58;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {path ? (
        <NewsPage
          page="article"
          path={path}
          articleId={id}
          active={focused}
          insets={{ top, bottom: safe.bottom + 12 }}
          reloadKey={reload}
          onOpen={(next) =>
            router.push({ pathname: "/article", params: { path: next } })
          }
          onRead={(title) => {
            if (hasRead.current) return;
            hasRead.current = true;
            read({ id, title, path });
            tracking.read(id);
          }}
        />
      ) : (
        <Text style={{ marginTop: top + 30, padding: 20, color: colors.text }}>
          This article link is not valid.
        </Text>
      )}
      <View
        style={[
          styles.toolbar,
          {
            paddingTop: safe.top,
            height: top,
            backgroundColor: colors.background + "F5",
            borderBottomColor: colors.line,
          },
        ]}
      >
        <ToolbarButton
          label="Back to previous screen"
          onPress={() => router.back()}
        >
          ‹
        </ToolbarButton>
        <View style={styles.controls}>
          <ToolbarButton
            label="Decrease font size"
            disabled={preferences.fontScale <= 0.8}
            onPress={() => changeFont(-0.1)}
          >
            A−
          </ToolbarButton>
          <ToolbarButton
            label="Increase font size"
            disabled={preferences.fontScale >= 1.6}
            onPress={() => changeFont(0.1)}
          >
            A+
          </ToolbarButton>
          <ToolbarButton
            label={
              preferences.theme === "light"
                ? "Switch to dark mode"
                : "Switch to light mode"
            }
            onPress={toggleTheme}
          >
            {preferences.theme === "light" ? "☾" : "☀"}
          </ToolbarButton>
          <ToolbarButton
            label={
              preferences.bookmarks.includes(id)
                ? "Remove bookmark"
                : "Bookmark article"
            }
            selected={preferences.bookmarks.includes(id)}
            onPress={() => toggleBookmark(id)}
          >
            {preferences.bookmarks.includes(id) ? "★" : "☆"}
          </ToolbarButton>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  toolbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  controls: { flexDirection: "row", gap: 4 },
});
