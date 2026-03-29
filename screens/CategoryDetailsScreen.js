// screens/CategoryDetailsScreen.js

import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useState } from "react";
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

const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

export default function CategoryDetailsScreen({ navigation }) {
  const route = useRoute();
  const { category } = route.params;

  const [transactions, setTransactions] = useState([]);

  const fetchTransactions = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const [{ data }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(`
          *,
          categories(name,color,icon)
        `)
        .eq("user_id", user.id)
        .eq("category_id", category.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

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

  const total = transactions.reduce(
    (sum, t) => sum + Number(t.amount),
    0
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{category.name}</Text>

        <TouchableOpacity onPress={() => navigation.navigate("UpdateCategory", { category })}>
          <Feather name="edit-2" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.totalAmount}>₹{total.toFixed(2)}</Text>
        <Text style={styles.subTitle}>
          {transactions.length} transactions
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {transactions.length === 0 ? (
          <Text style={styles.noData}>No transactions found</Text>
        ) : (
          transactions.map((item, index) => (
            <TransactionListItem
              key={item.id}
              title={item.title || item.categories?.name || "Transaction"}
              accountLabel={item.account?.name || "Account"}
              dateLabel={parseStoredDate(item.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
              amount={item.amount}
              time={item.time}
              transactionType={item.type}
              categoryColor={item.categories?.color || category.color}
              categoryIcon={item.categories?.icon || category.icon}
              showDivider={index !== transactions.length - 1}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    padding: 16,
    justifyContent: "space-between",
  },

  headerTitle: {
    fontSize: 22,
    color: colors.text,
    fontWeight: "700",
  },

  summaryCard: {
    backgroundColor: colors.card,
    margin: 16,
    padding: 20,
    borderRadius: 18,
    alignItems: "center",
  },

  totalAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },

  subTitle: {
    color: colors.muted,
    marginTop: 4,
  },

  noData: {
    textAlign: "center",
    color: colors.muted,
    marginTop: 40,
  },

});
