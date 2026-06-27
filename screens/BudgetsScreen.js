import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { buildBudgetInsights, loadBudgetNotificationContext } from "../util/budgetInsights";

export default function BudgetsScreen({ navigation }) {
  const [budgets, setBudgets] = useState([]);

  const fetchBudgets = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setBudgets([]);
      return;
    }

    try {
      const context = await loadBudgetNotificationContext(user.id);
      const nextBudgets = buildBudgetInsights(context);

      setBudgets(nextBudgets);
    } catch (error) {
      console.warn("Could not load budgets:", error.message);
      setBudgets([]);
    }
  }, []);

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
        .channel(`budgets-screen-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${user.id}` },
          () => {
            fetchBudgets();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budgets", filter: `user_id=eq.${user.id}` },
          () => {
            fetchBudgets();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "categories", filter: `user_id=eq.${user.id}` },
          () => {
            fetchBudgets();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budget_categories" },
          () => {
            fetchBudgets();
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
  }, [fetchBudgets]);

  useFocusEffect(
    useCallback(() => {
      fetchBudgets();
    }, [fetchBudgets])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Budgets" navigation={navigation} />

      {budgets.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="credit-card" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No budgets found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any budgets yet. Tap the + button to add your first budget.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {budgets.map((budget) => {
            const amount = Number(budget.amount || 0);
            const spent = Number(budget.liveSpent || 0);
            const progress = amount > 0 ? Math.min(budget.progress || 0, 1) : 0;
            const linkedCategories = budget.linkedCategories || [];
            const leadCategory = linkedCategories[0];

            return (
              <Pressable
                key={budget.id}
                style={styles.card}
                onPress={() => navigation.navigate("BudgetDetails", { budgetId: budget.id, budget })}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardLeft}>
                    <View style={[styles.iconBadge, { backgroundColor: `${budget.color || "#ffb49a"}33` }]}>
                      <MaterialCommunityIcons
                        name={leadCategory?.icon || (budget.budget_type === "overall" ? "wallet-outline" : "shape-outline")}
                        size={22}
                        color={budget.color || "#ffb49a"}
                      />
                    </View>
                    <View style={styles.titleBlock}>
                      <Text style={styles.cardTitle}>{budget.name || "Budget"}</Text>
                      <Text style={styles.cardMeta}>
                        {(budget.period || "monthly").replace(/^./, (value) => value.toUpperCase())} • {budget.budget_type === "overall" ? "Overall" : "Category"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{budget.mode === "manual" ? "Manual" : "Automatic"}</Text>
                  </View>
                </View>

                <Text style={styles.amountText}>₹{amount.toFixed(2)}</Text>
                <Text style={styles.spentText}>₹{spent.toFixed(2)} spent</Text>

                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: budget.color || "#ffb49a" }]} />
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Spent</Text>
                    <Text style={styles.statValue}>₹{spent.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Budget</Text>
                    <Text style={styles.statValue}>₹{amount.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Remaining</Text>
                    <Text style={styles.statValue}>₹{Math.max(amount - spent, 0).toFixed(2)}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FloatingButton onPress={() => navigation.navigate("AddBudget")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },

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
    lineHeight: 28,
    fontSize: 16,
  },

  listContent: { paddingTop: 12, paddingBottom: 110 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  titleBlock: { flex: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  cardMeta: { color: colors.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  pill: { backgroundColor: "#5d3b31", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  amountText: { color: "#ffb49a", fontSize: 24, fontWeight: "800", marginBottom: 6 },
  spentText: { color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 12 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "#533a34", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  statBlock: { flex: 1 },
  statLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
});
