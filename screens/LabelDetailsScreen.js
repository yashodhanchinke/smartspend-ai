import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import colors from "../theme/colors";
import { supabase } from "../lib/supabase";

const LABEL_TABS = ["Daily", "Weekly", "Monthly", "Yearly"];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
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

function formatTransactionGroupTitle(tab, date) {
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
}

function formatGroupKey(tab, date) {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return `D:${current.toISOString().split("T")[0]}`;
  }

  if (tab === "Weekly") {
    const start = getWeekStart(current);
    return `W:${start.toISOString().split("T")[0]}`;
  }

  if (tab === "Monthly") {
    return `M:${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  }

  return `Y:${current.getFullYear()}`;
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

function getSignedAmount(transaction) {
  const amount = Number(transaction?.amount || 0);

  if (transaction?.type === "expense") {
    return -amount;
  }

  if (transaction?.type === "income") {
    return amount;
  }

  return 0;
}

export default function LabelDetailsScreen({ navigation }) {
  const route = useRoute();
  const routeLabel = route?.params?.label || null;
  const labelId = routeLabel?.id || route?.params?.labelId || null;
  const [label, setLabel] = useState(routeLabel);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState("Weekly");
  const [loading, setLoading] = useState(true);

  const loadLabel = useCallback(async () => {
    if (!labelId) {
      setLabel(routeLabel);
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
        setLabel(null);
        setTransactions([]);
        return;
      }

      const [labelResult, txResult] = await Promise.all([
        supabase
          .from("labels")
          .select("id,name,color")
          .eq("id", labelId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("transaction_labels")
          .select(
            `
            transaction_id,
            transactions (
              id,
              title,
              amount,
              type,
              date,
              time,
              account_id,
              categories(name,color,icon),
              accounts(name)
            )
          `
          )
          .eq("label_id", labelId)
          .eq("user_id", user.id),
      ]);

      if (labelResult.error) throw labelResult.error;
      if (txResult.error) throw txResult.error;

      const flattenedTransactions = (txResult.data || [])
        .map((row) => (Array.isArray(row.transactions) ? row.transactions[0] : row.transactions))
        .filter(Boolean);

      setLabel(labelResult.data || routeLabel);
      setTransactions(flattenedTransactions);
    } catch (error) {
      console.warn("Could not load label details:", error.message);
      setLabel(routeLabel);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [labelId, routeLabel]);

  useFocusEffect(
    useCallback(() => {
      loadLabel();
    }, [loadLabel])
  );

  const totals = useMemo(() => {
    const net = transactions.reduce((sum, transaction) => sum + getSignedAmount(transaction), 0);
    const expenseTotal = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
    const incomeTotal = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    return {
      net,
      expenseTotal,
      incomeTotal,
      transactionCount: transactions.length,
    };
  }, [transactions]);

  const periodTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (activeTab === "Daily") {
        return isSameDay(transaction.date, new Date());
      }

      if (activeTab === "Weekly") {
        return isWithinCurrentWeek(transaction.date);
      }

      if (activeTab === "Monthly") {
        return isWithinCurrentMonth(transaction.date);
      }

      return isWithinCurrentYear(transaction.date);
    });
  }, [activeTab, transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map();

    periodTransactions.forEach((transaction) => {
      const key = formatGroupKey(activeTab, transaction.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: toStartOfDay(transaction.date),
          title: formatTransactionGroupTitle(activeTab, transaction.date),
          items: [],
          total: 0,
        });
      }

      const group = groups.get(key);
      group.items.push(transaction);
      group.total += getSignedAmount(transaction);
    });

    return Array.from(groups.values()).sort((left, right) => right.date - left.date);
  }, [activeTab, periodTransactions]);

  const handleDeleteLabel = useCallback(() => {
    if (!label?.id) return;

    Alert.alert(`Delete ${label.name || "label"}?`, "This label will be removed.", [
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

          const { error } = await supabase.from("labels").delete().eq("id", label.id).eq("user_id", user.id);
          if (error) {
            Alert.alert("Error", error.message);
            return;
          }

          navigation.goBack();
        },
      },
    ]);
  }, [label, navigation]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {label?.name || "Label"}
        </Text>

        <Pressable onPress={handleDeleteLabel} style={styles.headerIconButton}>
          <Feather name="trash-2" size={22} color="#ffb8ab" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleBlock}>
              <View style={[styles.heroIconWrap, { backgroundColor: `${label?.color || "#ffb49a"}22` }]}>
                <MaterialCommunityIcons
                  name="tag"
                  size={26}
                  color={label?.color || "#ffb49a"}
                />
              </View>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroLabel}>Total</Text>
                <Text
                  style={[
                    styles.heroAmount,
                    totals.net < 0 && styles.heroAmountNegative,
                    totals.net > 0 && styles.heroAmountPositive,
                  ]}
                >
                  {formatCurrency(totals.net)}
                </Text>
              </View>
            </View>
            <Text style={styles.heroCount}>
              {totals.transactionCount}{" "}
              {totals.transactionCount === 1 ? "transaction" : "transactions"}
            </Text>
          </View>

          <View style={styles.heroTrack}>
            <View
              style={[
                styles.heroTrackFill,
                {
                  width: `${Math.min(Math.max((Math.abs(totals.net) / Math.max(totals.expenseTotal || totals.incomeTotal || 1, 1)) * 100, 4), 100)}%`,
                  backgroundColor: label?.color || "#ffb49a",
                },
              ]}
            />
          </View>

          <View style={styles.heroSplitRow}>
            <View style={styles.heroSplitItem}>
              <Text style={styles.heroSplitValue}>{formatCurrency(totals.incomeTotal)}</Text>
              <Text style={styles.heroSplitLabel}>
                {periodTransactions.filter((transaction) => transaction.type === "income").length}{" "}
                {periodTransactions.filter((transaction) => transaction.type === "income").length === 1
                  ? "transaction"
                  : "transactions"}
              </Text>
            </View>
            <View style={styles.heroSplitDivider} />
            <View style={styles.heroSplitItem}>
              <Text style={[styles.heroSplitValue, styles.heroSplitValueNegative]}>
                {formatCurrency(-totals.expenseTotal)}
              </Text>
              <Text style={[styles.heroSplitLabel, styles.heroSplitLabelNegative]}>
                {periodTransactions.filter((transaction) => transaction.type === "expense").length}{" "}
                {periodTransactions.filter((transaction) => transaction.type === "expense").length === 1
                  ? "transaction"
                  : "transactions"}
              </Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyTitle}>Loading label data...</Text>
          </View>
        ) : groupedTransactions.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <MaterialCommunityIcons name="tag-outline" size={54} color="#e2c9c1" />
            <Text style={styles.emptyTitle}>No transactions in this period</Text>
            <Text style={styles.emptySubtitle}>Switch tabs to see more activity</Text>
          </View>
        ) : (
          <>
            <View style={styles.transactionsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Transactions</Text>
                <Text style={styles.sectionCaption}>
                  {groupedTransactions.length} groups in {activeTab.toLowerCase()}
                </Text>
              </View>
            </View>

            {groupedTransactions.map((group) => (
              <View key={group.key} style={styles.groupSection}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  <Text
                    style={[
                      styles.groupTotal,
                      group.total < 0 && styles.groupTotalNegative,
                      group.total > 0 && styles.groupTotalPositive,
                    ]}
                  >
                    {formatCurrency(group.total)}
                  </Text>
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
                      amountPrefix={item.type === "expense" ? "-" : ""}
                      categoryColor={item.categories?.color || label?.color || colors.gold}
                      categoryIcon={item.categories?.icon || "tag"}
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
      </ScrollView>

      <View style={styles.tabBar}>
        {LABEL_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.floatingEditButton}
        onPress={() => navigation.navigate("UpdateLabel", { label })}
      >
        <Feather name="edit-2" size={20} color="#2f1814" />
        <Text style={styles.floatingEditText}>Edit</Text>
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
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 168,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4f3831",
    marginBottom: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitleBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  heroIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  heroTextWrap: {
    flex: 1,
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
  },
  heroAmountNegative: {
    color: "#ff948b",
  },
  heroAmountPositive: {
    color: "#8af09a",
  },
  heroCount: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
    paddingTop: 6,
  },
  heroTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#5c4043",
    overflow: "hidden",
    marginTop: 16,
  },
  heroTrackFill: {
    height: "100%",
    borderRadius: 999,
  },
  heroSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  heroSplitItem: {
    flex: 1,
    alignItems: "center",
  },
  heroSplitDivider: {
    width: 1,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroSplitValue: {
    color: "#8af09a",
    fontSize: 20,
    fontWeight: "800",
  },
  heroSplitValueNegative: {
    color: "#ff948b",
  },
  heroSplitLabel: {
    color: "#8af09a",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  heroSplitLabelNegative: {
    color: "#ff948b",
  },
  emptyStateCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
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
  transactionsHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  sectionCaption: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  groupSection: {
    marginBottom: 14,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  groupTotalNegative: {
    color: "#ff948b",
  },
  groupTotalPositive: {
    color: "#8af09a",
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    overflow: "hidden",
  },
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: "#201310",
    borderRadius: 999,
    padding: 5,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#2f211c",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 999,
  },
  tabItemActive: {
    backgroundColor: "#ffb49a",
  },
  tabText: {
    color: "#d2bbb2",
    fontSize: 15,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#2a130f",
  },
  floatingEditButton: {
    position: "absolute",
    right: 16,
    bottom: 86,
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
