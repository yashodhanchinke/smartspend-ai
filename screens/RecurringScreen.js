// screens/RecurringScreen.js
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import colors from "../theme/colors";

export default function RecurringScreen({ navigation }) {
  const recurring = []; // backend later

  return (
    <SafeAreaView style={styles.container}>
      {/* Back + Title */}
      <ScreenHeader title="Recurring" navigation={navigation} />

      {/* Empty State */}
      {recurring.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="repeat" size={54} color="#d6c3b7" />
          <Text style={styles.emptyTitle}>No recurring payments</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any recurring payments yet.{"\n"}
            Tap the + button to add your first one.
          </Text>
        </View>
      ) : (
        <View>{/* recurring list later */}</View>
      )}

      {/* Floating Button */}
      <FloatingButton onPress={() => console.log("Add Recurring")} />
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
