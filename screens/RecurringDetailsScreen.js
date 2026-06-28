import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import colors from "../theme/colors";
import { supabase } from "../lib/supabase";

function parseStoredDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getMonthlyEquivalent(amount, period) {
  const value = Number(amount || 0);

  if (period === "daily") return value * 30;
  if (period === "weekly") return value * 4.33;
  if (period === "quarterly") return value / 3;
  if (period === "yearly") return value / 12;

  return value;
}

function formatPeriod(period) {
  if (!period) return "Monthly";
  return period.charAt(0).toUpperCase() + period.slice(1);
}

function getDaysUntil(dateValue) {
  const date = parseStoredDate(dateValue);

  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function formatDaysUntil(days) {
  if (days == null) return "No next run";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day until next";
  if (days > 1) return `${days} days until next`;
  if (days === -1) return "1 day overdue";
  return `${Math.abs(days)} days overdue`;
}

function getPeriodBounds(referenceDate, period) {
  const base = parseStoredDate(referenceDate);

  if (!base) return null;

  const start = new Date(base);
  const end = new Date(base);

  if (period === "daily") {
    return { start, end };
  }

  if (period === "weekly") {
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  if (period === "monthly") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
    return { start, end };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    end.setMonth(quarterStartMonth + 3, 0);
    return { start, end };
  }

  if (period === "yearly") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
    return { start, end };
  }

  return { start, end };
}

function isWithinBounds(value, bounds) {
  if (!bounds) return true;

  const date = parseStoredDate(value);

  if (!date) return false;

  return date >= bounds.start && date <= bounds.end;
}

export default function RecurringDetailsScreen({ navigation }) {
  const route = useRoute();
  const recurringId = route?.params?.recurringId || route?.params?.recurring?.id || null;
  const routeRecurring = route?.params?.recurring || null;
  const [recurring, setRecurring] = useState(routeRecurring);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(!routeRecurring);

  const loadRecurring = useCallback(async () => {
    if (!recurringId) {
      setRecurring(routeRecurring);
      setHistory([]);
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

      const [recurringResult, transactionsResult] = await Promise.all([
        supabase
          .from("recurring_transactions")
          .select(`
            id,
            user_id,
            title,
            amount,
            type,
            period,
            next_run,
            account_id,
            category_id,
            accounts(name),
            categories(name,icon,color)
          `)
          .eq("id", recurringId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select(`
            id,
            title,
            amount,
            type,
            date,
            time,
            created_at,
            account_id,
            category_id,
            accounts(name),
            categories(name,icon,color)
          `)
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .order("time", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (recurringResult.error) throw recurringResult.error;
      if (transactionsResult.error) throw transactionsResult.error;

      const recurringData = recurringResult.data || routeRecurring;
      const recurringTitle = String(recurringData?.title || "").trim().toLowerCase();
      const recurringAmount = Number(recurringData?.amount || 0);
      const recurringType = recurringData?.type || "expense";
      const recurringAccountId = recurringData?.account_id || null;
      const recurringCategoryId = recurringData?.category_id || null;
      const periodBounds = getPeriodBounds(recurringData?.next_run, recurringData?.period);

      const matchedHistory = (transactionsResult.data || []).filter((transaction) => {
        const transactionTitle = String(transaction.title || "").trim().toLowerCase();
        const titleMatches =
          transactionTitle === recurringTitle ||
          (recurringTitle && transactionTitle.includes(recurringTitle)) ||
          (recurringTitle && recurringTitle.includes(transactionTitle));

        const amountMatches = Number(transaction.amount || 0) === recurringAmount;
        const typeMatches = (transaction.type || "expense") === recurringType;
        const accountMatches = !recurringAccountId || transaction.account_id === recurringAccountId;
        const categoryMatches =
          !recurringCategoryId || transaction.category_id === recurringCategoryId;
        const periodMatches = isWithinBounds(transaction.date, periodBounds);

        return titleMatches && amountMatches && typeMatches && accountMatches && categoryMatches && periodMatches;
      });

      setRecurring(recurringData || null);
      setHistory(matchedHistory);
    } catch (error) {
      console.warn("Could not load recurring details:", error.message);
      Alert.alert("Error", error.message || "Could not load recurring details.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, recurringId, routeRecurring]);

  useFocusEffect(
    useCallback(() => {
      loadRecurring();
    }, [loadRecurring])
  );

  useEffect(() => {
    let channel;
    let isMounted = true;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !recurringId || !isMounted) {
        return;
      }

      channel = supabase
        .channel(`recurring-details-${recurringId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${user.id}` },
          () => {
            loadRecurring();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
          () => {
            loadRecurring();
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
  }, [loadRecurring, recurringId]);

  const amount = Number(recurring?.amount || 0);
  const totalOccurrences = history.length;
  const totalValue = history.reduce((sum, item) => sum + Math.abs(Number(item.amount || 0)), 0);
  const monthlyAverage = getMonthlyEquivalent(recurring?.amount, recurring?.period);
  const nextRunDays = getDaysUntil(recurring?.next_run);
  const progress = useMemo(() => {
    const createdAt = recurring?.next_run ? parseStoredDate(recurring.next_run) : null;
    const nextRun = recurring?.next_run ? parseStoredDate(recurring.next_run) : null;

    if (!createdAt || !nextRun) {
      return 0;
    }

    const now = new Date();
    const total = nextRun.getTime() - createdAt.getTime();
    const elapsed = now.getTime() - createdAt.getTime();

    if (total <= 0) {
      return 0;
    }

    return Math.min(Math.max(elapsed / total, 0), 1);
  }, [recurring?.next_run]);

  const accountLabel = recurring?.accounts?.name || "Account";
  const categoryLabel = recurring?.categories?.name || "Category";
  const categoryIcon = recurring?.categories?.icon || "repeat";
  const categoryColor = recurring?.categories?.color || "#ffb49a";
  const frequencyLabel = formatPeriod(recurring?.period || "monthly");
  const startedOnLabel = recurring?.next_run ? formatShortDate(recurring.next_run) : "-";

  const handleDelete = useCallback(() => {
    if (!recurring?.id) return;

    Alert.alert("Delete recurring?", "This recurring transaction will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (!user) {
            return;
          }

          const { error } = await supabase
            .from("recurring_transactions")
            .delete()
            .eq("id", recurring.id)
            .eq("user_id", user.id);

          if (error) {
            Alert.alert("Error", error.message || "Could not delete recurring transaction.");
            return;
          }

          navigation.goBack();
        },
      },
    ]);
  }, [navigation, recurring?.id]);

  if (loading && !recurring) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loaderWrap}>
          <Text style={styles.loaderText}>Loading recurring...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recurring) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {recurring.title || "Recurring"}
        </Text>

        <View style={styles.headerActions}>
          <Pressable onPress={handleDelete} style={styles.headerIconButton}>
            <Feather name="trash-2" size={22} color="#ffb49a" />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleBlock}>
              <View style={styles.heroIconWrap}>
                <MaterialCommunityIcons name={categoryIcon} size={26} color={categoryColor} />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitleText} numberOfLines={2} ellipsizeMode="tail">
                  {recurring.title || "Recurring transaction"}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {frequencyLabel} • {recurring.type === "income" ? "Income" : "Expense"}
                </Text>
              </View>
            </View>
            <Text style={styles.heroAmount}>
              {formatCurrency(amount)}
            </Text>
          </View>

          <View style={styles.nextRow}>
            <Text style={styles.nextLabel}>Next Occurrence</Text>
            <Text style={styles.nextValue}>{recurring.next_run ? formatDate(recurring.next_run) : "-"}</Text>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <Text style={styles.progressText}>{formatDaysUntil(nextRunDays)}</Text>
        </View>

        <Text style={styles.sectionHeader}>Details</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="credit-card" size={18} color="#ffb49a" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Account</Text>
              <Text style={styles.detailValue}>{accountLabel}</Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <MaterialCommunityIcons name="shape-outline" size={18} color="#ffb49a" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{categoryLabel}</Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="calendar" size={18} color="#ffb49a" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Started On</Text>
              <Text style={styles.detailValue}>{startedOnLabel}</Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="repeat" size={18} color="#ffb49a" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Frequency</Text>
              <Text style={styles.detailValue}>{frequencyLabel}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeader}>Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Feather name="repeat" size={18} color="#ffe2d7" />
            </View>
            <Text style={styles.statValue}>{totalOccurrences}</Text>
            <Text style={styles.statLabel}>Total Occurrences</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Feather name="dollar-sign" size={18} color="#ffe2d7" />
            </View>
            <Text style={styles.statValue}>{formatCurrency(totalValue)}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Feather name="trending-down" size={18} color="#ffe2d7" />
            </View>
            <Text style={styles.statValue}>{formatCurrency(Math.abs(monthlyAverage))}</Text>
            <Text style={styles.statLabel}>Monthly Average</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>History</Text>
        {history.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Feather name="clock" size={40} color="#e6cbc0" />
            <Text style={styles.emptyTitle}>No matching history found</Text>
            <Text style={styles.emptySubtitle}>
              Add a transaction with the same recurring details to see it here.
            </Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {history.map((item, index) => (
              <TransactionListItem
                key={item.id}
                title={item.title || recurring.title || "Transaction"}
                accountLabel={item.accounts?.name || "Account"}
                amountPrefix={item.type === "expense" ? "-" : item.type === "income" ? "+" : ""}
                categoryColor={item.categories?.color || categoryColor}
                categoryIcon={item.categories?.icon || "repeat"}
                dateLabel={item.date ? formatShortDate(item.date) : "-"}
                amount={item.amount}
                time={item.time}
                transactionType={item.type}
                showDivider={index !== history.length - 1}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        style={styles.editFab}
        onPress={() => navigation.navigate("UpdateRecurring", { recurring })}
      >
        <Feather name="edit-2" size={20} color="#2f1814" />
        <Text style={styles.editFabText}>Edit</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    width: 42,
    height: 42,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 132,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  heroTitleBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#3a241f",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  heroTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  heroTitleText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  heroAmount: {
    color: "#ffb49a",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right",
    minWidth: 100,
  },
  nextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
  },
  nextLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  nextValue: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#5b3932",
    overflow: "hidden",
    marginTop: 12,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#ffb49a",
    borderRadius: 999,
  },
  progressText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },
  sectionHeader: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 14,
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3a241f",
    marginRight: 12,
  },
  detailCopy: {
    flex: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  detailDivider: {
    height: 1,
    backgroundColor: "#4f3831",
    marginVertical: 14,
    marginLeft: 50,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    minHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#4f3831",
    backgroundColor: colors.card,
    padding: 14,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4a3530",
    marginBottom: 18,
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  historyList: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#4f3831",
  },
  emptyHistory: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#4f3831",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  editFab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    backgroundColor: "#ffb49a",
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 10,
  },
  editFabText: {
    color: "#2f1814",
    fontSize: 18,
    fontWeight: "800",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
