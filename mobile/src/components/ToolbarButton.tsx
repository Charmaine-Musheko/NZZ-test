import { Pressable, Text } from "react-native";
import { useColors } from "../state/AppState";

export function ToolbarButton({
  label,
  children,
  onPress,
  selected = false,
  disabled = false,
}: {
  label: string;
  children: string;
  onPress(): void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected || pressed ? colors.line : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {children}
      </Text>
    </Pressable>
  );
}
