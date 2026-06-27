import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";
import { supabase } from "../lib/supabase";
import {
  buildBudgetInsights,
  loadBudgetNotificationContext,
  parseStoredDate,
} from "../util/budgetInsights";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatPeriod(period) {
  return (period || "monthly").replace(/^./, (value) => value.toUpperCase());
}

function getBudgetStatus(progress) {
  if (progress >= 1) return { label: "Over", color: "#ef7d7d" };
  if (progress >= 0.9) return { label: "Watch", color: "#ffb85c" };
  return { label: "Good", color: "#4cb46e" };
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function getLastThreeMonthsSeries({ budget, transactions, now = new Date() }) {
  const categoryIds = new Set(
    (budget?.budget_categories || [])
      .map((item) => item.category_id || item.categories?.id)
      .filter(Boolean)
  );

  if (budget?.category_id) {
    categoryIds.add(budget.category_id);
  }

  const monthStarts = Array.from({ length: 3 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 2 + index, 1));
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthStart = monthStarts[0];

  const matchedTransactions = (transactions || []).filter((transaction) => {
    if (transaction.type !== "expense") {
      return false;
    }

    const txDate = parseStoredDate(transaction.date);
    if (txDate < monthStart || txDate > monthEnd) {
      return false;
    }

    if ((budget?.budget_type || "category") === "overall") {
      return true;
    }

    return categoryIds.has(transaction.category_id);
  });

  const series = monthStarts.map((date) => ({
    key: getMonthKey(date),
    label: getMonthLabel(date),
    value: 0,
  }));

  matchedTransactions.forEach((transaction) => {
    const txDate = parseStoredDate(transaction.date);
    const txKey = getMonthKey(txDate);
    const bucket = series.find((item) => item.key === txKey);

    if (bucket) {
      bucket.value += Number(transaction.amount || 0);
    }
  });

  return series;
}

export default function BudgetDetailsScreen({ navigation, route }) {
  const routeBudget = route?.params?.budget || null;
  const budgetId = routeBudget?.id || route?.params?.budgetId || null;
  const [budget, setBudget] = useState(routeBudget);
  const [loading, setLoading] = useState(!routeBudget);
  const [savingHomeState, setSavingHomeState] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [insight, setInsight] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);

  const loadBudget = useCallback(async () => {
    if (!budgetId) {
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

      const [budgetResult, context] = await Promise.all([
        supabase
          .from("budgets")
          .select(`
            id,
            name,
            amount,
            spent,
            period,
            color,
            mode,
            budget_type,
            notes,
            category_id,
            show_on_home,
            budget_categories (
              category_id,
              categories (
                id,
                name,
                icon,
                color
              )
            )
          `)
          .eq("id", budgetId)
          .eq("user_id", user.id)
          .maybeSingle(),
        loadBudgetNotificationContext(user.id),
      ]);

      if (budgetResult.error) {
        throw budgetResult.error;
      }

      const nextBudget = budgetResult.data || null;
      setBudget(nextBudget);
      setRecentTransactions(context.transactions || []);

      const insights = buildBudgetInsights({
        ...context,
        budgets: nextBudget ? [nextBudget] : [],
      });
      setInsight(insights[0] || null);
    } catch (error) {
      console.warn("Could not load budget details:", error.message);
      Alert.alert("Error", error.message || "Could not load budget details.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [budgetId, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadBudget();
    }, [loadBudget])
  );

  useEffect(() => {
    let isMounted = true;
    let channel;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted || !budgetId) {
        return;
      }

      channel = supabase
        .channel(`budget-details-${budgetId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
          () => {
            loadBudget();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${user.id}` },
          () => {
            loadBudget();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${user.id}` },
          () => {
            loadBudget();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budget_categories" },
          () => {
            loadBudget();
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
  }, [budgetId, loadBudget]);

  const linkedCategories = useMemo(() => {
    return (
      budget?.budget_categories
        ?.map((item) => item.categories || null)
        .filter(Boolean) || []
    );
  }, [budget?.budget_categories]);

  const amount = Number(budget?.amount || 0);
  const spent = Number(insight?.liveSpent ?? budget?.spent ?? 0);
  const remaining = Math.max(amount - spent, 0);
  const progress = amount > 0 ? Math.min((insight?.progress ?? spent / amount), 1) : 0;
  const status = getBudgetStatus(progress);
  const showOnHome = Boolean(budget?.show_on_home);

  const handleToggleHome = async () => {
    if (!budget?.id || savingHomeState) {
      return;
    }

    setSavingHomeState(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      const nextValue = !showOnHome;
      const { error } = await supabase
        .from("budgets")
        .update({ show_on_home: nextValue })
        .eq("id", budget.id)
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }

      setBudget((current) => (current ? { ...current, show_on_home: nextValue } : current));
    } catch (error) {
      Alert.alert("Error", error.message || "Could not update budget visibility.");
    } finally {
      setSavingHomeState(false);
    }
  };

  const handleDelete = async () => {
    if (!budget?.id || deleting) {
      return;
    }

    Alert.alert("Delete budget?", "This will remove the budget and its category links.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
              throw new Error("You must be signed in.");
            }

            const { error } = await supabase
              .from("budgets")
              .delete()
              .eq("id", budget.id)
              .eq("user_id", user.id);

            if (error) {
              throw error;
            }

            navigation.goBack();
          } catch (error) {
            Alert.alert("Error", error.message || "Could not delete budget.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading && !budget) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!budget) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          Budget details
        </Text>

        <Pressable onPress={handleDelete} style={styles.headerIconButton} disabled={deleting}>
          <Feather name="trash-2" size={22} color="#ffb49a" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryLeft}>
              <View style={[styles.iconBadge, { backgroundColor: `${budget.color || "#ffb49a"}26` }]}>
                <MaterialCommunityIcons
                  name={linkedCategories[0]?.icon || (budget.budget_type === "overall" ? "wallet-outline" : "shape-outline")}
                  size={24}
                  color={budget.color || "#ffb49a"}
                />
              </View>
              <View style={styles.summaryTitleWrap}>
                <Text style={styles.summaryTitle}>{budget.name || "Budget"}</Text>
                <View style={styles.chipRow}>
                  <View style={styles.chip}><Text style={styles.chipText}>{formatPeriod(budget.period)}</Text></View>
                  <View style={styles.chip}><Text style={styles.chipText}>{budget.budget_type === "overall" ? "Overall" : "Category"}</Text></View>
                  <View style={[styles.chip, styles.chipAuto]}>
                    <MaterialCommunityIcons name="autorenew" size={14} color="#7bd0ff" />
                    <Text style={[styles.chipText, styles.chipTextAuto]}>{budget.mode === "manual" ? "Manual" : "Automatic"}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.statusPill, { backgroundColor: `${status.color}26` }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>{Math.round(progress * 100)}% Used</Text>
            <Text style={styles.progressValue}>
              {formatCurrency(spent)} of {formatCurrency(amount)}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%`, backgroundColor: budget.color || "#ffb49a" }]} />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue}>{formatCurrency(remaining)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.statValue}>{formatCurrency(spent)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.toggleCard}>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>Show Budget</Text>
            <Text style={styles.toggleSubtitle}>Track this budget on home screen</Text>
          </View>
          <Switch
            value={showOnHome}
            onValueChange={handleToggleHome}
            disabled={savingHomeState}
            trackColor={{ false: "#5a4a45", true: "#4e7b4e" }}
            thumbColor={showOnHome ? "#ffb49a" : "#d6c8c0"}
          />
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>Spending Trend</Text>
          <BudgetTrendChart budget={budget} transactions={recentTransactions} />
        </View>

        <View style={styles.breakdownCard}>
          <Text style={styles.cardTitle}>Category Breakdown</Text>
          {linkedCategories.length === 0 ? (
            <Text style={styles.emptyText}>No data</Text>
          ) : (
            linkedCategories.map((category) => (
              <View key={category.id} style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownIcon, { backgroundColor: `${category.color || budget.color || "#ffb49a"}22` }]}>
                    <MaterialCommunityIcons name={category.icon || "tag"} size={20} color={category.color || budget.color || "#ffb49a"} />
                  </View>
                  <Text style={styles.breakdownName}>{category.name || "Category"}</Text>
                </View>
                <Text style={styles.breakdownAmount}>
                  {formatCurrency(
                    linkedCategories.length ? Math.max(spent / linkedCategories.length, 0) : 0
                  )}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Pressable
        style={styles.editButton}
        onPress={() => navigation.navigate("UpdateBudget", { budget })}
      >
        <Feather name="edit-2" size={20} color="#2f1814" />
        <Text style={styles.editButtonText}>Edit</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function BudgetTrendChart({ budget, transactions }) {
  const bars = useMemo(() => {
    return getLastThreeMonthsSeries({
      budget,
      transactions: transactions || [],
    });
  }, [budget, transactions]);

  const budgetAmount = Number(budget?.amount || 0);
  const max = Math.max(budgetAmount, ...bars.map((bar) => bar.value), 1);

  return (
    <View style={styles.chartWrap}>
      <View style={styles.verticalChartWrap}>
        <View style={styles.verticalChartBody}>
          <View style={styles.verticalYAxis}>
            {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((tick) => (
              <Text key={tick} style={styles.verticalTick}>
                {formatCurrency(tick)}
              </Text>
            ))}
          </View>

          <View style={styles.verticalPlotArea}>
            <View style={styles.verticalGrid}>
              {[0, 1, 2, 3].map((line) => (
                <View key={line} style={styles.verticalGridLine} />
              ))}
              <View
                style={[
                  styles.verticalBudgetLine,
                  {
                    bottom: `${Math.max(0, Math.min(100, (budgetAmount / max) * 100))}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.verticalBarsRow}>
              {bars.map((bar) => (
                <View key={bar.key} style={styles.verticalBarColumn}>
                  <View style={styles.verticalBarTrack}>
                    <View
                      style={[
                        styles.verticalBarFill,
                        {
                          height: `${Math.max(0, (bar.value / max) * 100)}%`,
                          opacity: bar.value > 0 ? 1 : 0,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.verticalBarValue}>{formatCurrency(bar.value)}</Text>
                  <Text style={styles.verticalBarLabel}>{bar.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <Text style={styles.chartAxisLabel}>Months on X axis, budget amount on Y axis</Text>
      </View>
    </View>
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
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  summaryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  summaryLeft: { flexDirection: "row", alignItems: "flex-start", flex: 1, paddingRight: 10 },
  iconBadge: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
  summaryTitleWrap: { flex: 1 },
  summaryTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#5a4140", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  chipAuto: { backgroundColor: "#27435a" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  chipTextAuto: { color: "#7bd0ff" },
  statusPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  statusText: { fontSize: 14, fontWeight: "800" },
  progressHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 },
  progressLabel: { color: colors.text, fontSize: 16, fontWeight: "800" },
  progressValue: { color: "#cdbab2", fontSize: 14, fontWeight: "700" },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "#5b433c", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  statBlock: { flex: 1 },
  statLabel: { color: "#cdbab2", fontSize: 14, marginBottom: 6, fontWeight: "700" },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  statDivider: { width: 1, height: 42, backgroundColor: "#5b433c", marginHorizontal: 14 },
  toggleCard: {
    backgroundColor: "#4d3b38",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleCopy: { flex: 1, paddingRight: 12 },
  toggleTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  toggleSubtitle: { color: "#d2c3bb", fontSize: 13, fontWeight: "600" },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  breakdownCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 14 },
  chartWrap: { minHeight: 220 },
  verticalChartWrap: { gap: 10 },
  verticalChartBody: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 220,
  },
  verticalYAxis: {
    width: 78,
    justifyContent: "space-between",
    paddingRight: 10,
    paddingBottom: 30,
  },
  verticalTick: {
    color: "#d5c8be",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  verticalPlotArea: {
    flex: 1,
    position: "relative",
    paddingBottom: 4,
  },
  verticalGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingBottom: 34,
  },
  verticalGridLine: {
    height: 1,
    backgroundColor: "#5b433c",
    opacity: 0.7,
  },
  verticalBudgetLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#7bd0ff",
    opacity: 0.9,
  },
  verticalBarsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 18,
  },
  verticalBarColumn: {
    width: 72,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  verticalBarTrack: {
    width: 24,
    height: 140,
    borderRadius: 999,
    backgroundColor: "#5b433c",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  verticalBarFill: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#ffb49a",
  },
  verticalBarValue: {
    marginTop: 10,
    color: "#d5c8be",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  verticalBarLabel: {
    marginTop: 4,
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  chartAxisLabel: {
    color: "#d5c8be",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  breakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  breakdownLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
  breakdownIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 12 },
  breakdownName: { color: colors.text, fontSize: 18, fontWeight: "800", flex: 1 },
  breakdownAmount: { color: "#d5c8be", fontSize: 16, fontWeight: "800" },
  emptyText: { color: "#d5c8be", fontSize: 14, fontWeight: "600" },
  editButton: {
    position: "absolute",
    right: 18,
    bottom: 20,
    backgroundColor: "#ffb49a",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  editButtonText: { color: "#2f1814", fontSize: 18, fontWeight: "800" },
});
