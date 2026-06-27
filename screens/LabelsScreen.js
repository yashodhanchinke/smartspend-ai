import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function LabelsScreen({ navigation }) {
  const [labels, setLabels] = useState([]);
  const [labelSummaries, setLabelSummaries] = useState([]);

  const fetchLabels = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLabels([]);
      setLabelSummaries([]);
      return;
    }

    const [
      { data: labelRows, error: labelError },
      { data: labelTransactionRows, error: transactionLabelError },
    ] = await Promise.all([
      supabase
        .from("labels")
        .select("id,name,color")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("transaction_labels")
        .select(
          `
          label_id,
          transactions (
            id,
            amount,
            type
          )
        `
        )
        .eq("user_id", user.id),
    ]);

    if (labelError) {
      console.warn("Could not load labels:", labelError.message);
      setLabels([]);
      setLabelSummaries([]);
      return;
    }

    if (transactionLabelError) {
      console.warn("Could not load label transactions:", transactionLabelError.message);
    }

    const nextLabels = labelRows || [];
    const summaryMap = new Map(
      nextLabels.map((label) => [
        label.id,
        {
          ...label,
          totalTransactions: 0,
          totalAmount: 0,
        },
      ])
    );

    (labelTransactionRows || []).forEach((row) => {
      const summary = summaryMap.get(row.label_id);
      const linkedTransaction = Array.isArray(row.transactions)
        ? row.transactions[0]
        : row.transactions;

      if (!summary || !linkedTransaction) {
        return;
      }

      summary.totalTransactions += 1;
      summary.totalAmount += Math.abs(Number(linkedTransaction.amount || 0));
    });

    setLabels(nextLabels);
    setLabelSummaries([...summaryMap.values()]);
  }, []);

  useFocusEffect(useCallback(() => { fetchLabels(); }, [fetchLabels]));

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Labels" />
      {labels.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="tag" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No labels found</Text>
          <Text style={styles.emptySubtitle}>You have not added any labels yet. Tap the + button to add your first label.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          <View style={styles.summaryList}>
            {labelSummaries.map((label) => (
              <Pressable
                key={label.id}
                style={[styles.summaryCard, { borderColor: label.color || "#ffb49a" }]}
                onPress={() => navigation.navigate("UpdateLabel", { label })}
              >
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryTitleRow}>
                    <View style={[styles.dot, { backgroundColor: label.color || "#ffb49a" }]} />
                    <Text style={styles.summaryTitle} numberOfLines={1}>
                      {label.name}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.muted} />
                </View>

                <View style={styles.summaryStats}>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>Total transactions</Text>
                    <Text style={styles.summaryStatValue}>
                      {label.totalTransactions}
                    </Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatLabel}>Total spent</Text>
                    <Text style={styles.summaryStatValue}>
                      ₹{label.totalAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      <FloatingButton onPress={() => navigation.navigate("AddLabel")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", marginTop: 8, lineHeight: 28, fontSize: 16 },
  listContent: { paddingTop: 12, paddingBottom: 110 },
  summaryList: { gap: 14 },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  summaryTitle: { color: colors.text, fontSize: 17, fontWeight: "800", flexShrink: 1 },
  summaryStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryStat: {
    flex: 1,
  },
  summaryStatLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  summaryStatValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  summaryDivider: {
    width: 1,
    height: "100%",
    backgroundColor: "#5b433c",
    marginHorizontal: 12,
  },
});
