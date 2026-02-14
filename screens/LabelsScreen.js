// screens/LabelsScreen.js
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import colors from "../theme/colors";

export default function LabelsScreen({ navigation }) {
  const labels = []; // backend later

  return (
    <SafeAreaView style={styles.container}>
      {/* Back + Title */}
      <ScreenHeader title="Labels" navigation={navigation} />

      {/* Empty State */}
      {labels.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="tag" size={54} color="#d6c3b7" />
          <Text style={styles.emptyTitle}>No labels found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any labels yet.{"\n"}
            Tap the + button to add your first label.
          </Text>
        </View>
      ) : (
        <View>{/* Label list later */}</View>
      )}

      {/* Floating Button */}
      <FloatingButton onPress={() => console.log("Add Label")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },

  emptyWrapper: {
    marginTop: 80,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
  },

  emptySubtitle: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});
