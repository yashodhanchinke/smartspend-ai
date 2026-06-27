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
  const returnTab = route?.params?.returnTab || null;

  const [type, setType] = useState("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const description = "";

  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loans, setLoans] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedLoan, setSelectedLoan] = useState(null);
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
    setSelectedLoan(null);

    const baseDate = transaction.date
      ? new Date(`${transaction.date}T${transaction.time || "00:00:00"}`)
      : new Date();
    setDate(baseDate);
  }, [route?.params?.date, transaction]);

  const fetchAccounts = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAccounts([]);
      return;
    }

    const { data } = await supabase.from("accounts").select("*").eq("user_id", user.id);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setCategories([]);
      return;
    }

    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", type);

    const nextCategories = data || [];
    setCategories(nextCategories);

    if (transaction && type !== "transfer") {
      setSelectedCategory(
        nextCategories.find((category) => category.id === transaction.category_id) || null
      );
    }
  }, [transaction, type]);

  const fetchLabels = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLabels([]);
      return;
    }

    const { data } = await supabase
      .from("labels")
      .select("id,name,color")
      .eq("user_id", user.id)
      .order("name");

    setLabels(data || []);
  }, []);

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
      .order("end_date", { ascending: true });

    setGoals(data || []);
  }, []);

  const fetchLoans = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoans([]);
      return;
    }

    const { data } = await supabase
      .from("loans")
      .select("id,name,amount,type,start_date,end_date,status")
      .eq("user_id", user.id)
      .order("end_date", { ascending: false });

    setLoans(data || []);
  }, []);

  const fetchTransactionLabels = useCallback(async () => {
    if (!transaction?.id) {
      setSelectedLabels([]);
      return;
    }

    const { data, error } = await supabase
      .from("transaction_labels")
      .select(`
        label_id,
        labels (
          id,
          name,
          color
        )
      `)
      .eq("transaction_id", transaction.id);

    if (error) {
      console.warn("Could not load transaction labels:", error.message);
      setSelectedLabels([]);
      return;
    }

    setSelectedLabels(
      (data || [])
        .map((row) => row.labels)
        .filter(Boolean)
    );
  }, [transaction?.id]);

  const fetchTransactionGoal = useCallback(async () => {
    if (!transaction?.goal_id) {
      setSelectedGoal(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSelectedGoal(null);
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("id,title,target_amount,current_amount,start_date,end_date,color")
      .eq("id", transaction.goal_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("Could not load transaction goal:", error.message);
      setSelectedGoal(null);
      return;
    }

    setSelectedGoal(data || null);
  }, [transaction?.goal_id]);

  const fetchTransactionLoan = useCallback(async () => {
    if (!transaction?.loan_id) {
      setSelectedLoan(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSelectedLoan(null);
      return;
    }

    const { data, error } = await supabase
      .from("loans")
      .select("id,name,amount,type,start_date,end_date,status")
      .eq("id", transaction.loan_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("Could not load transaction loan:", error.message);
      setSelectedLoan(null);
      return;
    }

    setSelectedLoan(data || null);
  }, [transaction?.loan_id]);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (type !== "transfer") fetchCategories();
  }, [fetchCategories, type]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    fetchTransactionLabels();
  }, [fetchTransactionLabels]);

  useEffect(() => {
    fetchTransactionGoal();
  }, [fetchTransactionGoal]);

  useEffect(() => {
    fetchTransactionLoan();
  }, [fetchTransactionLoan]);

  useEffect(() => {
    if (type === "transfer") {
      setSelectedLoan(null);
      return;
    }

    const preselectedLoanId = route?.params?.loanId || transaction?.loan_id || null;

    if (!preselectedLoanId || loans.length === 0) {
      return;
    }

    const matchedLoan = loans.find((item) => item.id === preselectedLoanId) || null;
    setSelectedLoan(matchedLoan);

    if (!transaction && matchedLoan && route?.params?.loanTransactionType) {
      setType(route.params.loanTransactionType);
    }
  }, [loans, route?.params?.loanId, route?.params?.loanTransactionType, transaction, type]);

  useEffect(() => {
    if (type === "transfer") {
      setSelectedCategory(null);
      setSelectedLabels([]);
      setSelectedGoal(null);
      setSelectedLoan(null);
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

  const toggleLabel = (label) => {
    setSelectedLabels((current) => {
      const exists = current.some((item) => item.id === label.id);

      if (exists) {
        return current.filter((item) => item.id !== label.id);
      }

      return [...current, label];
    });
  };

  const selectGoal = (goal) => {
    setSelectedGoal((current) => (current?.id === goal.id ? null : goal));
  };

  /* ================= SAVE ================= */

  const handleSave = async () => {

    if (!amount || !selectedAccount) {
      Alert.alert("Error", "Select account & enter amount");
      return;
    }

    if (type !== "transfer" && !selectedCategory && !selectedLoan) {
      Alert.alert("Error", "Select category or loan");
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
        categoryId: type === "transfer" ? null : selectedCategory?.id || null,
        toAccountId: type === "transfer" ? transferAccount.id : null,
        labelIds: type === "transfer" ? [] : selectedLabels.map((label) => label.id),
        goalId: type === "transfer" ? null : selectedGoal?.id || null,
        loanId: type === "transfer" ? null : selectedLoan?.id || null,
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
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    // Fallback: if this screen was opened without a back stack (e.g. deep link / refresh),
    // send the user to a safe place.
    if (returnTab) {
      navigation.navigate("Main", { screen: returnTab });
      return;
    }

    navigation.navigate("Main", { screen: "Home" });
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
              {categories.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Text style={styles.emptyBlockText}>No data</Text>
                </View>
              ) : categories.map((cat) => (
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

        {type !== "transfer" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Select Loan</Text>
            {loans.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyBlockText}>No data</Text>
              </View>
            ) : (
              <View style={styles.wrap}>
                {loans.map((loan) => {
                  const isSelected = selectedLoan?.id === loan.id;
                  return (
                    <TouchableOpacity
                      key={loan.id}
                      style={[
                        styles.loanChip,
                        isSelected && styles.activeLoanChip,
                      ]}
                      onPress={() => setSelectedLoan(isSelected ? null : loan)}
                    >
                      <View style={styles.loanChipHeader}>
                        <MaterialCommunityIcons
                          name={loan.type === "borrowing" ? "cash-minus" : "cash-plus"}
                          size={18}
                          color={loan.type === "borrowing" ? "#ffb49a" : colors.gold}
                        />
                        {isSelected ? (
                          <MaterialCommunityIcons name="check-circle" size={18} color={colors.gold} />
                        ) : null}
                      </View>
                      <Text style={styles.loanText} numberOfLines={1}>{loan.name || "Loan"}</Text>
                      <Text style={styles.loanMeta}>{loan.type === "borrowing" ? "Borrowing" : "Lending"}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {type !== "transfer" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Select Goal</Text>
            {goals.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyBlockText}>No data</Text>
              </View>
            ) : (
              <View style={styles.wrap}>
                {goals.map((goal) => {
                  const target = Number(goal.target_amount || 0);
                  const current = Number(goal.current_amount || 0);
                  const progress = target > 0 ? Math.min(current / target, 1) : 0;

                  return (
                    <TouchableOpacity
                      key={goal.id}
                      style={[
                        styles.goalChip,
                        selectedGoal?.id === goal.id && styles.activeGoalChip,
                      ]}
                      onPress={() => selectGoal(goal)}
                    >
                      <View style={styles.goalChipHeader}>
                        <View style={[styles.goalDot, { backgroundColor: goal.color || colors.gold }]} />
                        <Text style={styles.goalText} numberOfLines={1}>
                          {goal.title || "Goal"}
                        </Text>
                      </View>
                      <Text style={styles.goalMeta}>
                        {Math.round(progress * 100)}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {type !== "transfer" && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Labels</Text>
            {labels.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyBlockText}>No data</Text>
              </View>
            ) : (
              <View style={styles.wrap}>
                {labels.map((label) => (
                  <TouchableOpacity
                    key={label.id}
                    style={[
                      styles.labelChip,
                      selectedLabels.some((item) => item.id === label.id) && styles.activeLabelChip,
                      { borderColor: label.color || colors.gold },
                    ]}
                    onPress={() => toggleLabel(label)}
                  >
                    <View style={[styles.labelDot, { backgroundColor: label.color || colors.gold }]} />
                    <Text style={styles.labelText}>{label.name}</Text>
                    {selectedLabels.some((item) => item.id === label.id) ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color={colors.gold} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  goalChip: {
    minWidth: "47%",
    backgroundColor: "#412d28",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  activeGoalChip: {
    borderColor: colors.gold,
    backgroundColor: "#4a312a",
  },
  goalChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  goalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  goalText: {
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  goalMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  loanChip: {
    minWidth: "47%",
    backgroundColor: "#412d28",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#5b433c",
  },
  activeLoanChip: {
    borderColor: colors.gold,
    backgroundColor: "#4a312a",
  },
  loanChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  loanText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  loanMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  labelChip: {
    minWidth: "47%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#412d28",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  activeLabelChip: {
    backgroundColor: "#4a312a",
  },
  labelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  labelText: {
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
  },
  emptyBlock: {
    backgroundColor: "#412d28",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#5b433c",
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyBlockText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
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
