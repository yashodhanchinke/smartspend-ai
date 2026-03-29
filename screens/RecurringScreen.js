import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function RecurringScreen({ navigation }) {
  const [items, setItems] = useState([]);

  const fetchRecurring = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setItems([]);
    const { data } = await supabase
      .from("recurring_transactions")
      .select("id,title,amount,type,period,next_run,account_id,category_id,accounts(name),categories(name)")
      .eq("user_id", user.id)
      .order("next_run");
    setItems(data || []);
  }, []);

  useFocusEffect(useCallback(() => { fetchRecurring(); }, [fetchRecurring]));

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Recurring" />
      {items.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="repeat" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No recurring transactions found</Text>
          <Text style={styles.emptySubtitle}>You have not added any recurring transactions yet. Tap the + button to add your first recurring transaction.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => navigation.navigate("UpdateRecurring", { recurring: item })}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.title || "Recurring transaction"}</Text>
                <View style={[styles.typePill, item.type === "income" && styles.typePillIncome]}>
                  <Text style={styles.typeText}>{item.type === "income" ? "Income" : "Expense"}</Text>
                </View>
              </View>
              <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
              <Text style={styles.cardMeta}>
                {item.period} • {item.next_run || "-"}
              </Text>
              <Text style={styles.cardSub}>
                {(item.accounts?.name || "No account")} • {(item.categories?.name || "No category")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <FloatingButton onPress={() => navigation.navigate("AddRecurring")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", marginTop: 8, lineHeight: 28, fontSize: 16 },
  listContent: { paddingTop: 12, paddingBottom: 110 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700", flex: 1, marginRight: 10 },
  typePill: { backgroundColor: "#7a4d37", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  typePillIncome: { backgroundColor: "#395b35" },
  typeText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  cardAmount: { color: "#ffb49a", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  cardMeta: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  cardSub: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
