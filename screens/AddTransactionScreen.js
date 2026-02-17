// screens/AddTransactionScreen.js

import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
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
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function AddTransactionScreen({ navigation }) {
  const [type, setType] = useState("expense");

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [transferAccount, setTransferAccount] = useState(null);

  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [loading, setLoading] = useState(false);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (type !== "transfer") fetchCategories();
  }, [type]);

  const fetchAccounts = async () => {
    const { data } = await supabase.from("accounts").select("*");
    setAccounts(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("type", type);

    setCategories(data || []);
  };

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

    const parsedAmount = parseFloat(amount);

    const { error } = await supabase.from("transactions").insert([
      {
        user_id: user.id,
        account_id: selectedAccount.id,
        category_id: type === "transfer" ? null : selectedCategory.id,
        type,
        title,
        amount: parsedAmount,
        description,
        date: date.toISOString().split("T")[0],
        time: date.toTimeString().split(" ")[0],
      },
    ]);

    if (error) {
      Alert.alert("Error", error.message);
      setLoading(false);
      return;
    }

    /* ===== BALANCE UPDATE ===== */

    if (type === "expense") {
      await supabase
        .from("accounts")
        .update({ balance: selectedAccount.balance - parsedAmount })
        .eq("id", selectedAccount.id);
    }

    if (type === "income") {
      await supabase
        .from("accounts")
        .update({ balance: selectedAccount.balance + parsedAmount })
        .eq("id", selectedAccount.id);
    }

    if (type === "transfer") {
      await supabase
        .from("accounts")
        .update({ balance: selectedAccount.balance - parsedAmount })
        .eq("id", selectedAccount.id);

      await supabase
        .from("accounts")
        .update({ balance: transferAccount.balance + parsedAmount })
        .eq("id", transferAccount.id);
    }

    setLoading(false);
    Alert.alert("Success 🎉", "Transaction added");
    navigation.goBack();
  };

  /* ================= UI ================= */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Add Transaction</Text>

        {/* TYPE SWITCH */}
        <View style={styles.typeRow}>
          {["expense", "income", "transfer"].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && styles.typeActive]}
              onPress={() => setType(t)}
            >
              <Text style={{ color: type === t ? "#000" : "#fff", fontWeight: "600" }}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TITLE */}
        <TextInput
          style={styles.input}
          placeholder="Title"
          placeholderTextColor="#aaa"
          value={title}
          onChangeText={setTitle}
        />

        {/* AMOUNT */}
        <TextInput
          style={styles.input}
          placeholder="Amount"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        {/* DATE */}
        <TouchableOpacity style={styles.input} onPress={() => setShowDate(true)}>
          <Text style={{ color: "#fff" }}>{date.toLocaleDateString()}</Text>
        </TouchableOpacity>

        {/* TIME */}
        <TouchableOpacity style={styles.input} onPress={() => setShowTime(true)}>
          <Text style={{ color: "#fff" }}>{date.toLocaleTimeString()}</Text>
        </TouchableOpacity>

        {showDate && (
          <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} />
        )}

        {showTime && (
          <DateTimePicker value={date} mode="time" display="default" onChange={onTimeChange} />
        )}

        {/* ACCOUNT */}
        <Text style={styles.section}>Select Account</Text>
        <View style={styles.wrap}>
          {accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              style={[styles.box, selectedAccount?.id === acc.id && styles.activeBox]}
              onPress={() => setSelectedAccount(acc)}
            >
              <Text style={{ color: "#fff" }}>{acc.name}</Text>
              <Text style={{ color: "#ccc" }}>₹{acc.balance}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* TRANSFER */}
        {type === "transfer" && (
          <>
            <Text style={styles.section}>Transfer To</Text>
            <View style={styles.wrap}>
              {accounts
                .filter((a) => a.id !== selectedAccount?.id)
                .map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.box, transferAccount?.id === acc.id && styles.activeBox]}
                    onPress={() => setTransferAccount(acc)}
                  >
                    <Text style={{ color: "#fff" }}>{acc.name}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </>
        )}

        {/* CATEGORY */}
        {type !== "transfer" && (
          <>
            <Text style={styles.section}>Select Category</Text>
            <View style={styles.wrap}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.box, selectedCategory?.id === cat.id && styles.activeBox]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={{ color: "#fff" }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* SAVE */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>{loading ? "Saving..." : "Add"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.gold, fontSize: 24, fontWeight: "700", marginBottom: 20 },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#333", alignItems: "center" },
  typeActive: { backgroundColor: colors.gold },
  input: { backgroundColor: colors.card, padding: 14, borderRadius: 12, marginBottom: 14, color: "#fff" },
  section: { color: "#fff", marginTop: 14, marginBottom: 8, fontWeight: "600" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  box: { backgroundColor: colors.card, padding: 12, borderRadius: 12, marginBottom: 10 },
  activeBox: { borderWidth: 2, borderColor: colors.gold },
  saveBtn: { backgroundColor: colors.gold, padding: 16, borderRadius: 14, marginTop: 30 },
  saveText: { textAlign: "center", fontWeight: "700", color: "#000" },
});
