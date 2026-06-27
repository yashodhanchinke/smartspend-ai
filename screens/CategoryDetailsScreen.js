import Feather from "@expo/vector-icons/Feather";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const INSIGHT_TABS = ["Daily", "Weekly", "Monthly", "Yearly"];
const TREND_TABS = ["month", "week"];

const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

const toStartOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : parseStoredDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getWeekStart = (value) => {
  const date = toStartOfDay(value);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
};

const getMonthStart = (value) => {
  const date = toStartOfDay(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getYearStart = (value) => {
  const date = toStartOfDay(value);
  return new Date(date.getFullYear(), 0, 1);
};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

const formatCompactMoney = (value) => {
  const amount = Number(value || 0);
  const prefix = amount < 0 ? "-" : "";
  return `${prefix}₹${Math.abs(amount).toFixed(2)}`;
};

const formatShortDate = (value) =>
  toStartOfDay(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatRelativeDate = (value) => {
  const today = toStartOfDay(new Date());
  const date = toStartOfDay(value);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
};

const getTransactionValue = (transaction) => Math.abs(Number(transaction?.amount || 0));

const buildMonthlyTrend = (transactions) => {
  const currentMonth = new Date();
  const months = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - offset, 1);
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    const total = transactions.reduce((sum, transaction) => {
      const transactionDate = toStartOfDay(transaction.date);
      const transactionKey = `${transactionDate.getFullYear()}-${String(
        transactionDate.getMonth() + 1
      ).padStart(2, "0")}`;

      return transactionKey === monthKey ? sum + getTransactionValue(transaction) : sum;
    }, 0);

    months.push({
      label: monthStart.toLocaleDateString("en-US", { month: "short" }),
      total,
    });
  }

  return months;
};

const buildWeeklyTrend = (transactions) => {
  const currentWeekStart = getWeekStart(new Date());
  const weeks = [];

  for (let offset = 3; offset >= 0; offset -= 1) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - offset * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const total = transactions.reduce((sum, transaction) => {
      const transactionDate = toStartOfDay(transaction.date);
      return transactionDate >= weekStart && transactionDate <= weekEnd
        ? sum + getTransactionValue(transaction)
        : sum;
    }, 0);

    weeks.push({
      label: weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      total,
    });
  }

  return weeks;
};

const formatSectionTitle = (tab, date) => {
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
    return current.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  return current.getFullYear().toString();
};

const getGroupKey = (tab, date) => {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return `D:${formatShortDate(current)}`;
  }

  if (tab === "Weekly") {
    const start = getWeekStart(current);
    return `W:${formatShortDate(start)}`;
  }

  if (tab === "Monthly") {
    const start = getMonthStart(current);
    return `M:${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }

  return `Y:${getYearStart(current).getFullYear()}`;
};

const getCountLabel = (count) => `${count} ${count === 1 ? "transaction" : "transactions"}`;

export default function CategoryDetailsScreen({ navigation }) {
  const route = useRoute();
  const { category } = route.params;
  const { width } = useWindowDimensions();

  const [transactions, setTransactions] = useState([]);
  const [trendTab, setTrendTab] = useState("month");
  const [insightTab, setInsightTab] = useState("Weekly");
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTransactions = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      setTransactions([]);
      return;
    }

    const [{ data, error }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `
          *,
          categories(name,color,icon)
        `
        )
        .eq("user_id", user.id)
        .eq("category_id", category.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

    if (error) {
      console.warn("Could not load category transactions:", error.message);
      setTransactions([]);
      return;
    }

    const accountMap = Object.fromEntries((accountRows || []).map((account) => [account.id, account]));

    setTransactions(
      (data || []).map((transaction) => ({
        ...transaction,
        account: accountMap[transaction.account_id] || null,
      }))
    );
  }, [category.id]);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  useEffect(() => {
    let channel;

    const subscribe = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      channel = supabase
        .channel(`category-details-${user.id}-${category.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchTransactions();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "accounts",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchTransactions();
          }
        )
        .on(
          "broadcast",
          { event: "refresh" },
          () => {
            fetchTransactions();
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [category.id, fetchTransactions]);

  const total = useMemo(
    () => transactions.reduce((sum, transaction) => sum + getTransactionValue(transaction), 0),
    [transactions]
  );

  const average = transactions.length ? total / transactions.length : 0;
  const largestTransaction = transactions.reduce(
    (largest, transaction) =>
      getTransactionValue(transaction) > getTransactionValue(largest)
        ? transaction
        : largest,
    transactions[0] || null
  );
  const latestTransaction = transactions[0] || null;

  const groupedTransactions = useMemo(() => {
    const groups = new Map();
    const orderedTransactions = [...transactions].sort((left, right) => {
      const dateDiff = toStartOfDay(right.date).getTime() - toStartOfDay(left.date).getTime();
      if (dateDiff !== 0) return dateDiff;

      return String(right.time || "").localeCompare(String(left.time || ""));
    });

    orderedTransactions.forEach((transaction) => {
      const key = getGroupKey(insightTab, transaction.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: toStartOfDay(transaction.date),
          title: formatSectionTitle(insightTab, transaction.date),
          total: 0,
          items: [],
        });
      }

      const group = groups.get(key);
      group.items.push(transaction);
      group.total += transaction.type === "income" ? getTransactionValue(transaction) : -getTransactionValue(transaction);
    });

    return Array.from(groups.values()).sort((left, right) => right.date - left.date);
  }, [insightTab, transactions]);

  const groupCount = transactions.length;
  const dailyAverage = groupCount ? total / groupCount : 0;

  const monthlyTrend = useMemo(() => buildMonthlyTrend(transactions), [transactions]);
  const weeklyTrend = useMemo(() => buildWeeklyTrend(transactions), [transactions]);
  const chartData = trendTab === "month" ? monthlyTrend : weeklyTrend;
  const chartValues = chartData.map((item) => item.total);
  const maxChartValue = Math.max(...chartValues, 0);
  const chartWidth = Math.max(width - 48, 300);
  const categoryColor = category.color || colors.gold;
  const categoryIcon = category.icon || "shape-outline";
  const titlePrefix = category.type === "income" ? "received" : "spent";
  const trendTitle =
    trendTab === "month"
      ? category.type === "income"
        ? "Monthly Earnings Trend"
        : "Monthly Spending Trend"
      : category.type === "income"
      ? "Recent Weekly Earnings"
      : "Recent Weekly Spending";

  const handleDeleteCategory = () => {
    if (isDeleting) return;

    Alert.alert(
      `Delete ${category.name}?`,
      "The category will be removed and its transactions will become uncategorized.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData?.user;

            if (!user) return;

            setIsDeleting(true);

            const { error: detachError } = await supabase
              .from("transactions")
              .update({ category_id: null })
              .eq("user_id", user.id)
              .eq("category_id", category.id);

            if (detachError) {
              setIsDeleting(false);
              Alert.alert("Error", detachError.message);
              return;
            }

            const { error: deleteError } = await supabase
              .from("categories")
              .delete()
              .eq("id", category.id)
              .eq("user_id", user.id);

            setIsDeleting(false);

            if (deleteError) {
              Alert.alert("Error", deleteError.message);
              return;
            }

            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Feather name="arrow-left" size={28} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {category.name}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconAction} onPress={handleDeleteCategory}>
              <Feather name="trash-2" size={22} color="#ffb8ab" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Category Overview</Text>
            <View style={[styles.categoryChip, { backgroundColor: `${categoryColor}22` }]}>
              <MaterialCommunityIcons name={categoryIcon} size={18} color={categoryColor} />
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricRow}>
              <View style={[styles.metricCard, styles.metricTopLeft]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="wallet-outline" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>
                    Total {category.type === "income" ? "received" : "spent"}
                  </Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(total)}</Text>
              </View>

              <View style={[styles.metricCard, styles.metricTopRight]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="receipt-text-outline" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Transactions</Text>
                </View>
                <Text style={styles.metricValue}>{transactions.length}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={[styles.metricCard, styles.metricBottomLeft]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="trending-up" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Average {titlePrefix}</Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(average)}</Text>
              </View>

              <View style={[styles.metricCard, styles.metricBottomRight]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="arrow-up-right" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Largest transaction</Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(getTransactionValue(largestTransaction))}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>{trendTitle}</Text>

            <View style={styles.segmentedToggle}>
              {TREND_TABS.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.segmentedButton, trendTab === tab && styles.segmentedButtonActive]}
                  onPress={() => setTrendTab(tab)}
                >
                  <MaterialCommunityIcons
                    name={tab === "month" ? "calendar-month" : "view-week"}
                    size={22}
                    color={trendTab === tab ? "#2c1e1a" : colors.text}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {maxChartValue > 0 ? (
            <LineChart
              data={{
                labels: chartData.map((item) => item.label),
                datasets: [{ data: chartValues }],
              }}
              width={chartWidth}
              height={240}
              fromZero
              bezier
              withDots
              withInnerLines
              withOuterLines={false}
              withVerticalLabels
              withHorizontalLabels
              chartConfig={{
                backgroundColor: colors.card,
                backgroundGradientFrom: colors.card,
                backgroundGradientTo: colors.card,
                decimalPlaces: 0,
                color: () => categoryColor,
                labelColor: () => colors.muted,
                propsForDots: {
                  r: "4",
                  strokeWidth: "2",
                  stroke: categoryColor,
                },
                propsForLabels: {
                  fontSize: 11,
                },
              }}
              style={styles.chart}
            />
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartTitle}>No trend data yet</Text>
              <Text style={styles.emptyChartText}>
                Add a few transactions in this category and the chart will appear here.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.insightCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>Transaction Insights</Text>
          </View>

          <View style={styles.insightStats}>
            <View style={styles.insightStat}>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>
                  {insightTab === "Daily"
                    ? "Today"
                    : insightTab === "Weekly"
                    ? "This week"
                    : insightTab === "Monthly"
                    ? "This month"
                    : "This year"}
                </Text>
              </View>
              <Text style={styles.insightValue}>
                {getCountLabel(groupCount)}
              </Text>
            </View>

            <View style={styles.insightStat}>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="chart-line" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>Daily average</Text>
              </View>
              <Text style={styles.insightValue}>{formatMoney(dailyAverage)} per day</Text>
            </View>
          </View>

          <View style={styles.insightDivider} />

          <View style={styles.lastTransactionRow}>
            <View>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>Last transaction</Text>
              </View>
              <Text style={styles.lastTransactionText}>
                {latestTransaction ? formatRelativeDate(latestTransaction.date) : "No transactions"}
              </Text>
            </View>

            {latestTransaction ? (
              <Text style={[styles.lastTransactionAmount, { color: categoryColor }]}>
                {formatCompactMoney(getTransactionValue(latestTransaction))}
              </Text>
            ) : null}
          </View>

        </View>

        <View style={styles.transactionsSection}>
          {groupedTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyChartTitle}>No transactions found</Text>
              <Text style={styles.emptyChartText}>
                This category does not have any transactions for the selected range yet.
              </Text>
            </View>
          ) : (
            groupedTransactions.map((group) => {
              return (
                <View key={group.key} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    <Text
                      style={[
                        styles.groupTotal,
                        group.total < 0 && styles.groupTotalExpense,
                        group.total > 0 && styles.groupTotalIncome,
                      ]}
                    >
                      {formatCompactMoney(group.total)}
                    </Text>
                  </View>

                  <View style={styles.groupCard}>
                    {group.items.map((item, index) => (
                      <TransactionListItem
                        key={item.id}
                        title={item.title || item.categories?.name || "Transaction"}
                        accountLabel={item.account?.name || "Account"}
                        dateLabel={formatShortDate(item.date)}
                        amount={item.amount}
                        time={item.time}
                        transactionType={item.type}
                        amountPrefix=""
                        categoryColor={item.categories?.color || categoryColor}
                        categoryIcon={item.categories?.icon || categoryIcon}
                        showDivider={index !== group.items.length - 1}
                        onPress={() =>
                          navigation.navigate("UpdateTransaction", {
                            transaction: item,
                          })
                        }
                      />
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.floatingEditButton}
        onPress={() => navigation.navigate("UpdateCategory", { category })}
      >
        <Feather name="edit-2" size={20} color="#2c1e1a" />
        <Text style={styles.floatingEditText}>Edit</Text>
      </TouchableOpacity>

      <View style={styles.bottomTabBar}>
        {INSIGHT_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setInsightTab(tab)}
            style={[styles.bottomTabItem, insightTab === tab && styles.bottomActiveTab]}
          >
            <Text style={[styles.bottomTabText, insightTab === tab && styles.bottomActiveTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingBottom: 220,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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
    width: 42,
    alignItems: "flex-end",
  },

  iconAction: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "left",
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginHorizontal: 12,
  },

  headerTitleWrap: {
    flex: 1,
    justifyContent: "center",
  },

  summaryCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },

  categoryChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  metricsGrid: {
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
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    justifyContent: "center",
  },

  metricTopLeft: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricTopRight: {
    borderBottomWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricBottomLeft: {
    borderRightWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricBottomRight: {
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
    fontSize: 22,
    fontWeight: "800",
    marginTop: 10,
  },

  chartCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  segmentedToggle: {
    flexDirection: "row",
    backgroundColor: "#2d201b",
    borderRadius: 18,
    padding: 4,
  },

  segmentedButton: {
    width: 46,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  segmentedButtonActive: {
    backgroundColor: colors.gold,
  },

  chart: {
    borderRadius: 18,
    paddingRight: 12,
  },

  emptyChart: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  emptyChartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyChartText: {
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  insightCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  insightStats: {
    flexDirection: "row",
    gap: 12,
  },

  insightStat: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  insightValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },

  insightDivider: {
    height: 1,
    backgroundColor: "rgba(255, 233, 220, 0.08)",
    marginVertical: 16,
  },

  lastTransactionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  lastTransactionText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 8,
  },

  lastTransactionAmount: {
    fontSize: 18,
    fontWeight: "900",
  },

  transactionsSection: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  groupSection: {
    marginBottom: 22,
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },

  groupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },

  groupTotal: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },

  groupCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },

  floatingEditButton: {
    position: "absolute",
    right: 20,
    bottom: 102,
    minWidth: 92,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  floatingEditText: {
    color: "#2c1e1a",
    fontSize: 15,
    fontWeight: "800",
  },

  bottomTabBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    flexDirection: "row",
    backgroundColor: "#261813",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 188, 0.08)",
    padding: 8,
  },

  bottomTabItem: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: "center",
  },

  bottomTabText: {
    color: "#ead7cd",
    fontSize: 15,
    fontWeight: "700",
  },

  bottomActiveTab: {
    backgroundColor: colors.gold,
  },

  bottomActiveTabText: {
    color: "#2a1812",
  },
});
