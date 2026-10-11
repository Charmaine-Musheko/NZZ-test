import { useRef, useState } from "react";
import { router } from "expo-router";
import { useFocused } from "../state/useFocused";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewsPage } from "../components/NewsPage";
import { ToolbarButton } from "../components/ToolbarButton";
import { useApp, useColors } from "../state/AppState";

export default function FrontScreen() {
  const { preferences, toggleTheme, storageError } = useApp();
  const colors = useColors();
  const safe = useSafeAreaInsets();
  const focused = useFocused();
  const scroll = useRef<ScrollView>(null);
  const pageY = useRef(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const open = (path: string) =>
    router.push({ pathname: "/article", params: { path } });
  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: colors.background, paddingTop: safe.top },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.line }]}>
        <View>
          <Text style={[styles.brand, { color: colors.text }]}>NZZ</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            DER ANDERE BLICK
          </Text>
        </View>
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
      </View>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: safe.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={loading && reload > 0}
            onRefresh={() => setReload((n) => n + 1)}
            tintColor={colors.accent}
          />
        }
      >
        {storageError && (
          <Text style={{ padding: 16, color: colors.muted }}>
            Your preferences could not be saved on this device.
          </Text>
        )}
        {preferences.recent.length > 0 && (
          <View style={styles.recent}>
            <Text style={[styles.section, { color: colors.muted }]}>
              RECENTLY READ
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
            >
              {preferences.recent.map((article) => (
                <Pressable
                  accessibilityRole="button"
                  key={article.id}
                  onPress={() => open(article.path)}
                  style={[
                    styles.recentCard,
                    { backgroundColor: colors.card, borderColor: colors.line },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    ✓ READ
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      lineHeight: 21,
                      fontWeight: "600",
                    }}
                  >
                    {article.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View
          onLayout={(event) => {
            pageY.current = event.nativeEvent.layout.y;
          }}
        >
          <NewsPage
            page="front"
            path="/front"
            active={focused}
            insets={{ top: 0, bottom: 0 }}
            reloadKey={reload}
            onLoading={setLoading}
            onOpen={open}
            onAnchor={(y) =>
              scroll.current?.scrollTo({ y: pageY.current + y, animated: true })
            }
          />
        </View>
        <View style={[styles.footer, { borderTopColor: colors.line }]}>
          <Text style={[styles.footerTitle, { color: colors.text }]}>
            A little perspective, every day.
          </Text>
          <Text style={{ color: colors.muted, marginTop: 10 }}>
            Independent journalism. Since 1780.
          </Text>
          <Text style={{ color: colors.muted, marginTop: 24, fontSize: 12 }}>
            NZZ · YOUR READING COMPANION
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    height: 78,
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 4,
  },
  subtitle: { fontSize: 8, letterSpacing: 2 },
  recent: { paddingVertical: 20 },
  section: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginLeft: 20,
    marginBottom: 12,
  },
  recentCard: {
    width: 210,
    minHeight: 118,
    borderWidth: 1,
    padding: 14,
    borderRadius: 8,
  },
  footer: { borderTopWidth: 1, padding: 30, paddingVertical: 40 },
  footerTitle: { fontFamily: "serif", fontSize: 23 },
});
