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
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const INSIGHT_TABS = ["Daily", "Weekly", "Monthly", "Yearly"];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function getSignedTransactionAmount(transaction) {
  const amount = Number(transaction?.amount || 0);

  if (transaction?.type === "expense") {
    return -amount;
  }

  if (transaction?.type === "income") {
    return amount;
  }

  return 0;
}

function parseStoredDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function toStartOfDay(value) {
  const date = value instanceof Date ? new Date(value) : parseStoredDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getWeekStart(value) {
  const date = toStartOfDay(value);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

function isSameDay(left, right) {
  return toStartOfDay(left).getTime() === toStartOfDay(right).getTime();
}

function isWithinCurrentWeek(value) {
  const today = toStartOfDay(new Date());
  const start = getWeekStart(today);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const current = toStartOfDay(value);
  return current >= start && current <= end;
}

function isWithinCurrentMonth(value) {
  const today = toStartOfDay(new Date());
  const current = toStartOfDay(value);
  return (
    current.getFullYear() === today.getFullYear() &&
    current.getMonth() === today.getMonth()
  );
}

function isWithinCurrentYear(value) {
  const today = toStartOfDay(new Date());
  return toStartOfDay(value).getFullYear() === today.getFullYear();
}

function getSectionTitle(tab, date) {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return current.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  if (tab === "Weekly") {
    const start = getWeekStart(current);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startMonth = start.toLocaleDateString("en-US", { month: "short" });
    const endMonth = end.toLocaleDateString("en-US", { month: "short" });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
    }

    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
  }

  if (tab === "Monthly") {
    return current.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  return current.getFullYear().toString();
}

function getGroupKey(tab, date) {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return `D:${formatCompactDate(current)}`;
  }

  if (tab === "Weekly") {
    return `W:${formatCompactDate(getWeekStart(current))}`;
  }

  if (tab === "Monthly") {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    return `M:${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  }

  return `Y:${current.getFullYear()}`;
}

function formatCompactDate(value) {
  return toStartOfDay(value).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function getTransactionDateLabel(value) {
  const today = toStartOfDay(new Date());
  const current = toStartOfDay(value);

  if (isSameDay(today, current)) {
    return "Today";
  }

  return current.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getGoalProgress(goal) {
  const target = Number(goal?.target_amount || 0);
  const current = Number(goal?.current_amount || 0);
  if (target <= 0) return 0;
  return Math.max(Math.min(current / target, 1), 0);
}

function getGoalRemaining(goal) {
  return Math.max(Number(goal?.target_amount || 0) - Number(goal?.current_amount || 0), 0);
}

function getGoalDayStats(goal, currentAmount = Number(goal?.current_amount || 0)) {
  const start = goal?.start_date ? toStartOfDay(goal.start_date) : null;
  const end = goal?.end_date ? toStartOfDay(goal.end_date) : null;
  const today = toStartOfDay(new Date());

  if (!start || !end) {
    return { daysLeft: 0, totalDays: 0, dailyTarget: 0 };
  }

  const totalDays = Math.max(Math.floor((end - start) / 86400000) + 1, 1);
  const daysLeft = Math.max(Math.floor((end - today) / 86400000) + 1, 0);
  const remaining = Math.max(Number(goal?.target_amount || 0) - Number(currentAmount || 0), 0);
  const dailyTarget = daysLeft > 0 ? remaining / daysLeft : 0;

  return { daysLeft, totalDays, dailyTarget };
}

export default function GoalDetailsScreen({ navigation }) {
  const route = useRoute();
  const routeGoal = route?.params?.goal || null;
  const [goal, setGoal] = useState(routeGoal);
  const [transactions, setTransactions] = useState([]);
  const [insightTab, setInsightTab] = useState("Weekly");
  const [loading, setLoading] = useState(true);

  const fetchGoalDetails = useCallback(async () => {
    const goalId = routeGoal?.id || route?.params?.goalId || null;
    if (!goalId) {
      setGoal(routeGoal);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setGoal(null);
        setTransactions([]);
        return;
      }

      const [{ data: goalData, error: goalError }, { data: txData, error: txError }] =
        await Promise.all([
          supabase
            .from("goals")
            .select("id,title,target_amount,current_amount,start_date,end_date,color")
            .eq("user_id", user.id)
            .eq("id", goalId)
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
              account_id,
              goal_id,
              accounts(name),
              categories(name,color,icon)
            `)
            .eq("user_id", user.id)
            .eq("goal_id", goalId)
            .order("date", { ascending: false })
            .order("time", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

      if (goalError) throw goalError;
      if (txError) throw txError;

      setGoal(goalData || routeGoal);
      setTransactions(txData || []);
    } catch (error) {
      console.warn("Could not load goal details:", error.message);
      setGoal(routeGoal);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [route, routeGoal]);

  useFocusEffect(
    useCallback(() => {
      fetchGoalDetails();
    }, [fetchGoalDetails])
  );

  useEffect(() => {
    setInsightTab("Weekly");
  }, [goal?.id]);

  const target = Number(goal?.target_amount || 0);
  const savedAmount = useMemo(
    () =>
      transactions.length
        ? transactions.reduce((sum, transaction) => sum + getSignedTransactionAmount(transaction), 0)
        : Number(goal?.current_amount || 0),
    [goal?.current_amount, transactions]
  );
  const progress = getGoalProgress({ target_amount: target, current_amount: savedAmount });
  const remaining = getGoalRemaining({ target_amount: target, current_amount: savedAmount });
  const dayStats = getGoalDayStats(goal, savedAmount);
  const isCompleted = progress >= 1;
  const periodTransactions = useMemo(() => {
    const source = [...transactions];

    return source.filter((transaction) => {
      if (insightTab === "Daily") {
        return isSameDay(transaction.date, new Date());
      }

      if (insightTab === "Weekly") {
        return isWithinCurrentWeek(transaction.date);
      }

      if (insightTab === "Monthly") {
        return isWithinCurrentMonth(transaction.date);
      }

      return isWithinCurrentYear(transaction.date);
    });
  }, [insightTab, transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map();

    periodTransactions.forEach((transaction) => {
      const key = getGroupKey(insightTab, transaction.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: toStartOfDay(transaction.date),
          title: getSectionTitle(insightTab, transaction.date),
          items: [],
          total: 0,
        });
      }

      const group = groups.get(key);
      group.items.push(transaction);
      group.total += getSignedTransactionAmount(transaction);
    });

    return Array.from(groups.values()).sort((left, right) => right.date - left.date);
  }, [insightTab, periodTransactions]);

  const totalTransactionCount = transactions.length;

  const handleDeleteGoal = useCallback(() => {
    if (!goal?.id) {
      return;
    }

    Alert.alert(`Delete ${goal.title || "goal"}?`, "This goal will be removed.", [
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

          const { error } = await supabase.from("goals").delete().eq("id", goal.id).eq("user_id", user.id);
          if (error) {
            Alert.alert("Error", error.message);
            return;
          }

          navigation.goBack();
        },
      },
    ]);
  }, [goal, navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Feather name="arrow-left" size={28} color={colors.text} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Goal Details</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.iconAction} onPress={handleDeleteGoal}>
              <Feather name="trash-2" size={22} color="#ffb8ab" />
            </Pressable>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryLeft}>
              <View style={[styles.goalIcon, { backgroundColor: `${goal?.color || "#ffb49a"}22` }]}>
                <MaterialCommunityIcons
                  name="flag-checkered"
                  size={26}
                  color={goal?.color || "#ffb49a"}
                />
              </View>
              <View style={styles.summaryTitleWrap}>
                <Text style={styles.summarySubtitle}>Saving Goal</Text>
                <Text style={styles.summaryTitle} numberOfLines={2}>
                  {goal?.title || "Goal"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.progressTopRow}>
            <Text style={styles.progressLeft}>{Math.round(progress * 100)}% completed</Text>
            <Text style={styles.progressRight}>
              {formatCurrency(savedAmount)} saved of {formatCurrency(target)}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(progress * 100, 3)}%`,
                  backgroundColor: goal?.color || "#ffb49a",
                },
              ]}
            />
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <View style={styles.metricLabelRow}>
                  <Feather name="calendar" size={18} color={goal?.color || colors.gold} />
                  <Text style={styles.metricLabel}>Started</Text>
                </View>
                <Text style={styles.metricValue}>{formatCompactDate(goal?.start_date)}</Text>
              </View>
              <View style={styles.metricCard}>
                <View style={styles.metricLabelRow}>
                  <Feather name="calendar" size={18} color={goal?.color || colors.gold} />
                  <Text style={styles.metricLabel}>End date</Text>
                </View>
                <Text style={styles.metricValue}>{formatCompactDate(goal?.end_date)}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <View style={styles.metricLabelRow}>
                  <Feather name="clock" size={18} color={goal?.color || colors.gold} />
                  <Text style={styles.metricLabel}>Remaining</Text>
                </View>
                <Text style={styles.metricValue}>
                  {dayStats.daysLeft > 0 ? `${dayStats.daysLeft} days left` : isCompleted ? "Done" : "Expired"}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <View style={styles.metricLabelRow}>
                  <Feather name="dollar-sign" size={18} color={goal?.color || colors.gold} />
                  <Text style={styles.metricLabel}>Still needed</Text>
                </View>
                <Text style={styles.metricValue}>{formatCurrency(remaining)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.transactionsSection}>
          {loading ? (
            <Text style={styles.emptyTitle}>Loading goal data...</Text>
          ) : totalTransactionCount === 0 ? (
            <View style={styles.emptyStateCard}>
              <MaterialCommunityIcons name="cash-remove" size={54} color="#e2c9c1" />
              <Text style={styles.emptyTitle}>No transactions found</Text>
              <Text style={styles.emptySubtitle}>Add a transaction to view it here</Text>
            </View>
          ) : groupedTransactions.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <MaterialCommunityIcons name="cash-remove" size={54} color="#e2c9c1" />
              <Text style={styles.emptyTitle}>No transactions in this period</Text>
              <Text style={styles.emptySubtitle}>Try another tab to see more activity</Text>
            </View>
          ) : (
            <>
              <View style={styles.transactionsHeader}>
                <View>
                  <Text style={styles.cardTitle}>Transactions</Text>
                  <Text style={styles.insightCaption}>
                    {groupedTransactions.length} groups in {insightTab.toLowerCase()}
                  </Text>
                </View>
              </View>

              {groupedTransactions.map((group) => (
                <View key={group.key} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    <Text style={styles.groupTotal}>{formatCurrency(group.total)}</Text>
                  </View>
                  <View style={styles.groupCard}>
                    {group.items.map((item, index) => (
                      <TransactionListItem
                        key={item.id}
                        title={item.title || item.categories?.name || "Transaction"}
                        accountLabel={item.accounts?.name || "Account"}
                        dateLabel={getTransactionDateLabel(item.date)}
                        amount={item.amount}
                        time={item.time}
                        transactionType={item.type}
                        amountPrefix=""
                        categoryColor={item.categories?.color || goal?.color || colors.gold}
                        categoryIcon={item.categories?.icon || "cash"}
                        showDivider={index !== group.items.length - 1}
                        onPress={() =>
                          navigation.navigate("TransactionDetails", {
                          transaction: item,
                        })
                        }
                      />
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.floatingTabs}>
        {INSIGHT_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setInsightTab(tab)}
            style={[styles.groupTab, insightTab === tab && styles.groupTabActive]}
          >
            <Text style={[styles.groupTabText, insightTab === tab && styles.groupTabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.floatingEditButton}
        onPress={() => navigation.navigate("UpdateGoal", { goal })}
      >
        <Feather name="edit-2" size={20} color="#2f1814" />
        <Text style={styles.floatingEditText}>Edit</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 162,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconAction: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
    marginBottom: 16,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    paddingRight: 10,
  },
  goalIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  summaryTitleWrap: {
    flex: 1,
  },
  summarySubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  progressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  progressLeft: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  progressRight: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#5c4043",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  metricsGrid: {
    marginTop: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },
  metricRow: {
    flexDirection: "row",
  },
  metricCard: {
    flex: 1,
    minHeight: 92,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  emptyStateCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    marginBottom: 18,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  insightCaption: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  transactionsHeader: {
    marginBottom: 12,
  },
  groupTabs: {
    flexDirection: "row",
    backgroundColor: "#2d201b",
    borderRadius: 18,
    padding: 4,
  },
  floatingTabs: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: "row",
    backgroundColor: "#2d201b",
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  groupTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
  },
  groupTabActive: {
    backgroundColor: colors.gold,
  },
  groupTabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  groupTabTextActive: {
    color: "#2a130f",
  },
  emptyInner: {
    alignItems: "center",
    paddingVertical: 36,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
  groupSection: {
    marginBottom: 14,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  groupTotal: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    overflow: "hidden",
  },
  transactionsSection: {
    marginBottom: 18,
  },
  floatingEditButton: {
    position: "absolute",
    right: 16,
    bottom: 92,
    minWidth: 106,
    height: 58,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "#ffb49a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  floatingEditText: {
    color: "#2f1814",
    fontSize: 18,
    fontWeight: "800",
  },
});
