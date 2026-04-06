import { MaterialCommunityIcons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import LoanSettlementModal from "../components/LoanSettlementModal";
import { SafeAreaView } from "react-native-safe-area-context";
import CalendarHeatmap from "../components/CalendarHeatmap";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { getDuePendingLoans, settleLoan } from "../util/loanSettlement";
import { showTransactionEntryOptions } from "../util/transactionEntry";

const parseStoredDate = (value) => {
  if (!value) return new Date();

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const timeToSeconds = (value) => {
  const [hours, minutes, seconds] = String(value || "00:00:00")
    .split(":")
    .map((part) => Number(part) || 0);
  return hours * 3600 + minutes * 60 + seconds;
};

const compareTransactionsByDateTimeDesc = (left, right) => {
  const dateDiff = parseStoredDate(right.date).getTime() - parseStoredDate(left.date).getTime();
  if (dateDiff !== 0) return dateDiff;

  const timeDiff = timeToSeconds(right.time) - timeToSeconds(left.time);
  if (timeDiff !== 0) return timeDiff;

  return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
};

const getMondayOfWeek = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const isSameDate = (left, right) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export default function HomeScreen({ navigation, route }) {

  const [transactions, setTransactions] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState({
    count: 0,
    highestDay: "None",
    highestSpending: 0,
    net: 0,
    bars: [
      { label: "Mon", total: 0 },
      { label: "Tue", total: 0 },
      { label: "Wed", total: 0 },
      { label: "Thu", total: 0 },
      { label: "Fri", total: 0 },
      { label: "Sat", total: 0 },
      { label: "Sun", total: 0 },
    ],
  });
  const [totalBalance, setTotalBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [username, setUsername] = useState("");
  const [categoryCount, setCategoryCount] = useState(0);
  const [topCategories, setTopCategories] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAmounts, setShowAmounts] = useState(true);
  const [lastMonthIncome, setLastMonthIncome] = useState(0);
  const [lastMonthExpense, setLastMonthExpense] = useState(0);
  const [dueLoanPrompt, setDueLoanPrompt] = useState(null);
  const [isSettlingLoan, setIsSettlingLoan] = useState(false);
  const dismissedLoanIdsRef = useRef(new Set());
  const fetchDashboardRef = useRef(() => {});

  const getProfileSubtitle = () => {
    const indiaHour = Number(
      new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Kolkata",
      }).format(new Date())
    );

    const firstName = (username || "there").trim().split(" ")[0];

    if (indiaHour < 5) {
      return `Midnight budgeting, ${firstName}? That's dedication!`;
    }

    if (indiaHour < 12) {
      return `Morning check-in, ${firstName}. Ready to track today?`;
    }

    if (indiaHour < 17) {
      return `Afternoon update, ${firstName}. Keep the spending sharp.`;
    }

    if (indiaHour < 21) {
      return `Evening review, ${firstName}. See where today's money went.`;
    }

    return `Night planning, ${firstName}. One last look at your budget.`;
  };

  useEffect(() => {
    let isMounted = true;
    let channel;

    const subscribeToDashboard = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) return;

      channel = supabase
        .channel(`home-dashboard-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchDashboardRef.current();
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
            fetchDashboardRef.current();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "categories",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchDashboardRef.current();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "loans",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchDashboardRef.current();
          }
        )
        .subscribe();
    };

    subscribeToDashboard();

    return () => {
      isMounted = false;

      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const refreshDueLoanPrompt = useCallback(async (userId) => {
    const dueLoans = await getDuePendingLoans(userId);
    const nextDueLoan = dueLoans.find(
      (loan) => !dismissedLoanIdsRef.current.has(loan.id)
    );

    setDueLoanPrompt(nextDueLoan || null);
  }, []);

  const fetchDashboard = useCallback(async () => {

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    await refreshDueLoanPrompt(user.id);

    /* PROFILE */

    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    if (profile) setUsername(profile.name);

    /* ACCOUNTS */

    const { data: accounts } = await supabase
      .from("accounts")
      .select("balance")
      .eq("user_id", user.id);

    let balanceTotal = 0;

    accounts?.forEach((a) => {
      balanceTotal += Number(a.balance);
    });

    setTotalBalance(balanceTotal);

    /* RECENT TRANSACTIONS */

    const [{ data: tx }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(`
          *,
          categories(name,icon,color)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

    const accountMap = Object.fromEntries((accountRows || []).map((account) => [account.id, account]));

    setTransactions(
      (tx || [])
        .map((transaction) => ({
          ...transaction,
          account: accountMap[transaction.account_id] || null,
        }))
        .sort(compareTransactionsByDateTimeDesc)
    );

    const { data: weeklySourceTransactions } = await supabase
      .from("transactions")
      .select("amount,type,date")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(180);

    const latestTransactionDate = weeklySourceTransactions?.length
      ? parseStoredDate(weeklySourceTransactions[0].date)
      : new Date();

    const startOfWeek = getMondayOfWeek(latestTransactionDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekTransactions = (weeklySourceTransactions || []).filter((transaction) => {
      const txDate = parseStoredDate(transaction.date);
      return txDate >= startOfWeek && txDate <= endOfWeek;
    });

    const daySpendMap = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      0: 0,
    };

    const currentWeekSummary = (weekTransactions || []).reduce(
      (summary, transaction) => {
        const amount = Number(transaction.amount || 0);
        const transactionDate = parseStoredDate(transaction.date);
        const weekDay = transactionDate.getDay();

        if (transaction.type === "income") {
          summary.net += amount;
        } else if (transaction.type === "expense") {
          summary.net -= amount;
        }

        if (transaction.type !== "transfer") {
          daySpendMap[weekDay] += Math.abs(amount);
        }

        summary.count += 1;
        return summary;
      },
      { count: 0, net: 0 }
    );

    const orderedDays = [
      { label: "Mon", fullLabel: "Monday", key: 1 },
      { label: "Tue", fullLabel: "Tuesday", key: 2 },
      { label: "Wed", fullLabel: "Wednesday", key: 3 },
      { label: "Thu", fullLabel: "Thursday", key: 4 },
      { label: "Fri", fullLabel: "Friday", key: 5 },
      { label: "Sat", fullLabel: "Saturday", key: 6 },
      { label: "Sun", fullLabel: "Sunday", key: 0 },
    ];

    const bars = orderedDays.map((day) => ({
      label: day.label,
      fullLabel: day.fullLabel,
      total: daySpendMap[day.key] || 0,
    }));

    const highestBar = bars.reduce(
      (highest, current) => (current.total > highest.total ? current : highest),
      bars[0] || { label: "None", total: 0 }
    );

    setWeeklySummary({
      ...currentWeekSummary,
      bars,
      highestDay: highestBar?.total ? highestBar.fullLabel : "None",
      highestSpending: highestBar?.total || 0,
      weekLabel: isSameDate(startOfWeek, getMondayOfWeek(new Date()))
        ? "This Week"
        : `${startOfWeek.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })} - ${endOfWeek.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}`,
    });

    /* MONTH SUMMARY */

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const { data: monthTransactions } = await supabase
      .from("transactions")
      .select("amount,type,date")
      .eq("user_id", user.id)
      .gte("date", startOfLastMonth.toISOString().split("T")[0])
      .lt("date", startOfNextMonth.toISOString().split("T")[0]);

    let inc = 0;
    let exp = 0;
    let prevInc = 0;
    let prevExp = 0;

    monthTransactions?.forEach((t) => {
      const txDate = new Date(t.date);
      const isThisMonth = txDate >= startOfThisMonth && txDate < startOfNextMonth;
      const isLastMonth = txDate >= startOfLastMonth && txDate < startOfThisMonth;

      if (isThisMonth && t.type === "income") inc += Number(t.amount);

      if (isThisMonth && t.type === "expense") exp += Number(t.amount);

      if (isLastMonth && t.type === "income") prevInc += Number(t.amount);

      if (isLastMonth && t.type === "expense") prevExp += Number(t.amount);

    });

    setIncome(inc);
    setExpense(exp);
    setLastMonthIncome(prevInc);
    setLastMonthExpense(prevExp);

    /* CATEGORY SUMMARY */

    const { data: categories } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", user.id);

    setCategoryCount(categories?.length || 0);

    const { data: expenseTransactions } = await supabase
      .from("transactions")
      .select(`
        amount,
        category_id,
        categories(name,icon,color)
      `)
      .eq("user_id", user.id)
      .eq("type", "expense")
      .not("category_id", "is", null);

    const totalsByCategory = {};

    expenseTransactions?.forEach((item) => {
      const key = item.category_id;

      if (!key) return;

      if (!totalsByCategory[key]) {
        totalsByCategory[key] = {
          id: key,
          name: item.categories?.name || "Category",
          icon: item.categories?.icon || "tag",
          color: item.categories?.color || "#a05c3b",
          total: 0,
        };
      }

      totalsByCategory[key].total += Number(item.amount || 0);
    });

    setTopCategories(
      Object.values(totalsByCategory)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
    );
    setRefreshKey((current) => current + 1);
  }, [refreshDueLoanPrompt]);

  useEffect(() => {
    fetchDashboardRef.current = fetchDashboard;
  }, [fetchDashboard]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  useEffect(() => {
    if (route?.params?.refreshAt) {
      fetchDashboard();
    }
  }, [fetchDashboard, route?.params?.refreshAt]);

  const handleCloseDueLoanPrompt = useCallback(() => {
    if (dueLoanPrompt?.id) {
      dismissedLoanIdsRef.current.add(dueLoanPrompt.id);
    }

    setDueLoanPrompt(null);
  }, [dueLoanPrompt?.id]);

  const handleConfirmDueLoan = useCallback(async () => {
    if (!dueLoanPrompt?.id || isSettlingLoan) {
      return;
    }

    setIsSettlingLoan(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      dismissedLoanIdsRef.current.delete(dueLoanPrompt.id);
      await settleLoan({ loan: dueLoanPrompt, userId: user.id });
      setDueLoanPrompt(null);
      await fetchDashboard();
    } catch (error) {
      Alert.alert("Loan settlement failed", error.message || "Could not settle this loan right now.");
    } finally {
      setIsSettlingLoan(false);
    }
  }, [dueLoanPrompt, fetchDashboard, isSettlingLoan]);

  const formatAmount = (value) => {
    if (!showAmounts) return "₹******";

    return `₹${Number(value || 0).toFixed(2)}`;
  };

  const getChangeMeta = (currentValue, previousValue, { improveWhenLower = false } = {}) => {
    if (!previousValue) {
      if (!currentValue) {
        return {
          tone: "neutral",
          percentageText: "→ 0.0%",
          comparisonText: "Compared to ₹0.00 last month",
        };
      }

      return {
        tone: improveWhenLower ? "negative" : "positive",
        percentageText: "↑ New",
        comparisonText: `Compared to ${formatAmount(previousValue)} last month`,
      };
    }

    const change = ((currentValue - previousValue) / previousValue) * 100;
    const isFlat = change === 0;
    const isImprovement = improveWhenLower ? change < 0 : change > 0;
    const arrow = isFlat ? "→" : change > 0 ? "↑" : "↓";
    const sign = change > 0 ? "+" : "";

    return {
      tone: isFlat ? "neutral" : isImprovement ? "positive" : "negative",
      percentageText: `${arrow} ${sign}${change.toFixed(1)}%`,
      comparisonText: `Compared to ${formatAmount(previousValue)} last month`,
    };
  };

  const incomeMeta = getChangeMeta(income, lastMonthIncome, { improveWhenLower: false });
  const expenseMeta = getChangeMeta(expense, lastMonthExpense, { improveWhenLower: true });

  return (

    <SafeAreaView style={styles.screen}>

      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}

        <View style={styles.headerRow}>

          <View style={styles.headerTextWrap}>

            <Text style={styles.username} numberOfLines={1}>
              {username || "User"}
            </Text>

            <Text style={styles.greeting}>
              {getProfileSubtitle()}
            </Text>

          </View>

          <TouchableOpacity style={styles.profilePic}>
            <Feather name="user" size={22} color={colors.text} />
          </TouchableOpacity>

        </View>

        {/* BALANCE CARD */}

        <View style={styles.balanceCard}>

          <View style={styles.balanceHeader}>
            <Text style={styles.balanceTitle}>Total balance</Text>
            <TouchableOpacity onPress={() => setShowAmounts((current) => !current)}>
              <Feather
                name={showAmounts ? "eye" : "eye-off"}
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceValue}>
            {formatAmount(totalBalance)}
          </Text>

          <Text style={styles.thisMonthText}>This month</Text>

          <View style={styles.incomeExpenseRow}>

            <View style={styles.balanceMetricBlock}>
              <Text style={styles.subTitle}>Income</Text>
              <Text style={styles.amountGreen}>
                {formatAmount(income)}
              </Text>
              <Text
                style={[
                  styles.metricChange,
                  incomeMeta.tone === "negative" && styles.metricChangeDown,
                  incomeMeta.tone === "neutral" && styles.metricChangeFlat,
                ]}
              >
                {incomeMeta.percentageText}
              </Text>
              <Text style={styles.metricComparison}>
                {incomeMeta.comparisonText}
              </Text>
            </View>

            <View style={styles.balanceMetricBlock}>
              <Text style={styles.subTitle}>Expense</Text>
              <Text style={styles.amountRed}>
                {formatAmount(expense)}
              </Text>
              <Text
                style={[
                  styles.metricChange,
                  expenseMeta.tone === "negative" && styles.metricChangeDown,
                  expenseMeta.tone === "neutral" && styles.metricChangeFlat,
                ]}
              >
                {expenseMeta.percentageText}
              </Text>
              <Text style={styles.metricComparison}>
                {expenseMeta.comparisonText}
              </Text>
            </View>

          </View>

        </View>

        {/* GRID */}

        <View style={styles.grid}>

          <SectionCard
            icon="bar-chart"
            title="Budgets"
            navigation={navigation}
            bodyIcon="bar-chart-2"
            bodyText="No budgets set"
          />
          <SectionCard
            icon="pie-chart"
            title="Loans"
            navigation={navigation}
            bodyIcon="archive"
            bodyText="No loans"
          />
          <SectionCard
            icon="flag"
            title="Goals"
            navigation={navigation}
            bodyIcon="flag"
            bodyText="No goals set"
          />
          <SectionCard
            icon="tag"
            title="Labels"
            navigation={navigation}
            bodyIcon="tag"
            bodyText="No labels"
          />
          <SectionCard
            icon="activity"
            title="Analytics"
            navigation={navigation}
            variant="analytics"
            amount={expense}
          />
          <SectionCard
            icon="repeat"
            title="Recurring"
            navigation={navigation}
            bodyIcon="calendar"
            bodyText="No recurring events"
          />
          <SectionCard
            icon="grid"
            title="Categories"
            navigation={navigation}
            variant="categories"
            categoryCount={categoryCount}
            topCategories={topCategories}
          />
          <SectionCard
            icon="calendar"
            title="Weekly Summary"
            navigation={navigation}
            variant="weeklySummary"
            weeklySummary={weeklySummary}
            compactTitle
          />

        </View>

        {/* HEATMAP */}

        <CalendarHeatmap
          refreshKey={refreshKey}
          onPress={() => navigation.navigate("Calendar Heatmap")}
        />

        {/* RECENT TRANSACTIONS */}

        <View style={styles.recentSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent transactions</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Calendar Heatmap")}>
              <Text style={styles.sectionAction}>See all</Text>
            </TouchableOpacity>
          </View>

          {transactions.length === 0 && (
            <Text style={styles.lightMuted}>
              No transactions yet
            </Text>
          )}

          {transactions.map((t, index) => (
            <TransactionListItem
              key={t.id}
              title={t.title || t.categories?.name || "Transaction"}
              accountLabel={t.account?.name || "Account"}
              dateLabel={parseStoredDate(t.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              amount={t.amount}
              time={t.time}
              transactionType={t.type}
              categoryColor={t.categories?.color || "#a05c3b"}
              categoryIcon={t.categories?.icon || "credit-card"}
              showDivider={index !== transactions.length - 1}
            />
          ))}
        </View>

      </ScrollView>

      {/* FLOATING BUTTON */}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => showTransactionEntryOptions(navigation)}
      >
        <Feather name="plus" size={26} color="#000" />
      </TouchableOpacity>

      <LoanSettlementModal
        visible={Boolean(dueLoanPrompt)}
        loan={dueLoanPrompt}
        loading={isSettlingLoan}
        onClose={handleCloseDueLoanPrompt}
        onConfirm={handleConfirmDueLoan}
      />

    </SafeAreaView>
  );
}

/* GRID CARD */

function SectionCard({
  amount,
  categoryCount,
  bodyIcon,
  bodyText,
  compactTitle,
  icon,
  navigation,
  topCategories,
  title,
  variant,
  weeklySummary,
}) {

  const renderBody = () => {
    if (variant === "analytics") {
      return (
        <View style={styles.sectionAnalyticsBody}>
          <Text style={styles.sectionSmallLabel}>This month spending</Text>
          <Text style={styles.sectionAmount}>₹{Number(amount || 0).toFixed(2)}</Text>
          <Text style={styles.sectionTrend}>-100.0% vs last month</Text>
        </View>
      );
    }

    if (variant === "categories") {
      return (
        <View style={styles.sectionCategoriesBody}>
          <View style={styles.sectionCategoriesCountRow}>
            <Text style={styles.sectionCountNumber}>{categoryCount}</Text>
            <Text style={styles.sectionCount}>Categories</Text>
          </View>

          {topCategories?.length ? (
            topCategories.map((category) => (
              <View key={category.id} style={styles.categoryItemRow}>
                <View style={styles.categoryItemLeft}>
                  <MaterialCommunityIcons
                    name={category.icon}
                    size={16}
                    color={category.color}
                  />
                  <Text style={styles.categoryItemName} numberOfLines={1}>
                    {category.name}
                  </Text>
                </View>

                <Text style={styles.categoryItemAmount}>
                  ₹{category.total.toFixed(2)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.sectionHint}>No expense categories used yet</Text>
          )}
        </View>
      );
    }

    if (variant === "weeklySummary") {
      const highestSpending = Number(weeklySummary?.highestSpending || 0);
      const bars = weeklySummary?.bars || [];
      const maxBarValue = Math.max(...bars.map((bar) => bar.total), 0);

      return (
        <View style={styles.weeklyCardBody}>
          <View style={styles.weeklySummaryMetaRow}>
            <View>
              <Text style={styles.sectionSmallLabel}>
                {weeklySummary?.weekLabel || "This Week"}
              </Text>
              <Text style={styles.weeklyMetaAmount}>
                ₹{highestSpending.toFixed(2)}
              </Text>
            </View>

            <View style={styles.weeklyMetaRight}>
              <Text style={styles.sectionSmallLabel}>Highest Spending</Text>
              <Text style={styles.weeklyMetaDay} numberOfLines={1}>
                {weeklySummary?.highestDay || "None"}
              </Text>
            </View>
          </View>

          <View style={styles.weeklyBarsWrap}>
            {bars.map((bar) => {
              const height = maxBarValue ? Math.max(6, (bar.total / maxBarValue) * 52) : 6;
              const isActive = bar.total === maxBarValue && maxBarValue > 0;

              return (
                <View key={bar.label} style={styles.weeklyBarItem}>
                  <View style={styles.weeklyBarTrack}>
                    <View
                      style={[
                        styles.weeklyBar,
                        { height },
                        isActive && styles.weeklyBarActive,
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.weeklyBarLabel,
                      isActive && styles.weeklyBarLabelActive,
                    ]}
                  >
                    {bar.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.sectionBody}>
        <Feather name={bodyIcon} size={46} color="#cbb8b1" />
        <Text style={styles.sectionBodyText}>{bodyText}</Text>
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={styles.sectionCard}
      onPress={() =>
        title === "Weekly Summary"
          ? navigation.navigate(title, { initialTab: "Weekly" })
          : navigation.navigate(title)
      }
    >

      <View style={styles.sectionHeader}>
        <View style={styles.sectionRow}>
          <Feather name={icon} size={18} color="#d8c8c0" />
          <Text
            style={[
              styles.sectionTitleText,
              compactTitle && styles.sectionTitleTextCompact,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        <Feather name="chevron-right" size={20} color="#d8c8c0" />
      </View>

      <View style={styles.sectionDivider} />

      {renderBody()}

    </TouchableOpacity>
  );
}

/* STYLES */

const styles = StyleSheet.create({

  screen: { flex: 1, backgroundColor: colors.background },

  container: {
    paddingTop: Platform.OS === "android" ? 20 : 10,
    paddingHorizontal: 16,
    paddingBottom: 120,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },

  headerTextWrap: {
    flex: 1,
    marginRight: 16,
  },

  username: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },

  greeting: {
    color: "#d7cfc7",
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: "92%",
  },

  profilePic: {
    backgroundColor: colors.card,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
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

  balanceTitle: { color: colors.text },

  balanceValue: {
    fontSize: 38,
    fontWeight: "800",
    color: colors.text,
    marginTop: 6,
  },

  thisMonthText: {
    color: "#d5c8be",
    marginTop: 10,
  },

  incomeExpenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },

  balanceMetricBlock: {
    width: "48%",
  },

  subTitle: { color: colors.text },

  amountGreen: {
    color: "#79ff8a",
    fontWeight: "700",
    fontSize: 16,
  },

  metricChange: {
    color: "#79ff8a",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 6,
  },

  metricChangeDown: {
    color: "#ff7676",
  },

  metricChangeFlat: {
    color: "#d7cfc7",
  },

  metricComparison: {
    color: "#d7cfc7",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  amountRed: {
    color: "#ff7676",
    fontWeight: "700",
    fontSize: 16,
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
    height: 190,
    borderRadius: 18,
    marginBottom: 14,
    overflow: "hidden",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  sectionTitleText: {
    color: colors.text,
    marginLeft: 8,
    fontWeight: "700",
    fontSize: 15,
  },

  sectionTitleTextCompact: {
    fontSize: 12,
  },

  sectionDivider: {
    height: 1,
    backgroundColor: "#59443d",
  },

  sectionBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18,
  },

  sectionBodyText: {
    color: "#d8c8c0",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
  },

  sectionAnalyticsBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  sectionSmallLabel: {
    color: "#d8c8c0",
    fontSize: 9,
    marginBottom: 4,
  },

  sectionAmount: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },

  sectionTrend: {
    color: "#68d27b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
  },

  sectionTrendNeutral: {
    color: "#d8c8c0",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 8,
    lineHeight: 16,
  },

  weeklyCardBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },

  weeklySummaryMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },

  weeklyMetaRight: {
    alignItems: "flex-end",
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: "48%",
  },

  weeklyMetaAmount: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  weeklyMetaDay: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },

  weeklyBarsWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    minHeight: 78,
    paddingBottom: 2,
  },

  weeklyBarItem: {
    alignItems: "center",
    flex: 1,
  },

  weeklyBarTrack: {
    width: 16,
    height: 56,
    justifyContent: "flex-end",
    alignItems: "center",
  },

  weeklyBar: {
    width: 16,
    borderRadius: 6,
    backgroundColor: "#7b5d52",
  },

  weeklyBarActive: {
    backgroundColor: "#ffb497",
  },

  weeklyBarLabel: {
    color: "#cfb9af",
    fontSize: 7,
    fontWeight: "700",
    marginTop: 4,
  },

  weeklyBarLabelActive: {
    color: colors.gold,
  },

  sectionCategoriesBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  sectionCategoriesCountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },

  sectionCountNumber: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },

  sectionCount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
    marginBottom: 1,
  },

  sectionHint: {
    color: "#d8c8c0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },

  categoryItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  categoryItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },

  categoryItemName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },

  categoryItemAmount: {
    color: "#d8c8c0",
    fontSize: 12,
    fontWeight: "700",
  },

  summaryCard: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 18,
    marginBottom: 20,
  },

  recentSection: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 14,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionAction: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 14,
  },

  lightMuted: {
    color: "#c6b9b0",
  },

  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  txLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  txTitle: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 15,
  },

  txMeta: {
    color: "#c6b9b0",
    fontSize: 12,
    marginTop: 2,
  },

  txExpense: {
    color: "#ff7676",
    fontWeight: "700",
    fontSize: 15,
  },

  txIncome: {
    color: "#79ff8a",
    fontWeight: "700",
    fontSize: 15,
  },

  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: colors.gold,
    padding: 18,
    borderRadius: 40,
  },

});
