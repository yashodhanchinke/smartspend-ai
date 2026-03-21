import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import FloatingButton from "../components/FloatingButton";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function LabelsScreen({ navigation }) {
  const [labels, setLabels] = useState([]);

  const fetchLabels = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLabels([]);
    const { data } = await supabase
      .from("labels")
      .select("id,name,color")
      .eq("user_id", user.id)
      .order("name");
    setLabels(data || []);
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
          <View style={styles.wrap}>
            {labels.map((label) => (
              <View key={label.id} style={[styles.chip, { borderColor: label.color || "#ffb49a" }]}>
                <View style={[styles.dot, { backgroundColor: label.color || "#ffb49a" }]} />
                <Text style={styles.chipText}>{label.name}</Text>
              </View>
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  chipText: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
