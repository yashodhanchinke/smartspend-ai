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

export default function LoansScreen({ navigation }) {
  const [loans, setLoans] = useState([]);

  const fetchLoans = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoans([]);
    const { data } = await supabase
      .from("loans")
      .select("id,name,amount,type,start_date,end_date,description")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });
    setLoans(data || []);
  }, []);

  useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Loans" />
      {loans.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="credit-card" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No loans found</Text>
          <Text style={styles.emptySubtitle}>You have not added any loans yet. Tap the + button to add your first loan.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {loans.map((loan) => (
            <Pressable
              key={loan.id}
              style={styles.card}
              onPress={() => navigation.navigate("UpdateLoan", { loan })}
            >
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{loan.name || "Loan"}</Text>
                <View style={[styles.typePill, loan.type === "borrowing" && styles.typePillBorrowing]}>
                  <Text style={styles.typeText}>{loan.type === "borrowing" ? "Borrowing" : "Lending"}</Text>
                </View>
              </View>
              <Text style={styles.cardAmount}>{formatCurrency(loan.amount)}</Text>
              {loan.description ? <Text style={styles.cardDescription}>{loan.description}</Text> : null}
              <Text style={styles.cardMeta}>{loan.start_date || "-"} to {loan.end_date || "-"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <FloatingButton onPress={() => navigation.navigate("AddLoan")} />
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
  typePill: { backgroundColor: "#6b681c", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  typePillBorrowing: { backgroundColor: "#7a4d37" },
  typeText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  cardAmount: { color: "#ffb49a", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  cardDescription: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  cardMeta: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
