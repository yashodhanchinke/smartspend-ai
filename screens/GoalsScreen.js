import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function GoalsScreen({ navigation }) {
  const [goals, setGoals] = useState([]);

  const fetchGoals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setGoals([]);
      return;
    }

    const { data } = await supabase
      .from("goals")
      .select("id,title,target_amount,current_amount,start_date,end_date,color")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });

    setGoals(data || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchGoals();
    }, [fetchGoals])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Goals" />

      {goals.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="target" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No goals found</Text>
          <Text style={styles.emptySubtitle}>
            You have not added any goals yet. Tap the + button to add your first goal.
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          {goals.map((goal) => {
            const target = Number(goal.target_amount || 0);
            const current = Number(goal.current_amount || 0);
            const progress = target > 0 ? Math.min(current / target, 1) : 0;

            return (
              <View key={goal.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.colorDot, { backgroundColor: goal.color || "#ffb49a" }]} />
                  <Text style={styles.cardTitle}>{goal.title || "Goal"}</Text>
                </View>
                <Text style={styles.cardAmount}>
                  {formatCurrency(current)} / {formatCurrency(target)}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: goal.color || "#ffb49a" }]} />
                </View>
                <Text style={styles.cardMeta}>
                  {goal.start_date || "-"} to {goal.end_date || "-"}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <FloatingButton onPress={() => navigation.navigate("AddGoal")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  emptyWrapper: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 16 },
  emptySubtitle: { color: colors.muted, textAlign: "center", marginTop: 8, lineHeight: 28, fontSize: 16 },
  listContent: { paddingBottom: 110, paddingTop: 12 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  cardAmount: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  progressTrack: { height: 10, borderRadius: 999, backgroundColor: "#533a34", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  cardMeta: { color: colors.muted, marginTop: 12, fontSize: 13, fontWeight: "600" },
});
