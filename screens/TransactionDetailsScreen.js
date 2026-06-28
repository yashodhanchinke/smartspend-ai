import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";
import { supabase } from "../lib/supabase";
import { deleteTransaction, saveTransaction } from "../util/saveTransaction";

const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

function formatCurrency(value) {
  const amount = Number(value || 0);
  const absolute = Math.abs(amount).toFixed(2);
  if (amount < 0) return `-₹${absolute}`;
  if (amount > 0) return `₹${absolute}`;
  return "₹0.00";
}

function formatDateTime(dateValue, timeValue) {
  const date = parseStoredDate(dateValue);
  const time = timeValue || "00:00:00";
  const timeDate = new Date(`2000-01-01T${time}`);

  return `${date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })} at ${timeDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function getAmountPrefix(transaction) {
  if (transaction?.type === "expense") return "-";
  if (transaction?.type === "income") return "+";
  return "";
}

function getAmountColor(transaction) {
  if (transaction?.type === "expense") return "#ff948b";
  if (transaction?.type === "income") return "#8af09a";
  return "#e8d6cd";
}

function formatLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function TransactionDetailsScreen({ navigation }) {
  const route = useRoute();
  const routeTransaction = route?.params?.transaction || null;
  const transactionId = routeTransaction?.id || route?.params?.transactionId || null;
  const [transaction, setTransaction] = useState(routeTransaction);
  const [account, setAccount] = useState(routeTransaction?.account || routeTransaction?.accounts || null);
  const [toAccount, setToAccount] = useState(routeTransaction?.toAccount || routeTransaction?.to_account || null);
  const [goal, setGoal] = useState(null);
  const [loan, setLoan] = useState(null);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(!routeTransaction);

  const loadTransaction = useCallback(async () => {
    if (!transactionId) {
      setTransaction(routeTransaction);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTransaction(null);
        setAccount(null);
        setToAccount(null);
        setGoal(null);
        setLoan(null);
        setLabels([]);
        return;
      }

      const txResult = await supabase
        .from("transactions")
        .select(`
          id,
          user_id,
          title,
          amount,
          type,
          date,
          time,
          description,
          account_id,
          to_account_id,
          category_id,
          goal_id,
          loan_id,
          accounts(name),
          categories(name,color,icon)
        `)
        .eq("id", transactionId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (txResult.error) throw txResult.error;

      const loadedTransaction = txResult.data || routeTransaction;
      const accountId = loadedTransaction?.account_id || loadedTransaction?.accountId || null;
      const toAccountId = loadedTransaction?.to_account_id || loadedTransaction?.toAccountId || null;
      const goalId = loadedTransaction?.goal_id || null;
      const loanId = loadedTransaction?.loan_id || null;

      const [accountResult, toAccountResult, goalResult, loanResult, labelsResult] = await Promise.all([
        accountId
          ? supabase.from("accounts").select("id,name").eq("id", accountId).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        toAccountId
          ? supabase.from("accounts").select("id,name").eq("id", toAccountId).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        goalId
          ? supabase
              .from("goals")
              .select("id,title,target_amount,current_amount,start_date,end_date,color")
              .eq("id", goalId)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        loanId
          ? supabase
              .from("loans")
              .select("id,name,amount,type,start_date,end_date,status")
              .eq("id", loanId)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("transaction_labels")
          .select(
            `
            label_id,
            labels (
              id,
              name,
              color
            )
          `
          )
          .eq("transaction_id", transactionId)
          .eq("user_id", user.id),
      ]);

      if (accountResult.error) throw accountResult.error;
      if (toAccountResult.error) throw toAccountResult.error;
      if (goalResult.error) throw goalResult.error;
      if (loanResult.error) throw loanResult.error;
      if (labelsResult.error) throw labelsResult.error;

      setTransaction(loadedTransaction);
      setAccount(accountResult.data || loadedTransaction?.account || loadedTransaction?.accounts || null);
      setToAccount(toAccountResult.data || loadedTransaction?.toAccount || loadedTransaction?.to_account || null);
      setGoal(goalResult.data || null);
      setLoan(loanResult.data || null);
      setLabels(
        (labelsResult.data || [])
          .map((row) => row.labels)
          .filter(Boolean)
      );
    } catch (error) {
      console.warn("Could not load transaction details:", error.message);
      setTransaction(routeTransaction);
      setAccount(routeTransaction?.account || routeTransaction?.accounts || null);
      setToAccount(routeTransaction?.toAccount || routeTransaction?.to_account || null);
      setGoal(null);
      setLoan(null);
      setLabels([]);
    } finally {
      setLoading(false);
    }
  }, [routeTransaction, transactionId]);

  useFocusEffect(
    useCallback(() => {
      loadTransaction();
    }, [loadTransaction])
  );

  const amount = Number(transaction?.amount || 0);
  const amountPrefix = getAmountPrefix(transaction);
  const amountColor = getAmountColor(transaction);
  const accountLabel = account?.name || transaction?.account?.name || transaction?.accounts?.name || "Account";
  const toAccountLabel = toAccount?.name || transaction?.toAccount?.name || transaction?.to_account?.name || null;
  const categoryLabel = transaction?.categories?.name || "Uncategorized";
  const categoryColor = transaction?.categories?.color || "#ffb49a";
  const categoryIcon = transaction?.categories?.icon || "tag";
  const createdAtLabel = transaction?.created_at
    ? new Date(transaction.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleDelete = useCallback(() => {
    if (!transaction?.id) return;

    Alert.alert(
      "Delete transaction?",
      "This transaction will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
              return;
            }

            try {
              await deleteTransaction({
                transactionId: transaction.id,
                userId: user.id,
              });
            } catch (error) {
              Alert.alert("Error", error.message || "Could not delete transaction.");
              return;
            }

            navigation.goBack();
          },
        },
      ]
    );
  }, [navigation, transaction?.id]);

  const handleCopy = useCallback(async () => {
    if (!transaction?.id) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      await saveTransaction({
        userId: user.id,
        type: transaction.type,
        title: transaction.title || transaction.categories?.name || "Transaction",
        amount: transaction.amount,
        description: transaction.description || "",
        date: formatLocalDate(new Date()),
        time: new Date().toTimeString().split(" ")[0],
        accountId: transaction.account_id,
        categoryId: transaction.category_id || null,
        goalId: transaction.goal_id || null,
        loanId: transaction.loan_id || null,
        toAccountId: transaction.to_account_id || null,
        labelIds: labels.map((label) => label.id),
      });

      Alert.alert("Copied", "Transaction duplicated successfully.");
    } catch (error) {
      Alert.alert("Error", error.message || "Could not copy transaction.");
    }
  }, [labels, transaction]);

  if (loading && !transaction) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loaderWrap}>
          <Text style={styles.loaderText}>Loading transaction...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!transaction) {
    return null;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerIconButton}>
          <Feather name="arrow-left" size={26} color={colors.text} />
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={2} ellipsizeMode="tail">
            {transaction.title || categoryLabel || "Transaction"}
          </Text>
        </View>

        <View style={styles.headerIconButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleBlock}>
              <View style={[styles.heroIconWrap, { backgroundColor: `${categoryColor}22` }]}>
                <MaterialCommunityIcons name={categoryIcon} size={26} color={categoryColor} />
              </View>
              <View style={styles.heroTextWrap}>
                <Text
                  style={styles.heroTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {transaction.title || categoryLabel}
                </Text>
                <Text style={styles.heroSubtitle}>
                  {formatDateTime(transaction.date, transaction.time)}
                </Text>
              </View>
            </View>
            <Text style={[styles.heroAmount, { color: amountColor }]}>
              {amountPrefix}
              {formatCurrency(amount)}
            </Text>
          </View>

          <View style={styles.tagsRow}>
            {goal ? (
              <View style={styles.tagPill}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {goal.title || "Goal"}
                </Text>
              </View>
            ) : null}
            {loan ? (
              <View style={styles.tagPill}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {loan.name || "Loan"}
                </Text>
              </View>
            ) : null}
            {labels.length ? (
              <View style={styles.tagPill}>
                <Text style={styles.tagText} numberOfLines={1}>
                  {labels.map((item) => item.name).join(", ")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Transaction Details</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <MaterialCommunityIcons name="bank-outline" size={22} color="#f0d7d1" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Account</Text>
              <Text style={styles.detailValue}>{accountLabel}</Text>
            </View>
          </View>

          {toAccountLabel ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <MaterialCommunityIcons name="bank-transfer" size={22} color="#f0d7d1" />
              </View>
              <View style={styles.detailCopy}>
                <Text style={styles.detailLabel}>Transfer To</Text>
                <Text style={styles.detailValue}>{toAccountLabel}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <MaterialCommunityIcons name="tag-outline" size={22} color="#f0d7d1" />
            </View>
            <View style={styles.detailCopy}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{categoryLabel}</Text>
            </View>
          </View>

          {goal ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <MaterialCommunityIcons name="flag-checkered" size={22} color="#f0d7d1" />
              </View>
              <View style={styles.detailCopy}>
                <Text style={styles.detailLabel}>Goal</Text>
                <Text style={styles.detailValue}>{goal.title || "Goal"}</Text>
              </View>
            </View>
          ) : null}

          {loan ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <MaterialCommunityIcons name="cash-multiple" size={22} color="#f0d7d1" />
              </View>
              <View style={styles.detailCopy}>
                <Text style={styles.detailLabel}>Loan</Text>
                <Text style={styles.detailValue}>{loan.name || "Loan"}</Text>
              </View>
            </View>
          ) : null}

          {labels.length ? (
            <View style={styles.labelsWrap}>
              <Text style={styles.detailLabel}>Labels</Text>
              <View style={styles.labelsRow}>
                {labels.map((item) => (
                  <View key={item.id} style={[styles.labelChip, { borderColor: item.color || "#ffb49a" }]}>
                    <Text style={styles.labelChipText}>{item.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {createdAtLabel ? (
            <Text style={styles.createdLabel}>Created on {createdAtLabel}</Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.actionsBar}>
        <Pressable style={styles.actionBtnDanger} onPress={handleDelete}>
          <Feather name="trash-2" size={18} color="#ff6f63" />
          <Text style={styles.actionTextDanger}>Delete</Text>
        </Pressable>

        <Pressable
          style={styles.actionBtn}
          onPress={() => navigation.navigate("UpdateTransaction", { transaction })}
        >
          <Feather name="edit-2" size={18} color="#f1c1b4" />
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={handleCopy}>
          <Feather name="copy" size={18} color="#f1c1b4" />
          <Text style={styles.actionText}>Copy</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 28,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 132,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitleBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexBasis: 0,
    paddingRight: 8,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: 8,
    minWidth: 0,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 24,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
    lineHeight: 16,
  },
  heroAmount: {
    fontSize: 20,
    fontWeight: "800",
    minWidth: 78,
    paddingLeft: 4,
    textAlign: "right",
    flexShrink: 0,
    lineHeight: 24,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#3a241f",
    borderWidth: 1,
    borderColor: "#55352f",
  },
  tagText: {
    color: "#f1c1b4",
    fontSize: 12,
    fontWeight: "700",
  },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4f3831",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#3a241f",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  detailCopy: {
    flex: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },
  detailValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
  },
  createdLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  labelsWrap: {
    marginTop: 2,
  },
  labelsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  labelChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#3a241f",
  },
  labelChipText: {
    color: "#f1c1b4",
    fontSize: 11,
    fontWeight: "700",
  },
  actionsBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#3a241f",
    borderWidth: 1,
    borderColor: "#55352f",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnDanger: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#3a241f",
    borderWidth: 1,
    borderColor: "#5f2c2a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionText: {
    color: "#f1c1b4",
    fontSize: 15,
    fontWeight: "800",
  },
  actionTextDanger: {
    color: "#ff6f63",
    fontSize: 15,
    fontWeight: "800",
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
