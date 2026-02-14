// screens/BudgetsScreen.js
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import colors from "../theme/colors";

export default function BudgetsScreen({ navigation }) {
  const budgets = [];

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <ScreenHeader title="Budgets" navigation={navigation} />

      {budgets.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <MaterialCommunityIcons
            name="piggy-bank"
            size={52}
            color="#d6c3b7"
          />
          <Text style={styles.emptyTitle}>No budgets found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any budgets yet.{"\n"}
            Tap the + button to add your first budget.
          </Text>
        </View>
      ) : (
        <View>{/* Future: real budget list */}</View>
      )}

      <FloatingButton onPress={() => console.log("Add Budget")} />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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
