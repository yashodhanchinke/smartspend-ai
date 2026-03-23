import { MaterialCommunityIcons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { showTransactionEntryOptions } from "../util/transactionEntry";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

const formatDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTimeLabel = (timeValue) => {
  if (!timeValue) return "--:--";

  return new Date(`2000-01-01T${timeValue}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const buildMonthCells = (visibleMonth, selectedDate) => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({ key: `empty-${year}-${month}-${index}`, empty: true });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);

    cells.push({
      key: formatDateKey(date),
      date,
      day,
      selected: formatDateKey(date) === formatDateKey(selectedDate),
    });
  }

  return cells;
};

export default function CalendarHeatmapScreen({ navigation }) {
  const today = new Date();
  const [transactions, setTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const fetchTransactions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTransactions([]);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select(`
        *,
        categories(name,icon,color),
        accounts(name)
      `)
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("time", { ascending: false });

    if (error) {
      console.warn("Could not load calendar transactions:", error.message);
      setTransactions([]);
      return;
    }

    setTransactions(data || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const selectedDateKey = formatDateKey(selectedDate);

  const selectedTransactions = useMemo(() => {
    return transactions.filter(
      (transaction) => formatDateKey(parseStoredDate(transaction.date)) === selectedDateKey
    );
  }, [selectedDateKey, transactions]);

  const incomeTotal = selectedTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

  const expenseTotal = selectedTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

  const monthCells = buildMonthCells(visibleMonth, selectedDate);
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const isCurrentMonth =
    visibleMonth.getFullYear() === currentMonth.getFullYear() &&
    visibleMonth.getMonth() === currentMonth.getMonth();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {selectedDate.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </Text>

        <TouchableOpacity
          onPress={() =>
            navigation.navigate("Weekly Summary", {
              initialTab: "Daily",
              selectedDate: selectedDateKey,
            })
          }
        >
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.monthRow}>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() =>
              setVisibleMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
              )
            }
          >
            <Feather name="chevron-left" size={22} color={colors.gold} />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {visibleMonth.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>

          <TouchableOpacity
            style={[styles.monthButton, isCurrentMonth && styles.monthButtonDisabled]}
            onPress={() => {
              if (!isCurrentMonth) {
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                );
              }
            }}
            disabled={isCurrentMonth}
          >
            <Feather
              name="chevron-right"
              size={22}
              color={isCurrentMonth ? "#7a6157" : colors.gold}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.weekLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {monthCells.map((cell) => {
            if (cell.empty) {
              return <View key={cell.key} style={styles.emptyDay} />;
            }

            return (
              <TouchableOpacity
                key={cell.key}
                style={[styles.day, cell.selected && styles.selectedDay]}
                onPress={() => setSelectedDate(cell.date)}
              >
                <Text style={[styles.dayText, cell.selected && styles.selectedDayText]}>
                  {cell.day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryLabelRow}>
              <Feather name="arrow-up" size={18} color="#79ff8a" />
              <Text style={styles.summaryLabel}>Income</Text>
            </View>
            <Text style={styles.summaryAmount}>₹{incomeTotal.toFixed(2)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryLabelRow}>
              <Feather name="arrow-down" size={18} color="#ff7f76" />
              <Text style={styles.summaryLabel}>Expense</Text>
            </View>
            <Text style={styles.summaryAmount}>₹{expenseTotal.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.transactionsHeader}>
          <MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.gold} />
          <Text style={styles.transactionsTitle}>
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}{" "}
            Transactions
          </Text>
        </View>

        {selectedTransactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions for this date.</Text>
        ) : (
          selectedTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionRow}>
              <View style={styles.transactionLeft}>
                <View
                  style={[
                    styles.transactionIcon,
                    { backgroundColor: transaction.categories?.color || "#5a4138" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={transaction.categories?.icon || "credit-card-outline"}
                    size={18}
                    color="#fff3ea"
                  />
                </View>

                <View style={styles.transactionTextWrap}>
                  <Text style={styles.transactionTitle}>
                    {transaction.title || transaction.categories?.name || "Transaction"}
                  </Text>
                  <Text style={styles.transactionMeta}>
                    {transaction.accounts?.name || "Account"} •{" "}
                    {formatDateKey(parseStoredDate(transaction.date)) === formatDateKey(today)
                      ? "Today"
                      : selectedDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                  </Text>
                </View>
              </View>

              <View style={styles.transactionAmountWrap}>
                <Text
                  style={
                    transaction.type === "expense"
                      ? styles.expenseAmount
                      : transaction.type === "income"
                      ? styles.incomeAmount
                      : styles.neutralAmount
                  }
                >
                  ₹{Number(transaction.amount || 0).toFixed(2)}
                </Text>
                <Text style={styles.transactionTime}>{formatTimeLabel(transaction.time)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => showTransactionEntryOptions(navigation, { date: selectedDateKey })}
      >
        <Feather name="plus" size={28} color="#22130f" />
      </TouchableOpacity>
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
    paddingTop: 8,
    paddingBottom: 16,
  },

  headerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    flex: 1,
    marginHorizontal: 14,
  },

  seeAllText: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "700",
  },

  container: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },

  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  monthButtonDisabled: {
    opacity: 0.45,
  },

  monthTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#d8c8c0",
    fontSize: 13,
    fontWeight: "700",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 20,
  },

  day: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    marginBottom: 10,
  },

  emptyDay: {
    width: "14.285%",
    aspectRatio: 1,
    marginBottom: 10,
  },

  selectedDay: {
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: "#473432",
  },

  dayText: {
    color: "#f1dfd7",
    fontSize: 15,
    fontWeight: "600",
  },

  selectedDayText: {
    color: "#fff7f2",
    fontWeight: "800",
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 24,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#2f211d",
    borderWidth: 1,
    borderColor: "rgba(255, 225, 208, 0.08)",
    borderRadius: 20,
    padding: 16,
  },

  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  summaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },

  summaryAmount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },

  transactionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },

  transactionsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 10,
  },

  emptyText: {
    color: colors.muted,
  },

  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },

  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  transactionTextWrap: {
    flex: 1,
  },

  transactionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },

  transactionMeta: {
    color: "#d2bdb2",
    fontSize: 13,
    marginTop: 4,
  },

  transactionAmountWrap: {
    alignItems: "flex-end",
  },

  incomeAmount: {
    color: "#79ff8a",
    fontWeight: "800",
    fontSize: 16,
  },

  expenseAmount: {
    color: "#ff7f76",
    fontWeight: "800",
    fontSize: 16,
  },

  neutralAmount: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },

  transactionTime: {
    color: "#d2bdb2",
    fontSize: 13,
    marginTop: 4,
  },

  fab: {
    position: "absolute",
    right: 24,
    bottom: 28,
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
});
