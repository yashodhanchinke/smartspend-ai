import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";
import { supabase } from "../lib/supabase";
import { settleLoan } from "../util/loanSettlement";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDaysLeft(endDate) {
  if (!endDate) return "No due date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return "Due today";
  if (diff === 1) return "1 day left";
  if (diff > 1) return `${diff} days left`;
  return `${Math.abs(diff)} days overdue`;
}

export default function LoanDetailsScreen({ navigation, route }) {
  const loanId = route?.params?.loanId || route?.params?.loan?.id || null;
  const [loan, setLoan] = useState(route?.params?.loan || null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(!route?.params?.loan);
  const [markingDone, setMarkingDone] = useState(false);

  const loadLoan = useCallback(async () => {
    if (!loanId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      const [loanResult, txResult] = await Promise.all([
        supabase
          .from("loans")
          .select("id,name,amount,type,start_date,end_date,description,status,settled_at")
          .eq("id", loanId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("id,title,amount,type,date,time,description,account_id,accounts(name)")
          .eq("user_id", user.id)
          .eq("loan_id", loanId)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (loanResult.error) {
        throw loanResult.error;
      }

      if (txResult.error) {
        throw txResult.error;
      }

      setLoan(loanResult.data || null);
      setTransactions(txResult.data || []);
    } catch (error) {
      console.warn("Could not load loan details:", error.message);
      Alert.alert("Error", error.message || "Could not load loan details.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [loanId, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadLoan();
    }, [loadLoan])
  );

  useEffect(() => {
    let channel;
    let isMounted = true;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !loanId || !isMounted) {
        return;
      }

      channel = supabase
        .channel(`loan-details-${loanId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
          () => {
            loadLoan();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${user.id}` },
          () => {
            loadLoan();
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
  }, [loanId, loadLoan]);

  const amount = Number(loan?.amount || 0);
  const paid = useMemo(() => {
    return transactions.reduce((sum, item) => {
      if (loan?.type === "borrowing" && item.type !== "expense") {
        return sum;
      }

      if (loan?.type === "lending" && item.type !== "income") {
        return sum;
      }

      return sum + Math.abs(Number(item.amount || 0));
    }, 0);
  }, [loan?.type, transactions]);
  const progress = amount > 0 ? Math.min(paid / amount, 1) : 0;
  const isSettled = loan?.status === "settled";
  const isBorrowing = loan?.type === "borrowing";

  const handleMarkDone = async () => {
    if (!loan?.id || isSettled || markingDone) {
      return;
    }

    setMarkingDone(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      await settleLoan({ loan, userId: user.id });
      await loadLoan();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not mark this loan as done.");
    } finally {
      setMarkingDone(false);
    }
  };

  const handleAddPayment = () => {
    if (!loan?.id) return;

    navigation.navigate("AddTransaction", {
      loanId: loan.id,
      loanTransactionType: isBorrowing ? "expense" : "income",
      returnTab: "Loans",
    });
  };

  if (loading && !loan) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!loan) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {loan.name || "Loan"}
        </Text>

        <Pressable onPress={() => navigation.navigate("UpdateLoan", { loan })} style={styles.headerIconButton}>
          <Feather name="edit-2" size={22} color="#ffb49a" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroPill, loan.type === "borrowing" && styles.heroPillBorrowing]}>
              <MaterialCommunityIcons
                name={loan.type === "borrowing" ? "arrow-down-bold" : "arrow-up-bold"}
                size={16}
                color={loan.type === "borrowing" ? "#ffb49a" : colors.gold}
              />
              <Text style={styles.heroPillText}>{isBorrowing ? "Borrowing" : "Lending"}</Text>
            </View>
            <View style={[styles.heroPill, styles.heroPillDue]}>
              <Feather name="clock" size={14} color="#ffb49a" />
              <Text style={styles.heroPillText}>{formatDaysLeft(loan.end_date)}</Text>
            </View>
          </View>

          <Text style={styles.heroAmountLabel}>Amount {isBorrowing ? "Borrowed" : "Lent"}</Text>
          <Text style={styles.heroAmount}>{formatCurrency(amount)}</Text>
        </View>

        <View style={styles.progressCard}>
          <Text style={styles.sectionTitle}>Repayment Progress</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.progressStats}>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Paid</Text>
              <Text style={styles.progressStatValue}>{formatCurrency(paid)}</Text>
            </View>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Amount</Text>
              <Text style={styles.progressStatValue}>{formatCurrency(amount)}</Text>
            </View>
            <View style={styles.progressStat}>
              <Text style={styles.progressStatLabel}>Total</Text>
              <Text style={styles.progressStatValue}>{formatCurrency(amount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Loan Details</Text>
          <View style={styles.detailRow}>
            <Feather name="user" size={18} color="#d7c5bb" />
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>{isBorrowing ? "Borrowed from" : "Lent to"}</Text>
              <Text style={styles.detailValue}>Not specified</Text>
            </View>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Feather name="calendar" size={18} color="#d7c5bb" />
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Start date</Text>
              <Text style={styles.detailValue}>{formatDate(loan.start_date)}</Text>
            </View>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Feather name="calendar" size={18} color="#d7c5bb" />
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>End date</Text>
              <Text style={styles.detailValue}>{formatDate(loan.end_date)}</Text>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.doneButton, isSettled && styles.doneButtonDisabled]}
          onPress={handleMarkDone}
          disabled={isSettled || markingDone}
        >
          <Feather name="check" size={22} color={isSettled ? "#7a6f67" : "#2f1814"} />
          <Text style={[styles.doneButtonText, isSettled && styles.doneButtonTextDisabled]}>
            {markingDone ? "Saving..." : isSettled ? "Done" : "Mark as Done"}
          </Text>
        </Pressable>

        <View style={styles.historyHeaderRow}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          <Pressable style={styles.addPaymentButton} onPress={handleAddPayment}>
            <Feather name="plus" size={18} color="#2f1814" />
            <Text style={styles.addPaymentText}>Add Payment</Text>
          </Pressable>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="cash-off" size={54} color="#ffb49a" />
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptySubtitle}>Add a payment to track your progress</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {transactions.map((item) => (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons
                    name={item.type === "income" ? "arrow-down-bold" : "arrow-up-bold"}
                    size={18}
                    color="#ffb49a"
                  />
                </View>
                <View style={styles.historyCopy}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.title || "Payment"}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {formatDate(item.date)} {item.time ? `• ${item.time}` : ""}
                  </Text>
                </View>
                <Text style={styles.historyAmount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerIconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: colors.text, fontSize: 22, fontWeight: "800", marginHorizontal: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 18 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#635415",
  },
  heroPillBorrowing: { backgroundColor: "#683f33" },
  heroPillDue: { backgroundColor: "#8c4f2d" },
  heroPillText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  heroAmountLabel: { color: "#d7c5bb", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  heroAmount: { color: "#f5dc9d", fontSize: 38, fontWeight: "900" },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 12 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "#5b433c", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#ffb49a" },
  progressStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  progressStat: { flex: 1 },
  progressStatLabel: { color: "#d7c5bb", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  progressStatValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailCopy: { flex: 1 },
  detailLabel: { color: "#d7c5bb", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  detailValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  detailDivider: { height: 1, backgroundColor: "#5b433c", marginVertical: 14 },
  doneButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneButtonDisabled: { backgroundColor: "#403733" },
  doneButtonText: { color: "#2f1814", fontSize: 16, fontWeight: "900" },
  doneButtonTextDisabled: { color: "#7a6f67" },
  historyHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addPaymentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffb49a",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addPaymentText: { color: "#2f1814", fontSize: 14, fontWeight: "900" },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "#4a332d",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 14 },
  emptySubtitle: { color: "#d7c5bb", fontSize: 14, fontWeight: "600", marginTop: 8, textAlign: "center" },
  historyList: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4a332d",
    gap: 12,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5b433c",
  },
  historyCopy: { flex: 1 },
  historyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  historyMeta: { color: "#d7c5bb", fontSize: 12, fontWeight: "600", marginTop: 4 },
  historyAmount: { color: "#ffb49a", fontSize: 15, fontWeight: "900" },
});
