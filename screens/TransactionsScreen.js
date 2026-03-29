import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const TABS = ["Daily", "Weekly", "Monthly", "Yearly"];
const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

const formatDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStartOfDay = (value) => {
  const date = parseStoredDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getStartOfWeek = (value) => {
  const date = getStartOfDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
};

const getEndOfWeek = (value) => {
  const date = getStartOfWeek(value);
  date.setDate(date.getDate() + 6);
  return date;
};

const getStartOfMonth = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getStartOfYear = (value) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), 0, 1);
};

const getSignedAmount = (transaction) => {
  const amount = Number(transaction.amount || 0);

  if (transaction.type === "income") return amount;
  if (transaction.type === "expense") return -amount;

  return 0;
};

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  const absoluteAmount = Math.abs(amount).toFixed(2);

  if (amount < 0) return `-₹${absoluteAmount}`;
  if (amount > 0) return `₹${absoluteAmount}`;
  return "₹0.00";
};

const formatSectionTitle = (tab, date) => {
  const current = new Date(date);

  if (tab === "Daily") {
    return current.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  if (tab === "Weekly") {
    const start = getStartOfWeek(current);
    const end = getEndOfWeek(current);
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
  const current = new Date(date);

  if (tab === "Daily") {
    return getStartOfDay(current).toISOString();
  }

  if (tab === "Weekly") {
    return getStartOfWeek(current).toISOString();
  }

  if (tab === "Monthly") {
    return getStartOfMonth(current).toISOString();
  }

  return getStartOfYear(current).toISOString();
};

const getTransactionDateLabel = (value) => {
  const today = getStartOfDay(new Date());
  const date = getStartOfDay(value);

  if (date.getTime() === today.getTime()) {
    return "Today";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export default function TransactionsScreen({ navigation, route }) {
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || "Weekly");
  const [transactions, setTransactions] = useState([]);
  const selectedDate = route?.params?.selectedDate || null;

  const fetchTransactions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTransactions([]);
      return;
    }

    const [{ data, error }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(`
          *,
          categories(name,icon,color),
          to_account:to_account_id(name)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

    if (error) {
      console.warn("Could not load transactions:", error.message);
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const groupedTransactions = useMemo(() => {
    const groups = new Map();
    const sourceTransactions =
      activeTab === "Daily" && selectedDate
        ? transactions.filter(
            (transaction) =>
              formatDateKey(parseStoredDate(transaction.date)) === selectedDate
          )
        : transactions;

    sourceTransactions.forEach((transaction) => {
      const key = getGroupKey(activeTab, transaction.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: new Date(key),
          title: formatSectionTitle(activeTab, transaction.date),
          total: 0,
          items: [],
        });
      }

      const group = groups.get(key);
      group.items.push(transaction);
      group.total += getSignedAmount(transaction);
    });

    return Array.from(groups.values()).sort((a, b) => b.date - a.date);
  }, [activeTab, selectedDate, transactions]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transactions</Text>

        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {groupedTransactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No transactions found</Text>
            <Text style={styles.emptySub}>
              Add a transaction to start seeing daily, weekly, monthly, and yearly summaries.
            </Text>
          </View>
        ) : (
          groupedTransactions.map((group) => (
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
                  {formatCurrency(group.total)}
                </Text>
              </View>

              <View style={styles.groupCard}>
                {group.items.map((item, index) => {
                  const accountLabel =
                    item.type === "transfer"
                      ? `${item.account?.name || "Account"}`
                      : item.account?.name || item.categories?.name || "Account";

                  return (
                    <TransactionListItem
                      key={item.id}
                      title={item.title || item.categories?.name || "Transaction"}
                      accountLabel={accountLabel}
                      dateLabel={getTransactionDateLabel(item.date)}
                      amount={item.amount}
                      time={item.time}
                      transactionType={item.type}
                      categoryColor={item.categories?.color || "#5a4138"}
                      categoryIcon={item.categories?.icon || "credit-card-outline"}
                      showDivider={index !== group.items.length - 1}
                    />
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tabItem, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
    paddingTop: 8,
    paddingBottom: 16,
  },

  headerButton: {
    width: 32,
    alignItems: "center",
  },

  headerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },

  container: {
    paddingHorizontal: 16,
    paddingBottom: 124,
  },

  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    marginTop: 20,
  },

  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },

  emptySub: {
    color: "#d4c1b7",
    marginTop: 10,
    lineHeight: 20,
  },

  groupSection: {
    marginBottom: 22,
  },

  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  groupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  groupTotal: {
    color: "#d9cdc6",
    fontSize: 15,
    fontWeight: "700",
  },

  groupTotalExpense: {
    color: "#ff948b",
  },

  groupTotalIncome: {
    color: "#8af09a",
  },

  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    overflow: "hidden",
  },

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
});
