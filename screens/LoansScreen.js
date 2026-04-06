import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { getDuePendingLoans } from "../util/loanSettlement";

const LOAN_TABS = [
  { key: "lending", label: "Lending" },
  { key: "borrowing", label: "Borrow" },
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function LoansScreen({ navigation }) {
  const [loans, setLoans] = useState([]);
  const [dueLoanIds, setDueLoanIds] = useState([]);
  const [activeTab, setActiveTab] = useState("lending");

  const fetchLoans = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoans([]);
      setDueLoanIds([]);
      return;
    }

    const [{ data }, dueLoans] = await Promise.all([
      supabase
        .from("loans")
        .select("id,name,amount,type,start_date,end_date,description,status,settled_at")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false }),
      getDuePendingLoans(user.id),
    ]);

    setLoans(data || []);
    setDueLoanIds((dueLoans || []).map((loan) => loan.id));
  }, []);

  useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

  const filteredLoans = useMemo(
    () => loans.filter((loan) => (loan.type || "lending") === activeTab),
    [activeTab, loans]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Loans" />
      {filteredLoans.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="credit-card" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No {activeTab === "lending" ? "lending" : "borrow"} loans found</Text>
          <Text style={styles.emptySubtitle}>
            {loans.length === 0
              ? "You have not added any loans yet. Tap the + button to add your first loan."
              : `No ${activeTab === "lending" ? "lending" : "borrow"} loans in this tab yet.`}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {filteredLoans.map((loan) => (
            <Pressable
              key={loan.id}
              style={styles.card}
              onPress={() => navigation.navigate("UpdateLoan", { loan })}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{loan.name || "Loan"}</Text>
                <View style={styles.pillStack}>
                  <View style={[styles.typePill, loan.type === "borrowing" && styles.typePillBorrowing]}>
                    <Text style={styles.typeText}>{loan.type === "borrowing" ? "Borrowing" : "Lending"}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      dueLoanIds.includes(loan.id) && styles.statusPillDue,
                      loan.status === "settled" && styles.statusPillSettled,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {loan.status === "settled" ? "Settled" : dueLoanIds.includes(loan.id) ? "Due now" : "Pending"}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={styles.cardAmount}>{formatCurrency(loan.amount)}</Text>
              {loan.description ? <Text style={styles.cardDescription}>{loan.description}</Text> : null}
              <Text style={styles.cardMeta}>{loan.start_date || "-"} to {loan.end_date || "-"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.tabBar}>
        {LOAN_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabItem, activeTab === tab.key && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FloatingButton onPress={() => navigation.navigate("AddLoan")} style={styles.fabLifted} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", marginTop: 8, lineHeight: 28, fontSize: 16 },
  listContent: { paddingTop: 12, paddingBottom: 160 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1, marginRight: 10 },
  pillStack: { alignItems: "flex-end", gap: 8 },
  typePill: { backgroundColor: "#6b681c", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  typePillBorrowing: { backgroundColor: "#7a4d37" },
  typeText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  statusPill: { backgroundColor: "#4c342d", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  statusPillDue: { backgroundColor: "#8c5f2f" },
  statusPillSettled: { backgroundColor: "#255236" },
  statusText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  cardAmount: { color: "#ffb49a", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  cardDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  cardMeta: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: "row",
    backgroundColor: "#261813",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 188, 0.08)",
    padding: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: "center",
  },
  tabText: {
    color: "#ead7cd",
    fontSize: 15,
    fontWeight: "700",
  },
  activeTab: {
    backgroundColor: colors.gold,
  },
  activeTabText: {
    color: "#2a1812",
  },
  fabLifted: {
    bottom: 96,
  },
});
