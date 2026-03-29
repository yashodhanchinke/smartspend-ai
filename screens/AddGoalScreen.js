import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ColorPickerTabs from "../components/ColorPickerTabs";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const GOAL_COLORS = ["#FF4B3E", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#1E88E5", "#14A3E6", "#18B4C9", "#169C92", "#4CAF50", "#8BC34A", "#D4E629", "#FFEB3B", "#FFC107", "#FF9800", "#FF5722", "#8D6656", "#6E8898", "#A5A5A5", "#F0DEE2", "#F2C2CB", "#E9969E", "#E97779", "#F2524E", "#FF4433", "#EF3B39", "#DF2F2F", "#C62828"];

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

export default function AddGoalScreen({ navigation, route }) {
  const goal = route?.params?.goal || null;
  const isEditMode = route?.name === "UpdateGoal" || Boolean(goal?.id);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [selectedColor, setSelectedColor] = useState("#FF4433");
  const [pickerConfig, setPickerConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!goal) {
      return;
    }

    setTitle(goal.title || "");
    setAmount(String(goal.target_amount ?? ""));
    setStartDate(goal.start_date ? new Date(goal.start_date) : new Date());
    setEndDate(goal.end_date ? new Date(goal.end_date) : new Date());
    setSelectedColor(goal.color || "#FF4433");
  }, [goal]);

  const saveGoal = async () => {
    if (!title.trim()) return Alert.alert("Error", "Enter a goal title");
    if (!amount.trim() || Number(amount) <= 0) return Alert.alert("Error", "Enter a valid target amount");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const payload = { user_id: user.id, title: title.trim(), target_amount: Number(amount), current_amount: goal?.current_amount || 0, start_date: startDate.toISOString().split("T")[0], end_date: endDate.toISOString().split("T")[0], color: selectedColor };
      const { error } = isEditMode
        ? await supabase.from("goals").update(payload).eq("id", goal.id).eq("user_id", user.id)
        : await supabase.from("goals").insert([payload]);
      if (error) throw error;
      Alert.alert("Success", isEditMode ? "Goal updated successfully." : "Goal added successfully.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || `Could not ${isEditMode ? "update" : "save"} goal.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={formStyles.container}>
      <ScreenHeader title={isEditMode ? "Update goal" : "Add goal"} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={formStyles.content}>
        <View style={formStyles.inlineField}>
          <View style={formStyles.leadingIcon}>
            <MaterialCommunityIcons name="card-text-outline" size={24} color="#f7ddd4" />
          </View>
          <TextInput style={[formStyles.input, formStyles.inlineInput]} placeholder="Ex: Trip to Japan" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} />
        </View>
        <TextInput style={formStyles.input} placeholder="Amount" placeholderTextColor={colors.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
        <View style={formStyles.dateRow}>
          <Pressable style={formStyles.dateCard} onPress={() => setPickerConfig({ field: "start", mode: "date", value: startDate })}>
            <Feather name="calendar" size={25} color={colors.text} />
            <View><Text style={formStyles.dateLabel}>Start date</Text><Text style={formStyles.dateValue}>{formatDate(startDate)}</Text></View>
          </Pressable>
          <Pressable style={formStyles.dateCard} onPress={() => setPickerConfig({ field: "end", mode: "date", value: endDate })}>
            <Feather name="calendar" size={25} color={colors.text} />
            <View><Text style={formStyles.dateLabel}>End date</Text><Text style={formStyles.dateValue}>{formatDate(endDate)}</Text></View>
          </Pressable>
        </View>
        <Text style={formStyles.sectionTitle}>Colors</Text>
        <ColorPickerTabs palette={GOAL_COLORS} selectedColor={selectedColor} onSelectColor={setSelectedColor} />
      </ScrollView>
      <Pressable style={formStyles.saveButton} onPress={saveGoal} disabled={saving}>
        <MaterialCommunityIcons name="content-save-outline" size={24} color="#2f1814" />
        <Text style={formStyles.saveButtonText}>{saving ? "Saving..." : isEditMode ? "Update" : "Add"}</Text>
      </Pressable>
      {pickerConfig ? <DateTimePicker value={pickerConfig.value} mode={pickerConfig.mode} display="default" onChange={(_, pickedDate) => { if (!pickedDate) return setPickerConfig(null); if (pickerConfig.field === "start") setStartDate(pickedDate); else setEndDate(pickedDate); setPickerConfig(null); }} /> : null}
    </SafeAreaView>
  );
}

const formStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#24130f" },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 },
  inlineField: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  leadingIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#8f675c", alignItems: "center", justifyContent: "center", marginRight: 18 },
  input: { height: 76, borderRadius: 22, borderWidth: 1, borderColor: "#3d2620", backgroundColor: "#24130f", paddingHorizontal: 20, color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 18 },
  inlineInput: { flex: 1, marginBottom: 0 },
  dateRow: { flexDirection: "row", gap: 14, marginTop: 4, marginBottom: 24 },
  dateCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dateLabel: { color: colors.text, fontSize: 18, fontWeight: "700" },
  dateValue: { color: colors.muted, fontSize: 16, marginTop: 4, fontWeight: "700" },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  saveButton: { position: "absolute", left: 24, right: 24, bottom: 22, height: 70, borderRadius: 35, backgroundColor: "#ffb49a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  saveButtonText: { color: "#2f1814", fontSize: 20, fontWeight: "800" },
});
