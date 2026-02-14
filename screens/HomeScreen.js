// screens/HomeScreen.js
import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";

export default function HomeScreen({ navigation }) {
  const [transactions] = useState([]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.username}>Yash</Text>
            <Text style={styles.greeting}>Evening, Yash! How’re the finances?</Text>
          </View>

          <TouchableOpacity style={styles.profilePic}>
            <Feather name="user" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* BALANCE CARD */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceTitle}>Total balance</Text>
            <Feather name="eye-off" size={22} color={colors.text} />
          </View>

          <Text style={styles.balanceValue}>₹ 0.00</Text>

          <Text style={styles.thisMonthText}>This month</Text>

          <View style={styles.incomeExpenseRow}>
            <View style={styles.balanceBlock}>
              <Text style={styles.subTitle}>Income</Text>
              <Text style={styles.amountGreen}>₹0.00 ↑ 0.00%</Text>
              <Text style={styles.lightMuted}>Compared to ₹0.00 last month</Text>
            </View>

            <View style={styles.balanceBlock}>
              <Text style={styles.subTitle}>Expense</Text>
              <Text style={styles.amountRed}>₹0.00 ↑ 0.00%</Text>
              <Text style={styles.lightMuted}>Compared to ₹0.00 last month</Text>
            </View>
          </View>
        </View>

        {/* GRID ITEMS */}
        <View style={styles.grid}>

          <SectionCard icon="bar-chart" title="Budgets" subtitle="No budgets set" navigation={navigation} />
          <SectionCard icon="pie-chart" title="Loans" subtitle="No loans" navigation={navigation} />
          <SectionCard icon="flag" title="Goals" subtitle="No goals set" navigation={navigation} />
          <SectionCard icon="tag" title="Labels" subtitle="No labels" navigation={navigation} />
          <SectionCard icon="activity" title="Analytics" subtitle="Stable this month" navigation={navigation} />
          <SectionCard icon="repeat" title="Recurring" subtitle="No recurring events" navigation={navigation} />
          <SectionCard icon="grid" title="Categories" subtitle="18 total" navigation={navigation} />

          {/* ⭐ NEW — Weekly Summary Card */}
          <SectionCard
            icon="calendar"
            title="Weekly Summary"
            subtitle="View spending overview"
            navigation={navigation}
          />

        </View>

        {/* CALENDAR SECTION */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Calendar heatmap</Text>
          <Text style={styles.lightMuted}>No activity yet</Text>
        </View>

        {/* RECENT TRANSACTIONS */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Recent transactions</Text>

          {transactions.length === 0 && (
            <Text style={styles.lightMuted}>No transactions yet</Text>
          )}
        </View>

      </ScrollView>

          {/* FLOATING + BUTTON */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddTransaction")}
      >
        <Feather name="plus" size={28} color="#000" />
      </TouchableOpacity>

    </SafeAreaView>
  );
}

function SectionCard({ icon, title, subtitle, navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate(title)}
      style={styles.sectionCard}
    >
      <View style={styles.sectionRow}>
        <Feather name={icon} size={20} color={colors.text} />
        <Text style={styles.sectionTitleText}>{title}</Text>
      </View>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

/* ====== STYLES ====== */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  container: {
    paddingTop: Platform.OS === "android" ? 20 : 10,
    paddingHorizontal: 16,
    paddingBottom: 140,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  username: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
  },

  greeting: {
    color: "#d7cfc7",
    marginTop: 4,
  },

  profilePic: {
    backgroundColor: colors.card,
    padding: 10,
    borderRadius: 50,
  },

  balanceCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 22,
    marginBottom: 20,
  },

  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  balanceTitle: { color: colors.text, fontSize: 16 },

  balanceValue: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
  },

  thisMonthText: {
    color: "#d5c8be",
    marginTop: 10,
    fontSize: 15,
  },

  incomeExpenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },

  balanceBlock: { width: "48%" },

  subTitle: { color: colors.text, marginBottom: 4 },
  amountGreen: { color: "#79ff8a", fontWeight: "700" },
  amountRed: { color: "#ff7676", fontWeight: "700" },

  lightMuted: {
    color: "#c6b9b0",
    fontSize: 12,
    marginTop: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  sectionCard: {
    backgroundColor: colors.card,
    width: "48%",
    padding: 18,
    borderRadius: 18,
    marginBottom: 14,
  },

  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },

  sectionTitleText: { color: colors.text, fontWeight: "700", marginLeft: 8 },

  sectionSubtitle: { color: "#c6b9b0" },

  summaryCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 10,
  },

  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: colors.gold,
    padding: 18,
    borderRadius: 40,
    elevation: 10,
  },
});
