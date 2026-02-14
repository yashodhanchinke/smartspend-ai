// components/EmptyState.js
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import colors from "../theme/colors";

export default function EmptyState({ icon, title, subtitle }) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon}
        size={70}
        color="#d6c3b7"
        style={{ marginBottom: 20 }}
      />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "700",
    marginTop: 15,
  },
  subtitle: {
    textAlign: "center",
    color: colors.muted,
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
});
