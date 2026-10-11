import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp, useColors } from "../state/AppState";

function Navigation() {
  const colors = useColors();
  const { preferences } = useApp();
  return (
    <>
      <StatusBar style={preferences.theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          freezeOnBlur: false,
        }}
      />
    </>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Navigation />
      </AppProvider>
    </SafeAreaProvider>
  );
}
