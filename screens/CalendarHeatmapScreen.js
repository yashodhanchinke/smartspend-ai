import { MaterialCommunityIcons } from "@expo/vector-icons";
import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { showTransactionEntryOptions } from "../util/transactionEntry";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const START_YEAR = 1950;

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

const getHeatColor = (count) => {
  if (!count) return null;
  if (count === 1) return "#5d4339";
  if (count === 2) return "#7a5649";
  if (count === 3) return "#996b5b";
  if (count <= 5) return "#bb836f";
  return "#efb7a2";
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

const getCalendarPageHeight = (cellCount) => {
  const weekRows = Math.ceil(cellCount / 7);

  if (weekRows <= 4) {
    return 236;
  }

  if (weekRows === 5) {
    return 288;
  }

  return 340;
};

const buildMonthRange = (currentMonth) => {
  const months = [];

  for (let year = START_YEAR; year <= currentMonth.getFullYear(); year += 1) {
    const endMonth = year === currentMonth.getFullYear() ? currentMonth.getMonth() : 11;

    for (let month = 0; month <= endMonth; month += 1) {
      months.push({
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        year,
        month,
      });
    }
  }

  return months;
};

const CalendarMonthPage = memo(function CalendarMonthPage({
  dayCountMap,
  item,
  pageWidth,
  selectedDateKey,
  onSelectDate,
}) {
  const monthDate = new Date(item.year, item.month, 1);
  const monthCells = buildMonthCells(monthDate, parseStoredDate(selectedDateKey));
  const pageHeight = getCalendarPageHeight(monthCells.length);

  return (
    <View style={[styles.page, { width: pageWidth, height: pageHeight }]}>
      <View style={styles.grid}>
        {monthCells.map((cell) => {
          if (cell.empty) {
            return <View key={cell.key} style={styles.emptyDay} />;
          }

          return (
            <TouchableOpacity
              key={cell.key}
              style={[
                styles.day,
                dayCountMap[cell.key] ? { backgroundColor: getHeatColor(dayCountMap[cell.key]) } : null,
                cell.selected && styles.selectedDay,
              ]}
              onPress={() => onSelectDate(cell.date)}
            >
              <Text style={[styles.dayText, cell.selected && styles.selectedDayText]}>
                {cell.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

export default function CalendarHeatmapScreen({ navigation }) {
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const months = useMemo(() => buildMonthRange(currentMonth), [currentMonth]);
  const currentMonthIndex = months.length - 1;
  const listRef = useRef(null);
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width - 32, 300);
  const [transactions, setTransactions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleIndex, setVisibleIndex] = useState(currentMonthIndex);

  const fetchTransactions = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTransactions([]);
      return;
    }

    const [{ data, error }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(`
          *,
          categories(name,icon,color)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

    if (error) {
      console.warn("Could not load calendar transactions:", error.message);
      setTransactions([]);
      return;
    }

    const accountMap = Object.fromEntries((accountRows || []).map((account) => [account.id, account]));

    setTransactions(
      (data || []).map((transaction) => ({
        ...transaction,
        account: accountMap[transaction.account_id] || null,
      }))
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  const selectedDateKey = formatDateKey(selectedDate);

  const dayCountMap = useMemo(() => {
    const counts = {};

    transactions.forEach((transaction) => {
      if (transaction.type === "transfer") {
        return;
      }

      const dateKey = formatDateKey(parseStoredDate(transaction.date));
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });

    return counts;
  }, [transactions]);

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

  const visibleMonth = months[visibleIndex] || months[currentMonthIndex];
  const renderMonthPage = useCallback(
    ({ item }) => (
      <CalendarMonthPage
        dayCountMap={dayCountMap}
        item={item}
        pageWidth={pageWidth}
        selectedDateKey={selectedDateKey}
        onSelectDate={setSelectedDate}
      />
    ),
    [dayCountMap, pageWidth, selectedDateKey]
  );

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
        <Text style={styles.monthTitle}>
          {new Date(visibleMonth.year, visibleMonth.month, 1).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </Text>

        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.weekLabel}>
              {label}
            </Text>
          ))}
        </View>

        <FlatList
          ref={listRef}
          data={months}
          horizontal
          pagingEnabled
          snapToInterval={pageWidth}
          disableIntervalMomentum
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          initialScrollIndex={currentMonthIndex}
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={16}
          windowSize={3}
          removeClippedSubviews
          getItemLayout={(_, index) => ({
            length: pageWidth,
            offset: pageWidth * index,
            index,
          })}
          renderItem={renderMonthPage}
          extraData={selectedDateKey}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
            setVisibleIndex(Math.max(0, Math.min(nextIndex, months.length - 1)));
          }}
          onScrollToIndexFailed={() => {}}
        />

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
          selectedTransactions.map((transaction, index) => (
            <TransactionListItem
              key={transaction.id}
              title={transaction.title || transaction.categories?.name || "Transaction"}
              accountLabel={transaction.account?.name || "Account"}
              dateLabel={
                formatDateKey(parseStoredDate(transaction.date)) === formatDateKey(today)
                  ? "Today"
                  : selectedDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
              }
              amount={transaction.amount}
              time={transaction.time}
              transactionType={transaction.type}
              categoryColor={transaction.categories?.color || "#5a4138"}
              categoryIcon={transaction.categories?.icon || "credit-card-outline"}
              showDivider={index !== selectedTransactions.length - 1}
            />
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

  monthTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 18,
  },

  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
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
  },

  page: {
    paddingBottom: 0,
  },

  day: {
    width: "14.285%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    marginBottom: 6,
  },

  emptyDay: {
    width: "14.285%",
    aspectRatio: 1,
    marginBottom: 6,
  },

  selectedDay: {
    borderWidth: 3,
    borderColor: colors.gold,
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
    marginBottom: 20,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: "#2f211d",
    borderWidth: 1,
    borderColor: "rgba(255, 225, 208, 0.08)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  summaryLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },

  summaryLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
  },

  summaryAmount: {
    color: colors.text,
    fontSize: 15,
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
