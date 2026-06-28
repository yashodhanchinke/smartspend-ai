import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const TABS = ["Active", "Due"];

function parseStoredDate(value) {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount).toFixed(2);

  if (amount < 0) return `-₹${absolute}`;
  if (amount > 0) return `₹${absolute}`;
  return "₹0.00";
}

function getMonthlyEquivalent(amount, period) {
  const value = Number(amount || 0);

  if (period === "daily") return value * 30;
  if (period === "weekly") return value * 4.33;
  if (period === "quarterly") return value / 3;
  if (period === "yearly") return value / 12;

  return value;
}

function getSignedMonthlyEquivalent(item) {
  const monthly = getMonthlyEquivalent(item.amount, item.period);
  return item.type === "income" ? monthly : -monthly;
}

function formatDateLabel(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isSameMonth(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

export default function RecurringScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState("Active");

  const fetchRecurring = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setItems([]);
      return;
    }

    const { data } = await supabase
      .from("recurring_transactions")
      .select(`
        id,
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
      .eq("user_id", user.id)
      .order("next_run");

    setItems(data || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRecurring();
    }, [fetchRecurring])
  );

  useEffect(() => {
    let channel;
    let isMounted = true;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        return;
      }

      channel = supabase
        .channel(`recurring-screen-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "recurring_transactions", filter: `user_id=eq.${user.id}` },
          () => {
            fetchRecurring();
          }
        )
        .on(
          "broadcast",
          { event: "refresh" },
          () => {
            fetchRecurring();
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
  }, [fetchRecurring]);

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const activeRecurring = useMemo(
    () => items,
    [items]
  );

  const dueRecurring = useMemo(
    () =>
      items.filter((item) => {
        if (!item.next_run) return false;
        const nextRun = parseStoredDate(item.next_run);
        if (!nextRun) return false;
        return nextRun < today;
      }),
    [items, today]
  );

  const visibleItems = activeTab === "Active" ? activeRecurring : dueRecurring;
  const featuredItem = visibleItems[0] || null;
  const remainingItems = visibleItems.slice(1);

  const monthlyNet = useMemo(
    () => items.reduce((sum, item) => sum + getSignedMonthlyEquivalent(item), 0),
    [items]
  );
  const dueThisMonth = useMemo(() => {
    return items
      .filter((item) => {
        if (!item.next_run) return false;
        const nextRun = parseStoredDate(item.next_run);
        return nextRun && isSameMonth(nextRun, today);
      })
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [items, today]);
  const totalYearly = monthlyNet * 12;
  const incomeMonthly = useMemo(
    () =>
      items
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + getMonthlyEquivalent(item.amount, item.period), 0),
    [items]
  );
  const expenseMonthly = useMemo(
    () =>
      items
        .filter((item) => item.type !== "income")
        .reduce((sum, item) => sum + getMonthlyEquivalent(item.amount, item.period), 0),
    [items]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Recurring" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryTop}>
          <Text style={styles.summaryLabel}>Monthly Average</Text>
          <Text style={[styles.summaryAmount, monthlyNet >= 0 ? styles.positive : styles.negative]}>
            {formatCurrency(monthlyNet)}
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, styles.warmCard]}>
            <Text style={styles.summaryCardLabel}>Due This Month</Text>
            <Text style={styles.summaryCardAmount}>{formatCurrency(dueThisMonth)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.lightCard]}>
            <Text style={styles.summaryCardLabel}>Total Yearly</Text>
            <Text
              style={[
                styles.summaryCardAmount,
                totalYearly >= 0 ? styles.yearlyPositive : styles.yearlyNegative,
              ]}
            >
              {formatCurrency(totalYearly)}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.greenCard]}>
            <Text style={[styles.summaryCardLabel, styles.greenText]}>Income</Text>
            <Text style={[styles.summaryCardAmount, styles.greenText]}>{formatCurrency(incomeMonthly)}</Text>
          </View>
          <View style={[styles.summaryCard, styles.redCard]}>
            <Text style={[styles.summaryCardLabel, styles.redText]}>Expense</Text>
            <Text style={[styles.summaryCardAmount, styles.redText]}>{formatCurrency(expenseMonthly)}</Text>
          </View>
        </View>

        {visibleItems.length === 0 ? (
          <View style={styles.emptyWrapper}>
            <Feather name="repeat" size={72} color="#ead5d0" />
            <Text style={styles.emptyTitle}>No recurring transactions found</Text>
            <Text style={styles.emptySubtitle}>
              You have not added recurring transactions for this tab yet.
            </Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {featuredItem ? (
              <Pressable
                style={styles.featuredCard}
                onPress={() => navigation.navigate("RecurringDetails", { recurring: featuredItem })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleWrap}>
                    <View style={styles.cardIcon}>
                      <MaterialCommunityIcons
                        name={featuredItem.categories?.icon || "repeat"}
                        size={22}
                        color={featuredItem.categories?.color || "#f3cfbf"}
                      />
                    </View>
                    <View style={styles.cardTextWrap}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {featuredItem.title || "Recurring transaction"}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {formatPeriod(featuredItem.period)} • {featuredItem.type === "income" ? "Income" : "Expense"}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.cardAmount,
                      featuredItem.type === "income" ? styles.incomeAmount : styles.expenseAmount,
                    ]}
                  >
                    {formatCurrency(featuredItem.amount)}
                  </Text>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardFooter}>
                  <View style={styles.cardFooterItem}>
                    <Feather name="calendar" size={16} color="#e7cfc6" />
                    <Text style={styles.cardFooterText}>
                      Due on: {featuredItem.next_run ? formatDateLabel(featuredItem.next_run) : "-"}
                    </Text>
                  </View>
                  <View style={styles.cardFooterItem}>
                    <Feather name="credit-card" size={16} color="#e7cfc6" />
                    <Text style={styles.cardFooterText}>
                      Paid from: {featuredItem.accounts?.name || "Account"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : null}

            {remainingItems.map((item) => {
              const isExpense = item.type !== "income";

              return (
                <Pressable
                  key={item.id}
                  style={styles.card}
                  onPress={() => navigation.navigate("RecurringDetails", { recurring: item })}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleWrap}>
                      <View style={styles.cardIcon}>
                        <MaterialCommunityIcons
                          name={item.categories?.icon || "repeat"}
                          size={22}
                          color={item.categories?.color || "#f3cfbf"}
                        />
                      </View>
                      <View style={styles.cardTextWrap}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title || "Recurring transaction"}
                        </Text>
                        <Text style={styles.cardMeta}>
                          {formatPeriod(item.period)} • {isExpense ? "Expense" : "Income"}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.cardAmount, isExpense ? styles.expenseAmount : styles.incomeAmount]}>
                      {formatCurrency(item.amount)}
                    </Text>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.cardFooter}>
                    <View style={styles.cardFooterItem}>
                      <Feather name="calendar" size={16} color="#e7cfc6" />
                      <Text style={styles.cardFooterText}>
                        Due on: {item.next_run ? formatDateLabel(item.next_run) : "-"}
                      </Text>
                    </View>
                    <View style={styles.cardFooterItem}>
                      <Feather name="credit-card" size={16} color="#e7cfc6" />
                      <Text style={styles.cardFooterText}>
                        Paid from: {item.accounts?.name || "Account"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabItem, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

      <FloatingButton onPress={() => navigation.navigate("AddRecurring")} style={styles.fabLifted} />
    </SafeAreaView>
  );
}

function formatPeriod(period) {
  if (!period) return "Monthly";
  return period.charAt(0).toUpperCase() + period.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 118,
  },
  summaryTop: {
    marginBottom: 18,
  },
  summaryLabel: {
    color: "#f2b19e",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  summaryAmount: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  positive: {
    color: "#84e68c",
  },
  negative: {
    color: "#ffb49a",
  },
  yearlyPositive: {
    color: "#2f1814",
  },
  yearlyNegative: {
    color: "#7a231c",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },
  summaryCard: {
    width: "48%",
    minHeight: 92,
    borderRadius: 22,
    padding: 16,
  },
  warmCard: {
    backgroundColor: "#ffb49a",
  },
  lightCard: {
    backgroundColor: "#eec0b3",
  },
  greenCard: {
    backgroundColor: "#2f5d35",
  },
  redCard: {
    backgroundColor: "#7d2725",
  },
  summaryCardLabel: {
    color: "#2f1814",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },
  summaryCardAmount: {
    color: "#2f1814",
    fontSize: 22,
    fontWeight: "900",
  },
  greenText: {
    color: "#9ae69f",
  },
  redText: {
    color: "#ff7c76",
  },
  emptyWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 24,
    fontSize: 15,
  },
  listWrap: {
    gap: 14,
  },
  card: {
    backgroundColor: "#5c4048",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#72525d",
  },
  featuredCard: {
    backgroundColor: "#6a4954",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#86606f",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#4a3139",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: "#f6d4d1",
    fontSize: 18,
    fontWeight: "800",
  },
  cardMeta: {
    color: "#f0b19a",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  cardAmount: {
    fontSize: 21,
    fontWeight: "900",
    textAlign: "right",
  },
  expenseAmount: {
    color: "#ffb49a",
  },
  incomeAmount: {
    color: "#93f09b",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#74535d",
    marginVertical: 14,
  },
  cardFooter: {
    gap: 10,
  },
  cardFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardFooterText: {
    color: "#f4cabf",
    fontSize: 14,
    fontWeight: "700",
  },
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    flexDirection: "row",
    padding: 6,
    borderRadius: 999,
    backgroundColor: "#201210",
    borderWidth: 1,
    borderColor: "#3d2721",
  },
  tabItem: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  activeTab: {
    backgroundColor: "#ffb49a",
  },
  tabText: {
    color: "#e9d1c7",
    fontSize: 17,
    fontWeight: "800",
  },
  activeTabText: {
    color: "#2f1814",
  },
  fabLifted: {
    bottom: 92,
    right: 18,
  },
});
