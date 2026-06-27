import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { getDuePendingLoans } from "../util/loanSettlement";

const LOAN_TABS = [
  { key: "lending", label: "Lending" },
  { key: "borrowing", label: "Borrowing" },
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function getNetLoanBalance(lendingTotal, borrowingTotal) {
  return lendingTotal - borrowingTotal;
}

export default function LoansScreen({ navigation }) {
  const [loans, setLoans] = useState([]);
  const [dueLoanIds, setDueLoanIds] = useState([]);
  const [activeTab, setActiveTab] = useState("lending");

  const fetchLoans = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

  useFocusEffect(
    useCallback(() => {
      fetchLoans();
    }, [fetchLoans])
  );

  useEffect(() => {
    let isMounted = true;
    let channel;

    const subscribe = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const sessionUser = session?.user?.id || null;

      if (!sessionUser || !isMounted) {
        return;
      }

      channel = supabase
        .channel(`loans-screen-${sessionUser}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${sessionUser}` },
          () => {
            fetchLoans();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${sessionUser}` },
          () => {
            fetchLoans();
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchLoans]);

  const filteredLoans = useMemo(
    () => loans.filter((loan) => (loan.type || "lending") === activeTab),
    [activeTab, loans]
  );

  const lendingTotal = useMemo(
    () => loans.filter((loan) => loan.type === "lending").reduce((sum, loan) => sum + Number(loan.amount || 0), 0),
    [loans]
  );
  const borrowingTotal = useMemo(
    () => loans.filter((loan) => loan.type === "borrowing").reduce((sum, loan) => sum + Number(loan.amount || 0), 0),
    [loans]
  );
  const netBalance = getNetLoanBalance(lendingTotal, borrowingTotal);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Loans" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryColumns}>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Lending</Text>
              <Text style={[styles.summaryAmount, styles.summaryLending]}>{formatCurrency(lendingTotal)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Borrowing</Text>
              <Text style={[styles.summaryAmount, styles.summaryBorrowing]}>{formatCurrency(borrowingTotal)}</Text>
            </View>
          </View>

          <View style={styles.summaryBottom}>
            <View>
              <Text style={styles.summaryBottomLabel}>Net Loan Balance</Text>
              <Text style={styles.summaryBottomCaption}>
                {netBalance >= 0 ? "You're owed more than you owe" : "You owe more than you are owed"}
              </Text>
            </View>
            <Text style={[styles.netValue, netBalance >= 0 ? styles.netPositive : styles.netNegative]}>
              {formatCurrency(Math.abs(netBalance))}
            </Text>
          </View>
        </View>

        {filteredLoans.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Feather name="credit-card" size={72} color="#ead5d0" />
            <Text style={styles.emptyTitle}>No loans</Text>
            <Text style={styles.emptySubtitle}>
              Add a loan to view it here
            </Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filteredLoans.map((loan) => {
              const isDue = dueLoanIds.includes(loan.id);
              const isSettled = loan.status === "settled";
              const isBorrowing = loan.type === "borrowing";

              return (
                <Pressable
                  key={loan.id}
                  style={styles.card}
                  onPress={() => navigation.navigate("LoanDetails", { loanId: loan.id, loan })}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle}>{loan.name || "Loan"}</Text>
                      <View style={styles.cardMetaRow}>
                        <View style={[styles.typePill, isBorrowing && styles.typePillBorrowing]}>
                          <Text style={styles.pillText}>{isBorrowing ? "Borrowing" : "Lending"}</Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            isSettled && styles.statusSettled,
                            isDue && !isSettled && styles.statusDue,
                          ]}
                        >
                          <Text style={styles.pillText}>
                            {isSettled ? "Settled" : isDue ? "Due now" : "Pending"}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={22} color="#d8c9c0" />
                  </View>

                  <Text style={styles.cardAmount}>{formatCurrency(loan.amount)}</Text>
                  <Text style={styles.cardMeta}>
                    {loan.start_date || "-"} to {loan.end_date || "-"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

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
  scrollContent: { paddingTop: 12, paddingBottom: 160 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
    marginBottom: 18,
  },
  summaryColumns: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#4a332d",
  },
  summaryColumn: { flex: 1 },
  summaryDivider: { width: 1, height: 44, backgroundColor: "#4a332d", marginHorizontal: 12 },
  summaryLabel: { color: "#d8c9c0", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  summaryAmount: { fontSize: 24, fontWeight: "900" },
  summaryLending: { color: "#ef5b56" },
  summaryBorrowing: { color: "#59b45a" },
  summaryBottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 14 },
  summaryBottomLabel: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  summaryBottomCaption: { color: "#c7b6ad", fontSize: 13, fontWeight: "600" },
  netValue: { fontSize: 20, fontWeight: "900" },
  netPositive: { color: "#59b45a" },
  netNegative: { color: "#ef5b56" },
  listWrap: { gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardTitleWrap: { flex: 1, paddingRight: 12 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 10 },
  cardMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typePill: { backgroundColor: "#635615", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  typePillBorrowing: { backgroundColor: "#704638" },
  statusPill: { backgroundColor: "#4c342d", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusDue: { backgroundColor: "#8c5f2f" },
  statusSettled: { backgroundColor: "#255236" },
  pillText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  cardAmount: { color: "#ffb49a", fontSize: 24, fontWeight: "900", marginTop: 12, marginBottom: 8 },
  cardMeta: { color: "#d0c1b8", fontSize: 13, fontWeight: "600" },
  emptyWrapper: { flex: 1, minHeight: 340, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", marginTop: 8, lineHeight: 28, fontSize: 16 },
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
