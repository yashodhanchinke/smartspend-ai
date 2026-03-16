import { MaterialCommunityIcons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CalendarHeatmap from "../components/CalendarHeatmap";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { showTransactionEntryOptions } from "../util/transactionEntry";

export default function HomeScreen({ navigation, route }) {

  const [transactions, setTransactions] = useState([]);
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

  /* REFRESH SCREEN */

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [])
  );

  useEffect(() => {
    if (route?.params?.refreshAt) {
      fetchDashboard();
    }
  }, [route?.params?.refreshAt]);

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
            fetchDashboard();
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
            fetchDashboard();
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
            fetchDashboard();
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

  const fetchDashboard = async () => {

    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const { data: tx } = await supabase
      .from("transactions")
      .select(`
        *,
        categories(name,icon,color),
        accounts(name)
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    setTransactions(tx || []);

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
  };

  const formatAmount = (value) => {
    if (!showAmounts) return "₹******";

    return `₹${Number(value || 0).toFixed(2)}`;
  };

  const getChangeMeta = (currentValue, previousValue) => {
    if (!previousValue) {
      if (!currentValue) {
        return {
          direction: "flat",
          percentageText: "0.0%",
          comparisonText: "Compared to ₹0.00 last month",
        };
      }

      return {
        direction: "up",
        percentageText: "New",
        comparisonText: `Compared to ${formatAmount(previousValue)} last month`,
      };
    }

    const change = ((currentValue - previousValue) / previousValue) * 100;
    const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const sign = change > 0 ? "+" : "";

    return {
      direction,
      percentageText: `${sign}${change.toFixed(1)}%`,
      comparisonText: `Compared to ${formatAmount(previousValue)} last month`,
    };
  };

  const incomeMeta = getChangeMeta(income, lastMonthIncome);
  const expenseMeta = getChangeMeta(expense, lastMonthExpense);

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
                  incomeMeta.direction === "down" && styles.metricChangeDown,
                  incomeMeta.direction === "flat" && styles.metricChangeFlat,
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
                  expenseMeta.direction === "down" && styles.metricChangeDown,
                  expenseMeta.direction === "flat" && styles.metricChangeFlat,
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
            bodyIcon="calendar"
            bodyText="No transactions this week"
            compactTitle
          />

        </View>

        {/* HEATMAP */}

        <CalendarHeatmap refreshKey={refreshKey} />

        {/* RECENT TRANSACTIONS */}

        <View style={styles.summaryCard}>

          <Text style={styles.sectionTitle}>Recent transactions</Text>

          {transactions.length === 0 && (
            <Text style={styles.lightMuted}>
              No transactions yet
            </Text>
          )}

          {transactions.map((t) => (

            <View key={t.id} style={styles.txRow}>

              <View style={styles.txLeft}>

                <View
                  style={[
                    styles.txIcon,
                    { backgroundColor: t.categories?.color || "#a05c3b" }
                  ]}
                >
                  <MaterialCommunityIcons
                    name={t.categories?.icon || "credit-card"}
                    size={18}
                    color="#fff"
                  />
                </View>

                <View>

                  <Text style={styles.txTitle}>
                    {t.title || t.categories?.name || "Transaction"}
                  </Text>

                  <Text style={styles.txMeta}>
                    {t.accounts?.name || "Account"} • {t.date}
                  </Text>

                </View>

              </View>

              <Text
                style={
                  t.type === "expense"
                    ? styles.txExpense
                    : styles.txIncome
                }
              >
                ₹{Number(t.amount).toFixed(2)}
              </Text>

            </View>

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
      onPress={() => navigation.navigate(title)}
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
    minHeight: 168,
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
    fontSize: 11,
    marginBottom: 8,
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

  sectionCategoriesBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  sectionCategoriesCountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 12,
  },

  sectionCountNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },

  sectionCount: {
    color: colors.text,
    fontSize: 16,
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
    marginBottom: 8,
  },

  categoryItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },

  categoryItemName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },

  categoryItemAmount: {
    color: "#d8c8c0",
    fontSize: 13,
    fontWeight: "700",
  },

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
