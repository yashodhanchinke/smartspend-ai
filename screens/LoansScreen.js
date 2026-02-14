// screens/LoansScreen.js
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader"; // ✅ correct import
import colors from "../theme/colors";

export default function LoansScreen({ navigation }) {
  const loans = []; // later backend

  return (
    <SafeAreaView style={styles.container}>
      {/* 🔙 Back + Title */}
      <ScreenHeader title="Loans" navigation={navigation} />

      {/* If no loans */}
      {loans.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="credit-card" size={52} color="#d6c3b7" />
          <Text style={styles.emptyTitle}>No loans found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any loans yet.{"\n"}Tap the + button to add your first loan.
          </Text>
        </View>
      ) : (
        <View>{/* future loan list when backend added */}</View>
      )}

      {/* ➕ Floating Button */}
      <FloatingButton onPress={() => console.log("Add Loan")} />
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
