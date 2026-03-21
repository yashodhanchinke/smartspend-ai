import Feather from "@expo/vector-icons/Feather";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

export default function AddLoanScreen({ navigation }) {
  const [loanType, setLoanType] = useState("lend");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [pickerConfig, setPickerConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  const saveLoan = async () => {
    if (!name.trim()) return Alert.alert("Error", "Enter loan name");
    if (!amount.trim() || Number(amount) <= 0) return Alert.alert("Error", "Enter a valid amount");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const { error } = await supabase.from("loans").insert([{ user_id: user.id, name: name.trim(), amount: Number(amount), type: loanType === "lend" ? "lending" : "borrowing", start_date: startDate.toISOString().split("T")[0], end_date: endDate.toISOString().split("T")[0], description: description.trim() }]);
      if (error) throw error;
      Alert.alert("Success", "Loan added successfully.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not save loan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Add loan" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.segmentRow}>
          {[{ key: "lend", label: "Lending" }, { key: "borrow", label: "Borrowing" }].map((item) => (
            <Pressable key={item.key} style={[styles.segment, loanType === item.key && styles.segmentActive]} onPress={() => setLoanType(item.key)}>
              <Text style={[styles.segmentText, loanType === item.key && styles.segmentTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={colors.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
        <TextInput style={[styles.input, styles.descriptionInput]} placeholder="Description" placeholderTextColor={colors.muted} multiline value={description} onChangeText={setDescription} />
        <View style={styles.dateRow}>
          <Pressable style={styles.dateCard} onPress={() => setPickerConfig({ field: "start", value: startDate })}>
            <Feather name="calendar" size={25} color={colors.text} />
            <View><Text style={styles.dateLabel}>Start date</Text><Text style={styles.dateValue}>{formatDate(startDate)}</Text></View>
          </Pressable>
          <Pressable style={styles.dateCard} onPress={() => setPickerConfig({ field: "end", value: endDate })}>
            <Feather name="calendar" size={25} color={colors.text} />
            <View><Text style={styles.dateLabel}>End date</Text><Text style={styles.dateValue}>{formatDate(endDate)}</Text></View>
          </Pressable>
        </View>
      </ScrollView>
      <Pressable style={styles.saveButton} onPress={saveLoan} disabled={saving}>
        <Feather name="save" size={24} color="#2f1814" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Add"}</Text>
      </Pressable>
      {pickerConfig ? <DateTimePicker value={pickerConfig.value} mode="date" display="default" onChange={(_, pickedDate) => { if (!pickedDate) return setPickerConfig(null); if (pickerConfig.field === "start") setStartDate(pickedDate); else setEndDate(pickedDate); setPickerConfig(null); }} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#24130f" },
  content: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 120 },
  segmentRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  segment: { paddingHorizontal: 24, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#6b681c" },
  segmentActive: { backgroundColor: "#ffb49a" },
  segmentText: { color: "#f8e8d7", fontSize: 17, fontWeight: "700" },
  segmentTextActive: { color: "#2f1814" },
  input: { height: 74, borderRadius: 22, borderWidth: 1, borderColor: "#3d2620", backgroundColor: "#24130f", paddingHorizontal: 20, color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 18 },
  descriptionInput: { height: 92, paddingTop: 18, textAlignVertical: "top" },
  dateRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  dateCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dateLabel: { color: colors.text, fontSize: 18, fontWeight: "700" },
  dateValue: { color: colors.muted, fontSize: 16, marginTop: 4, fontWeight: "700" },
  saveButton: { position: "absolute", left: 24, right: 24, bottom: 22, height: 70, borderRadius: 35, backgroundColor: "#ffb49a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  saveButtonText: { color: "#2f1814", fontSize: 20, fontWeight: "800" },
});
