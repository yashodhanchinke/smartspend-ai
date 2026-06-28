import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
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
        .order("name", { ascending: true }),
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
      summary.totalAmount += getSignedAmount(linkedTransaction);
    });

    setLabels(nextLabels);
    setLabelSummaries([...summaryMap.values()]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLabels();
    }, [fetchLabels])
  );

  const labelCountText = useMemo(() => {
    if (!labels.length) {
      return "0/0";
    }

    return `${labelSummaries.length}/${labels.length}`;
  }, [labelSummaries.length, labels.length]);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Labels" />

      <View style={styles.headerRow}>
        <Text style={styles.headerSubtitle}>
          {labelSummaries.length} label{labelSummaries.length === 1 ? "" : "s"}
        </Text>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillText}>{labelCountText}</Text>
        </View>
      </View>

      {labels.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="tag" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No labels found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any labels yet. Tap the + button to add your first label.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          <View style={styles.rowList}>
            {labelSummaries.map((label, index) => (
              <Pressable
                key={label.id}
                style={[
                  styles.labelRow,
                  index !== labelSummaries.length - 1 && styles.labelRowDivider,
                ]}
                onPress={() => navigation.navigate("LabelDetails", { label })}
              >
                <View style={styles.labelLeft}>
                  <View style={[styles.iconWrap, { backgroundColor: `${label.color || "#ffb49a"}22` }]}>
                    <MaterialCommunityIcons
                      name="tag"
                      size={22}
                      color={label.color || "#ffb49a"}
                    />
                  </View>

                  <View style={styles.labelTextWrap}>
                    <Text style={styles.labelName} numberOfLines={1}>
                      {label.name}
                    </Text>
                    <Text style={styles.labelMeta}>
                      {label.totalTransactions}{" "}
                      {label.totalTransactions === 1 ? "transaction" : "transactions"}
                    </Text>
                  </View>
                </View>

                <Text
                  style={[
                    styles.labelAmount,
                    label.totalAmount < 0 && styles.labelAmountNegative,
                    label.totalAmount > 0 && styles.labelAmountPositive,
                  ]}
                  numberOfLines={1}
                >
                  {formatCurrency(label.totalAmount)}
                </Text>
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 10,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  summaryPill: {
    backgroundColor: "#2d1f1a",
    borderWidth: 1,
    borderColor: "#7d4e2b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryPillText: {
    color: "#e5a44e",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
    lineHeight: 26,
    fontSize: 15,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 110,
  },
  rowList: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#4f3831",
    overflow: "hidden",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  labelRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 233, 220, 0.08)",
  },
  labelLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  labelTextWrap: {
    flex: 1,
  },
  labelName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  labelMeta: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
  },
  labelAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  labelAmountNegative: {
    color: "#ff958b",
  },
  labelAmountPositive: {
    color: "#8df09d",
  },
});
