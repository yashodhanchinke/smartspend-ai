// screens/TransactionsScreen.js
import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";

export default function TransactionsScreen({ navigation, route }) {

  // Dummy data (later replace with backend)
  const allTransactions = [
    {
      id: 1,
      category: "Food",
      amount: 200,
      type: "expense",
      date: new Date(2026, 0, 2, 19, 15), // Jan 2
      location: "Maharashtra",
    }
  ];

  // UI tab switching
  const [activeTab, setActiveTab] = useState("Daily");

  // Date helpers
  const today = new Date();

  const isSameDay = (d1, d2) =>
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear();

  const isInSameWeek = (date) => {
    const current = new Date();
    const start = new Date(current);
    start.setDate(current.getDate() - 6);
    return date >= start && date <= current;
  };

  const isSameMonth = (date) =>
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isSameYear = (date) =>
    date.getFullYear() === today.getFullYear();

  // Filter logic
  const filteredTransactions =
    activeTab === "Daily"
      ? allTransactions.filter((t) => isSameDay(t.date, today))
      : activeTab === "Weekly"
      ? allTransactions.filter((t) => isInSameWeek(t.date))
      : activeTab === "Monthly"
      ? allTransactions.filter((t) => isSameMonth(t.date))
      : allTransactions.filter((t) => isSameYear(t.date));

  const formatDate = (date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transactions</Text>

        <View style={{ width: 26 }} /> 
      </View>

      {/* LIST */}
      <ScrollView contentContainerStyle={styles.container}>

        {filteredTransactions.length === 0 ? (
          <Text style={styles.noData}>No transactions found</Text>
        ) : (
          filteredTransactions.map((item) => (
            <View key={item.id} style={styles.row}>

              <View style={styles.left}>
                <View style={styles.iconBox}>
                  <Feather name="coffee" size={20} color={colors.text} />
                </View>

                <View>
                  <Text style={styles.category}>{item.category}</Text>
                  <Text style={styles.sub}>
                    {item.location} • {formatDate(item.date)}
                  </Text>
                </View>
              </View>

              <View>
                <Text
                  style={[
                    styles.amount,
                    { color: item.type === "expense" ? "#ff7474" : "#79ff8a" },
                  ]}
                >
                  {item.type === "expense" ? "-" : "+"}₹{item.amount}
                </Text>
                <Text style={styles.sub}>
                  {item.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>

            </View>
          ))
        )}

      </ScrollView>

      {/* TABS */}
      <View style={styles.tabBar}>
        {["Daily", "Weekly", "Monthly", "Yearly"].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tabItem,
              activeTab === tab && styles.activeTab,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 15,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },

  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },

  noData: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
  },

  row: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  left: { flexDirection: "row", alignItems: "center" },

  iconBox: {
    backgroundColor: colors.border,
    padding: 10,
    borderRadius: 40,
    marginRight: 10,
  },

  category: { color: colors.text, fontSize: 16, fontWeight: "600" },

  sub: { color: colors.muted, fontSize: 12 },

  amount: { fontSize: 16, fontWeight: "700", textAlign: "right" },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: "space-around",
  },

  tabItem: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },

  tabText: { color: colors.text, fontSize: 15 },

  activeTab: { backgroundColor: colors.gold },

  activeTabText: { color: "#000", fontWeight: "700" },
});
