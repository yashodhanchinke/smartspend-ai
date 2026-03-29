import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../data/categories";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const PERIODS = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"];
function formatDate(date) { return new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date); }
function formatTime(date) { return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date); }

export default function AddRecurringScreen({ navigation, route }) {
  const recurringItem = route?.params?.recurring || null;
  const isEditMode = route?.name === "UpdateRecurring" || Boolean(recurringItem?.id);
  const [type, setType] = useState("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("Monthly");
  const [runDate, setRunDate] = useState(new Date());
  const [runTime, setRunTime] = useState(new Date());
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountOpen, setAccountOpen] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [pickerConfig, setPickerConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!recurringItem) {
      return;
    }

    setType(recurringItem.type || "expense");
    setTitle(recurringItem.title || "");
    setAmount(String(recurringItem.amount ?? ""));
    setPeriod(
      recurringItem.period
        ? recurringItem.period.charAt(0).toUpperCase() + recurringItem.period.slice(1)
        : "Monthly"
    );
    setRunDate(recurringItem.next_run ? new Date(recurringItem.next_run) : new Date());
    setSelectedAccountId(recurringItem.account_id || null);
    setSelectedCategoryId(recurringItem.category_id || null);
  }, [recurringItem]);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: accountRows }, { data: categoryRows }] = await Promise.all([
        supabase.from("accounts").select("id,name").eq("user_id", user.id).order("created_at"),
        supabase.from("categories").select("id,name,icon,color,type").eq("user_id", user.id).eq("type", type).order("created_at"),
      ]);
      setAccounts(accountRows || []);
      setCategories(categoryRows || []);
      setSelectedAccountId((current) => current || accountRows?.[0]?.id || null);
      setSelectedCategoryId((current) => current || categoryRows?.[0]?.id || null);
    };
    loadData();
  }, [type]);

  const visibleCategories = useMemo(() => (categories.length ? categories : type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES), [categories, type]);
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId);
  const selectedCategory = visibleCategories.find((item) => item.id === selectedCategoryId || item.name === selectedCategoryId);

  const saveRecurring = async () => {
    if (!title.trim()) return Alert.alert("Error", "Enter recurring title");
    if (!amount.trim() || Number(amount) <= 0) return Alert.alert("Error", "Enter a valid amount");
    if (!selectedAccountId) return Alert.alert("Error", "Select an account");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const fallbackCategoryId = categories.find((item) => item.id === selectedCategoryId)?.id || null;
      const payload = { user_id: user.id, title: title.trim(), amount: Number(amount), type, period: period.toLowerCase(), next_run: runDate.toISOString().split("T")[0], account_id: selectedAccountId, category_id: fallbackCategoryId };
      const { error } = isEditMode
        ? await supabase.from("recurring_transactions").update(payload).eq("id", recurringItem.id).eq("user_id", user.id)
        : await supabase.from("recurring_transactions").insert([payload]);
      if (error) throw error;
      Alert.alert("Success", isEditMode ? "Recurring transaction updated." : "Recurring transaction added.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || `Could not ${isEditMode ? "update" : "save"} recurring transaction.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title={isEditMode ? "Update recurring" : "Add recurring"} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.segmentRow}>
          {["expense", "income"].map((item) => (
            <Pressable key={item} style={[styles.segment, type === item && styles.segmentActive]} onPress={() => { setType(item); setSelectedCategoryId(null); }}>
              <Text style={[styles.segmentText, type === item && styles.segmentTextActive]}>{item === "expense" ? "Expense" : "Income"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.inlineField}>
          <View style={styles.leadingIcon}><MaterialCommunityIcons name="card-text-outline" size={24} color="#f7ddd4" /></View>
          <TextInput style={[styles.input, styles.inlineInput]} placeholder="Ex: Internet Bill" placeholderTextColor={colors.muted} value={title} onChangeText={setTitle} />
        </View>
        <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={colors.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
        <Text style={styles.sectionTitle}>Period</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodRow}>
          {PERIODS.map((item) => <Pressable key={item} style={[styles.periodChip, period === item && styles.periodChipActive]} onPress={() => setPeriod(item)}><Text style={[styles.periodChipText, period === item && styles.periodChipTextActive]}>{item}</Text></Pressable>)}
        </ScrollView>
        <Text style={styles.sectionTitle}>Date & time</Text>
        <View style={styles.dateTimeRow}>
          <Pressable style={styles.dateTimeCard} onPress={() => setPickerConfig({ field: "date", mode: "date", value: runDate })}><Feather name="calendar" size={26} color={colors.text} /><Text style={styles.dateTimeText}>{formatDate(runDate)}</Text></Pressable>
          <Pressable style={styles.dateTimeCard} onPress={() => setPickerConfig({ field: "time", mode: "time", value: runTime })}><Feather name="clock" size={26} color={colors.text} /><Text style={styles.dateTimeText}>{formatTime(runTime)}</Text></Pressable>
        </View>
        <Pressable style={styles.dropdownHeader} onPress={() => setAccountOpen((value) => !value)}>
          <View><Text style={styles.sectionTitle}>Account</Text><Text style={styles.dropdownValue}>{selectedAccount?.name || "Select account"}</Text></View>
          <Feather name={accountOpen ? "chevron-up" : "chevron-down"} size={24} color={colors.text} />
        </Pressable>
        {accountOpen ? <View style={styles.chipWrap}>{accounts.map((account) => <Pressable key={account.id} style={[styles.optionChip, selectedAccountId === account.id && styles.optionChipActive]} onPress={() => setSelectedAccountId(account.id)}><Text style={[styles.optionChipText, selectedAccountId === account.id && styles.optionChipTextActive]}>{account.name}</Text></Pressable>)}</View> : null}
        <Pressable style={styles.dropdownHeader} onPress={() => setCategoryOpen((value) => !value)}>
          <View><Text style={styles.sectionTitle}>Category</Text><Text style={styles.dropdownValue}>{selectedCategory?.name || "Select category"}</Text></View>
          <Feather name={categoryOpen ? "chevron-up" : "chevron-down"} size={24} color={type === "expense" ? "#f0b19a" : colors.text} />
        </Pressable>
        {categoryOpen ? <View style={styles.chipWrap}>{visibleCategories.map((category) => { const key = category.id || category.name; return <Pressable key={key} style={[styles.categoryChip, selectedCategoryId === key && styles.categoryChipActive]} onPress={() => setSelectedCategoryId(key)}><MaterialCommunityIcons name={category.icon || "tag"} size={18} color={category.color || "#ffb49a"} /><Text style={styles.categoryChipText}>{category.name}</Text></Pressable>; })}</View> : null}
      </ScrollView>
      <Pressable style={styles.saveButton} onPress={saveRecurring} disabled={saving}>
        <Feather name="save" size={24} color="#2f1814" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : isEditMode ? "Update" : "Add"}</Text>
      </Pressable>
      {pickerConfig ? <DateTimePicker value={pickerConfig.value} mode={pickerConfig.mode} display="default" onChange={(_, pickedValue) => { if (!pickedValue) return setPickerConfig(null); if (pickerConfig.field === "date") setRunDate(pickedValue); else setRunTime(pickedValue); setPickerConfig(null); }} /> : null}
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
  inlineField: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  leadingIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#8f675c", alignItems: "center", justifyContent: "center", marginRight: 18 },
  input: { height: 76, borderRadius: 22, borderWidth: 1, borderColor: "#3d2620", backgroundColor: "#24130f", paddingHorizontal: 20, color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 18 },
  inlineInput: { flex: 1, marginBottom: 0 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  periodRow: { paddingBottom: 18, gap: 10 },
  periodChip: { height: 48, paddingHorizontal: 20, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#6b681c" },
  periodChipActive: { backgroundColor: "#ffb49a" },
  periodChipText: { color: "#f8e8d7", fontSize: 16, fontWeight: "700" },
  periodChipTextActive: { color: "#2f1814" },
  dateTimeRow: { flexDirection: "row", gap: 14, marginBottom: 26 },
  dateTimeCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dateTimeText: { color: colors.text, fontSize: 17, fontWeight: "700" },
  dropdownHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  dropdownValue: { color: colors.muted, fontSize: 16, fontWeight: "600", marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  optionChip: { backgroundColor: "#3a2a27", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  optionChipActive: { backgroundColor: "#ffb49a" },
  optionChipText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  optionChipTextActive: { color: "#2f1814" },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#3a2a27", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  categoryChipActive: { borderWidth: 1, borderColor: "#ffb49a" },
  categoryChipText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  saveButton: { position: "absolute", left: 24, right: 24, bottom: 22, height: 70, borderRadius: 35, backgroundColor: "#ffb49a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  saveButtonText: { color: "#2f1814", fontSize: 20, fontWeight: "800" },
});
