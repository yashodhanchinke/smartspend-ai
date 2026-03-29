// screens/AddTransactionScreen.js

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { saveTransaction, updateTransaction } from "../util/saveTransaction";

export default function AddTransactionScreen({ navigation, route }) {
  const transaction = route?.params?.transaction || null;
  const isEditMode = route?.name === "UpdateTransaction" || Boolean(transaction?.id);
  const screenTitle = isEditMode ? "Update Transaction" : "Add Transaction";
  const saveLabel = isEditMode ? "Update" : "Add";

  const [type, setType] = useState("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const description = "";

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [transferAccount, setTransferAccount] = useState(null);

  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!transaction) {
      if (route?.params?.date) {
        const [year, month, day] = String(route.params.date).split("-").map(Number);
        setDate(new Date(year || 2000, (month || 1) - 1, day || 1));
      }
      return;
    }

    setType(transaction.type || "expense");
    setTitle(transaction.title || "");
    setAmount(String(transaction.amount ?? ""));

    const baseDate = transaction.date
      ? new Date(`${transaction.date}T${transaction.time || "00:00:00"}`)
      : new Date();
    setDate(baseDate);
  }, [route?.params?.date, transaction]);

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase.from("accounts").select("*");
    const nextAccounts = data || [];
    setAccounts(nextAccounts);

    if (transaction) {
      setSelectedAccount(
        nextAccounts.find((account) => account.id === transaction.account_id) || null
      );
      setTransferAccount(
        nextAccounts.find((account) => account.id === transaction.to_account_id) || null
      );
      return;
    }

    const preselectedAccountId = route?.params?.accountId;

    if (preselectedAccountId) {
      const matchedAccount = nextAccounts.find((account) => account.id === preselectedAccountId);

      if (matchedAccount) {
        setSelectedAccount(matchedAccount);
      }
    }
  }, [route?.params?.accountId, transaction]);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("type", type);

    const nextCategories = data || [];
    setCategories(nextCategories);

    if (transaction && type !== "transfer") {
      setSelectedCategory(
        nextCategories.find((category) => category.id === transaction.category_id) || null
      );
    }
  }, [transaction, type]);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (type !== "transfer") fetchCategories();
  }, [fetchCategories, type]);

  useEffect(() => {
    if (type === "transfer") {
      setSelectedCategory(null);
    } else if (transaction?.type !== type) {
      setSelectedCategory(null);
    }

    if (type !== "transfer" && transaction?.type === "transfer") {
      setTransferAccount(null);
    }
  }, [transaction?.type, type]);

  /* ================= DATE HANDLERS ================= */

  const onDateChange = (event, selectedDate) => {
    setShowDate(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTime(false);
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setDate(newDate);
    }
  };

  /* ================= SAVE ================= */

  const handleSave = async () => {

    if (!amount || !selectedAccount) {
      Alert.alert("Error", "Select account & enter amount");
      return;
    }

    if (type !== "transfer" && !selectedCategory) {
      Alert.alert("Error", "Select category");
      return;
    }

    if (type === "transfer" && !transferAccount) {
      Alert.alert("Error", "Select transfer account");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      const payload = {
        userId: user.id,
        type,
        title,
        amount,
        description,
        date: date.toISOString().split("T")[0],
        time: date.toTimeString().split(" ")[0],
        accountId: selectedAccount.id,
        categoryId: type === "transfer" ? null : selectedCategory.id,
        toAccountId: type === "transfer" ? transferAccount.id : null,
      };

      if (isEditMode) {
        await updateTransaction({
          transactionId: transaction.id,
          ...payload,
        });
      } else {
        await saveTransaction(payload);
      }
    } catch (error) {
      Alert.alert("Error", error.message);
      setLoading(false);
      return;
    }

    setLoading(false);

    Alert.alert("Success", isEditMode ? "Transaction updated" : "Transaction added");
    navigation.goBack();
  };

  /* ================= UI ================= */

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title={screenTitle} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {isEditMode ? "Change this entry" : "Create a new entry"}
          </Text>
          <Text style={styles.heroTitle}>
            {isEditMode ? "Update money details" : "Track money clearly"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isEditMode
              ? "Update the type, amount, account, and category for this transaction."
              : "Choose the type, fill the details, then assign the right account and category."}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Transaction Type</Text>
          <View style={styles.typeRow}>
            {["expense", "income", "transfer"].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, type === t && styles.typeActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Details</Text>
          <TextInput
            style={styles.input}
            placeholder="Title"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={styles.input}
            placeholder="Amount"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity style={styles.dateTimeCard} onPress={() => setShowDate(true)}>
              <MaterialCommunityIcons name="calendar-month-outline" size={22} color={colors.gold} />
              <View>
                <Text style={styles.dateTimeLabel}>Date</Text>
                <Text style={styles.dateTimeValue}>{date.toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dateTimeCard} onPress={() => setShowTime(true)}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={22} color={colors.gold} />
              <View>
                <Text style={styles.dateTimeLabel}>Time</Text>
                <Text style={styles.dateTimeValue}>{date.toLocaleTimeString()}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {showDate && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={onDateChange}
          />
        )}

        {showTime && (
          <DateTimePicker
            value={date}
            mode="time"
            display="default"
            onChange={onTimeChange}
          />
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Select Account</Text>
          <View style={styles.wrap}>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.selectionCard,
                  selectedAccount?.id === acc.id && styles.activeSelectionCard
                ]}
                onPress={() => setSelectedAccount(acc)}
              >
                <View style={styles.accountTopRow}>
                  <View style={styles.accountIconWrap}>
                    <MaterialCommunityIcons name="wallet-outline" size={18} color={colors.gold} />
                  </View>
                  {selectedAccount?.id === acc.id ? (
                    <MaterialCommunityIcons name="check-circle" size={20} color={colors.gold} />
                  ) : null}
                </View>
                <Text style={styles.selectionTitle}>{acc.name}</Text>
                <Text style={styles.selectionSubtitle}>₹{acc.balance}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {type === "transfer" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Transfer To</Text>
            <View style={styles.wrap}>
              {accounts
                .filter((a) => a.id !== selectedAccount?.id)
                .map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.selectionCard,
                      transferAccount?.id === acc.id && styles.activeSelectionCard
                    ]}
                    onPress={() => setTransferAccount(acc)}
                  >
                    <View style={styles.accountTopRow}>
                      <View style={styles.accountIconWrap}>
                        <MaterialCommunityIcons name="bank-transfer" size={18} color={colors.gold} />
                      </View>
                      {transferAccount?.id === acc.id ? (
                        <MaterialCommunityIcons name="check-circle" size={20} color={colors.gold} />
                      ) : null}
                    </View>
                    <Text style={styles.selectionTitle}>{acc.name}</Text>
                    <Text style={styles.selectionSubtitle}>Destination account</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        )}

        {type !== "transfer" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Select Category</Text>
            <View style={styles.wrap}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    selectedCategory?.id === cat.id && styles.activeCategoryChip
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <View style={styles.categoryContent}>
                    <MaterialCommunityIcons
                      name={cat.icon || "tag"}
                      size={18}
                      color={cat.color || colors.gold}
                    />
                    <Text style={styles.categoryText}>{cat.name}</Text>
                  </View>
                  {selectedCategory?.id === cat.id ? (
                    <MaterialCommunityIcons name="check-circle" size={18} color={colors.gold} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>
            {loading ? "Saving..." : saveLabel}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: "#33211d",
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
  },
  heroEyebrow: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: "#33211d",
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: "#4a342e",
    alignItems: "center",
  },
  typeActive: {
    backgroundColor: colors.gold,
  },
  typeBtnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  typeBtnTextActive: {
    color: "#231512",
  },
  input: {
    backgroundColor: "#412d28",
    borderRadius: 16,
    marginBottom: 12,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateTimeCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#412d28",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  dateTimeLabel: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  dateTimeValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  selectionCard: {
    width: "48%",
    backgroundColor: "#412d28",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  activeSelectionCard: {
    borderColor: colors.gold,
    backgroundColor: "#4a312a",
  },
  accountTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  accountIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#593f37",
  },
  selectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  selectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  categoryChip: {
    minWidth: "47%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#412d28",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  activeCategoryChip: {
    borderColor: colors.gold,
    backgroundColor: "#4a312a",
  },
  categoryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  categoryText: {
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    padding: 18,
    borderRadius: 18,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  saveText: {
    textAlign: "center",
    fontWeight: "800",
    color: "#231512",
    fontSize: 16,
  },
});
