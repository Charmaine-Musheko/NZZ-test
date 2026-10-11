import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useFocused() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
