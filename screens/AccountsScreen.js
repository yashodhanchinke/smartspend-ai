import { Ionicons } from "@expo/vector-icons";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AccountsScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>

        {/* Account Card */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20 }}
        >
          {/* Bank Card */}
          <View style={[styles.accountCard, { backgroundColor: "#1f4e79" }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.accountTitle}>Bank</Text>
                <Text style={styles.accountUser}>Yash</Text>
              </View>
              <Ionicons name="business-outline" size={24} color="#fff" />
            </View>

            <Text style={styles.balanceLabel}>Total balance</Text>
            <Text style={styles.balanceValue}>₹0.00</Text>
          </View>

          {/* Cash Card */}
          <View style={[styles.accountCard, { backgroundColor: "#295f2d" }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.accountTitle}>Cash</Text>
                <Text style={styles.accountUser}>Yash</Text>
              </View>
              <Ionicons name="cash-outline" size={24} color="#fff" />
            </View>

            <Text style={styles.balanceLabel}>Total balance</Text>
            <Text style={styles.balanceValue}>₹0.00</Text>
          </View>
        </ScrollView>

        {/* Income / Expense */}
        <View style={styles.compareRow}>
          <View>
            <Text style={styles.compareLabel}>Income</Text>
            <Text style={styles.income}>₹0.00 ↑0.00%</Text>
            <Text style={styles.compareSub}>Compared to last month</Text>
          </View>

          <View>
            <Text style={styles.compareLabel}>Expense</Text>
            <Text style={styles.expense}>₹0.00 ↑0.00%</Text>
            <Text style={styles.compareSub}>Compared to last month</Text>
          </View>
        </View>

        {/* Empty State */}
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={48} color="#aaa" />
          <Text style={styles.emptyTitle}>
            No transactions found for Yash
          </Text>
          <Text style={styles.emptySub}>
            Please add transactions to this account
          </Text>
        </View>

        {/* Floating Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("AddTransaction")}
        >
          <Ionicons name="add" size={28} color="#000" />
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1a0f0a",
  },
  container: {
    flex: 1,
    padding: 16,
  },

  accountCard: {
    width: 280,
    borderRadius: 20,
    padding: 16,
    marginRight: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  accountTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  accountUser: {
    color: "#ddd",
    fontSize: 13,
  },
  balanceLabel: {
    color: "#ddd",
    fontSize: 13,
  },
  balanceValue: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6,
  },

  compareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  compareLabel: {
    color: "#ccc",
    fontSize: 13,
  },
  income: {
    color: "#6ddf9c",
    fontWeight: "700",
    marginTop: 4,
  },
  expense: {
    color: "#ff8b8b",
    fontWeight: "700",
    marginTop: 4,
  },
  compareSub: {
    color: "#aaa",
    fontSize: 11,
    marginTop: 2,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
  emptyTitle: {
    color: "#fff",
    marginTop: 12,
    fontWeight: "700",
  },
  emptySub: {
    color: "#aaa",
    marginTop: 6,
    fontSize: 12,
    textAlign: "center",
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    backgroundColor: "#f5b38a",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
