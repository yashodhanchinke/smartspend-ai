import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

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

    const { data, error } = await supabase
      .from("budgets")
      .select(`
        id,
        name,
        amount,
        spent,
        period,
        color,
        mode,
        budget_type,
        budget_categories (
          category_id,
          categories (
            id,
            name,
            icon,
            color
          )
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Could not load budgets:", error.message);
      setBudgets([]);
      return;
    }

    setBudgets(data || []);
  }, []);

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
            const spent = Number(budget.spent || 0);
            const progress = amount > 0 ? Math.min(spent / amount, 1) : 0;
            const linkedCategories = (budget.budget_categories || [])
              .map((entry) => entry.categories)
              .filter(Boolean);
            const leadCategory = linkedCategories[0];

            return (
              <View key={budget.id} style={styles.card}>
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
                        {(budget.period || "monthly").replace(/^./, (value) => value.toUpperCase())} • {budget.budget_type === "overall" ? "Overall" : `${linkedCategories.length} categories`}
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

                <View style={styles.categoryWrap}>
                  {linkedCategories.slice(0, 3).map((category) => (
                    <View key={category.id} style={styles.categoryChip}>
                      <MaterialCommunityIcons name={category.icon || "tag"} size={15} color={category.color || "#ffb49a"} />
                      <Text style={styles.categoryChipText}>{category.name}</Text>
                    </View>
                  ))}
                  {linkedCategories.length > 3 ? (
                    <View style={styles.categoryChip}>
                      <Text style={styles.categoryChipText}>+{linkedCategories.length - 3} more</Text>
                    </View>
                  ) : null}
                </View>
              </View>
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
    borderRadius: 24,
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
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4a332d",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipText: { color: colors.text, fontSize: 13, fontWeight: "700", marginLeft: 8 },
});
