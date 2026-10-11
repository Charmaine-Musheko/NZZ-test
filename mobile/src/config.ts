import Constants from "expo-constants";
import { Platform } from "react-native";

const host = Constants.expoConfig?.hostUri?.split(":")[0];
export const SERVER = (
  process.env.EXPO_PUBLIC_SERVER_URL ||
  `http://${host || (Platform.OS === "android" ? "10.0.2.2" : "localhost")}:8787`
).replace(/\/+$/, "");
export const APP_VERSION = "1.0.0";
export const APP_BUILD = "1";
