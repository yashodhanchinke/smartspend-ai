import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import { getAccountColor, getAccountIconName } from "../util/accountAppearance";

const { width } = Dimensions.get("window");
const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

const DEFAULT_ACCOUNTS = [
  { id: "bank-default", name: "Bank", type: "bank", balance: 0 },
  { id: "cash-default", name: "Cash", type: "cash", balance: 0 },
];

export default function AccountsScreen({ navigation, route }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [profileName, setProfileName] = useState("");
  const flatRef = useRef(null);
  const selectedAccountIdRef = useRef(null);

  const selectedAccount = accounts[selectedIndex] || null;

  useEffect(() => {
    selectedAccountIdRef.current = selectedAccount?.id || null;
  }, [selectedAccount?.id]);

  const hydrateAccounts = useCallback((data) => {
    const baseAccounts = data?.length ? data : DEFAULT_ACCOUNTS;
    const usedColors = new Set();

    return baseAccounts.map((account, index) => {
      let nextColor = getAccountColor(account, index);

      if (usedColors.has(nextColor)) {
        nextColor = getAccountColor({ ...account, color: null }, index + 1);
      }

      usedColors.add(nextColor);

      return {
        ...account,
        color: nextColor,
      };
    });
  }, []);

  const fetchTransactions = useCallback(async (account) => {
    if (!account) {
      setTransactions([]);
      setIncomeTotal(0);
      setExpenseTotal(0);
      return;
    }

    const isDefaultAccount = String(account.id).includes("-default");
    let query = supabase.from("transactions").select(`
      *,
      categories(name,color,icon)
    `);

    if (isDefaultAccount) {
      query = query.eq("account_id", "__no_account__");
    } else {
      query = query.or(`account_id.eq.${account.id},to_account_id.eq.${account.id}`);
    }

    const { data } = await query.order("date", { ascending: false }).order("time", {
      ascending: false,
    });

    const tx = data || [];
    setTransactions(tx);

    let income = 0;
    let expense = 0;

    tx.forEach((transaction) => {
      const amount = Number(transaction.amount || 0);

      if (transaction.type === "income") {
        income += amount;
      } else if (transaction.type === "expense") {
        expense += amount;
      } else if (transaction.type === "transfer") {
        if (transaction.account_id === account.id) {
          expense += amount;
        }

        if (transaction.to_account_id === account.id) {
          income += amount;
        }
      }
    });

    setIncomeTotal(income);
    setExpenseTotal(expense);
  }, []);

  const fetchAccounts = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAccounts(hydrateAccounts([]));
      return;
    }

    const [{ data: accountData }, { data: profile }] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("profiles").select("name").eq("id", user.id).single(),
    ]);

    const hydrated = hydrateAccounts(accountData);
    const previousAccountId = selectedAccountIdRef.current;
    const nextIndex = Math.max(
      hydrated.findIndex((account) => account.id === previousAccountId),
      0
    );

    setProfileName(profile?.name || "");
    setAccounts(hydrated);
    setSelectedIndex(nextIndex);

    if (hydrated.length > 0 && nextIndex > 0) {
      requestAnimationFrame(() => {
        flatRef.current?.scrollToOffset?.({
          offset: width * nextIndex,
          animated: false,
        });
      });
    }

    await fetchTransactions(hydrated[nextIndex]);
  }, [fetchTransactions, hydrateAccounts]);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [fetchAccounts])
  );

  useEffect(() => {
    if (route?.params?.refreshAt) {
      fetchAccounts();
    }
  }, [fetchAccounts, route?.params?.refreshAt]);

  useEffect(() => {
    let isMounted = true;
    let channel;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        return;
      }

      channel = supabase
        .channel(`accounts-screen-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "accounts",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchAccounts();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchAccounts();
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
  }, [fetchAccounts]);

  const handleScrollEnd = ({ nativeEvent }) => {
    const index = Math.round(nativeEvent.contentOffset.x / width);
    const safeIndex = Math.max(0, Math.min(index, accounts.length - 1));

    setSelectedIndex(safeIndex);
    fetchTransactions(accounts[safeIndex]);
  };

  const renderCard = ({ item, index }) => (
    <View style={styles.cardPage}>
      <TouchableOpacity
        style={[styles.accountCard, { backgroundColor: item.color }]}
        activeOpacity={String(item.id).includes("-default") ? 1 : 0.9}
        onPress={() => {
          if (!String(item.id).includes("-default")) {
            navigation.navigate("UpdateAccount", { account: item });
          }
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderTextWrap}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.accountTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.accountUser}>
                {(profileName || "Account").trim().split(" ")[0]}
              </Text>
            </View>
          </View>

          <View style={styles.accountIconWrap}>
            <Ionicons name={getAccountIconName(item)} size={26} color="#f7efe8" />
          </View>
        </View>

        <View style={styles.balanceBlock}>
          <Text style={styles.balanceLabel}>Total balance</Text>
          <Text style={styles.balanceValue}>₹{Number(item.balance || 0).toFixed(2)}</Text>
        </View>

        <Text style={styles.cardCount}>
          Account {index + 1} of {accounts.length}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const emptyAccountName = selectedAccount?.name || "this account";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <FlatList
          ref={flatRef}
          data={accounts}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => String(item.id)}
          onMomentumScrollEnd={handleScrollEnd}
          nestedScrollEnabled
        />

        <View style={styles.dots}>
          {accounts.map((account, index) => (
            <View
              key={account.id}
              style={[
                styles.dot,
                selectedIndex === index && [styles.activeDot, { backgroundColor: account.color }],
              ]}
            />
          ))}
        </View>

        <View style={styles.compareRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.compareLabel}>Income</Text>
            <Text style={styles.income}>₹{incomeTotal.toFixed(2)}</Text>
            <Text style={styles.compareSub}>For {emptyAccountName}</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.compareLabel}>Expense</Text>
            <Text style={styles.expense}>₹{expenseTotal.toFixed(2)}</Text>
            <Text style={styles.compareSub}>For {emptyAccountName}</Text>
          </View>
        </View>

        <View style={styles.txSection}>
          {transactions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={54} color="#e8d9d1" />
              <Text style={styles.emptyTitle}>No transactions found for {emptyAccountName}</Text>
              <Text style={styles.emptySub}>Please add transactions to this account</Text>
            </View>
          ) : (
            transactions.map((transaction, index) => {
              const amount = Number(transaction.amount || 0);
              const isExpense =
                transaction.type === "expense" ||
                (transaction.type === "transfer" &&
                  transaction.account_id === selectedAccount?.id);

              return (
                <TransactionListItem
                  key={transaction.id}
                  title={transaction.title || transaction.categories?.name || "Transaction"}
                  accountLabel={selectedAccount?.name || "Account"}
                  dateLabel={parseStoredDate(transaction.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  amount={amount}
                  time={transaction.time}
                  transactionType={isExpense ? "expense" : "income"}
                  amountPrefix={isExpense ? "-" : "+"}
                  categoryColor={transaction.categories?.color || "#5a4138"}
                  categoryIcon={transaction.categories?.icon || "bank-transfer"}
                  showDivider={index !== transactions.length - 1}
                />
              );
            })
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddAccount")}
      >
        <Ionicons name="add" size={26} color="#20120d" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#1a0f0a" },
  content: { flex: 1 },
  contentContainer: { paddingTop: 8, paddingBottom: 120 },
  cardPage: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  accountCard: {
    width: "100%",
    minHeight: 205,
    borderRadius: 28,
    padding: 22,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cardHeader: {
    position: "relative",
    minHeight: 48,
    justifyContent: "center",
  },
  cardHeaderTextWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 20,
    paddingRight: 68,
  },
  cardHeaderText: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  accountTitle: { color: "#fff8f2", fontSize: 16, fontWeight: "800", textAlign: "center" },
  accountUser: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
    textAlign: "center",
  },
  accountIconWrap: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceBlock: { marginTop: 44 },
  balanceLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: "600",
  },
  balanceValue: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  cardCount: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 18,
    fontSize: 12,
    fontWeight: "600",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    marginTop: 14,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#6a5650",
  },
  activeDot: {
    width: 20,
  },
  compareRow: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 20,
    marginTop: 18,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#241611",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3c2822",
  },
  compareLabel: { color: "#f1dfd5", fontSize: 16, fontWeight: "700" },
  income: { color: "#6ddf9c", fontWeight: "800", fontSize: 22, marginTop: 6 },
  expense: { color: "#ff8b8b", fontWeight: "800", fontSize: 22, marginTop: 6 },
  compareSub: { color: "#bfa9a0", fontSize: 12, marginTop: 8 },
  txSection: { marginTop: 20, paddingHorizontal: 20 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    minHeight: 280,
  },
  emptyTitle: {
    color: "#fff",
    marginTop: 14,
    fontWeight: "700",
    fontSize: 22,
    textAlign: "center",
  },
  emptySub: {
    color: "#bfa9a0",
    marginTop: 8,
    fontSize: 15,
    textAlign: "center",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#241611",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#3c2822",
  },
  txLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
  catIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  txCopy: { flex: 1 },
  txTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  txSub: { color: "#bfa9a0", fontSize: 12, marginTop: 4 },
  txAmount: { fontWeight: "800", fontSize: 15 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffb28f",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
});
