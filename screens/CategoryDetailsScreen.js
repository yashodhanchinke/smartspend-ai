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
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function CategoryDetailsScreen({ navigation }) {
  const route = useRoute();
  const { category } = route.params;

  const [transactions, setTransactions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [])
  );

  const fetchTransactions = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("category_id", category.id);

    setTransactions(data || []);
  };

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

        <View style={{ width: 26 }} />
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
          transactions.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.categoryLabel}>{item.title}</Text>
              <Text style={styles.amount}>₹{item.amount}</Text>
            </View>
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

  row: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  categoryLabel: {
    color: colors.text,
    fontWeight: "600",
  },

  amount: {
    fontWeight: "700",
    color: colors.text,
  },
});
