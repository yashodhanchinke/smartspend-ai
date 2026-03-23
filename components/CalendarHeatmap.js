import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

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

const getHeatColor = (amount, maxAmount, isToday) => {
  if (amount <= 0 || maxAmount <= 0) return "#43302a";

  const intensity = amount / maxAmount;

  if (intensity < 0.18) return "#5a4038";
  if (intensity < 0.35) return "#725148";
  if (intensity < 0.55) return "#946558";
  if (intensity < 0.78) return "#bf806d";
  return "#efb7a2";
};

const buildMonthCells = (visibleMonth, today, dayAmountMap) => {
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
    const dateKey = formatDateKey(date);
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;

    cells.push({
      key: dateKey,
      day,
      amount: dayAmountMap[dateKey] || 0,
      isToday,
    });
  }

  return cells;
};

export default function CalendarHeatmap({ onPress, refreshKey = 0 }) {
  const [transactions, setTransactions] = useState([]);
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthKey = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
  const [visibleMonth, setVisibleMonth] = useState(currentMonth);

  useEffect(() => {
    const [year, month] = currentMonthKey.split("-").map(Number);
    setVisibleMonth(new Date(year, month, 1));
  }, [refreshKey, currentMonthKey]);

  useEffect(() => {
    loadHeatmap();
  }, [refreshKey]);

  const loadHeatmap = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTransactions([]);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("date,amount,type")
      .eq("user_id", user.id);

    if (error) {
      console.warn("Could not load heatmap:", error.message);
      setTransactions([]);
      return;
    }

    setTransactions(data || []);
  };

  const dayAmountMap = useMemo(() => {
    const totals = {};

    transactions.forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }

      const key = formatDateKey(parseStoredDate(transaction.date));
      totals[key] = (totals[key] || 0) + Number(transaction.amount || 0);
    });

    return totals;
  }, [transactions]);

  const cells = buildMonthCells(visibleMonth, today, dayAmountMap);
  const isCurrentMonth =
    visibleMonth.getFullYear() === currentMonth.getFullYear() &&
    visibleMonth.getMonth() === currentMonth.getMonth();
  const monthMaxAmount = cells.reduce(
    (highest, cell) => (cell.empty ? highest : Math.max(highest, cell.amount || 0)),
    0
  );

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="calendar" size={22} color={colors.text} />
          <Text style={styles.title}>Calendar heatmap</Text>
        </View>

        <Feather name="chevron-right" size={24} color={colors.text} />
      </View>

      <View style={styles.divider} />

      <View style={styles.content}>
        <View style={styles.monthSwitcher}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() =>
              setVisibleMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
              )
            }
          >
            <Feather name="chevron-left" size={20} color={colors.gold} />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {visibleMonth.toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            })}
          </Text>

          <TouchableOpacity
            style={[styles.navButton, isCurrentMonth && styles.navButtonDisabled]}
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
              size={20}
              color={isCurrentMonth ? "#7a6157" : colors.gold}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {cells.map((cell) => {
            if (cell.empty) {
              return <View key={cell.key} style={styles.emptyDay} />;
            }

            return (
              <View
                key={cell.key}
                style={[
                  styles.day,
                  { backgroundColor: getHeatColor(cell.amount, monthMaxAmount, cell.isToday) },
                  cell.isToday && styles.today,
                ]}
              >
                <Text style={styles.dayText}>{cell.day}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    paddingTop: 18,
    borderRadius: 24,
    marginBottom: 20,
    overflow: "hidden",
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 16,
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  title: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    marginLeft: 12,
  },

  divider: {
    height: 1,
    backgroundColor: "#58423a",
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },

  monthTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  monthSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4a352f",
  },

  navButtonDisabled: {
    backgroundColor: "#40302b",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },

  day: {
    width: "14.285%",
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 233, 226, 0.02)",
  },

  emptyDay: {
    width: "14.285%",
    aspectRatio: 1,
    marginBottom: 8,
  },

  today: {
    borderWidth: 2,
    borderColor: "#ffc4ad",
  },

  dayText: {
    color: "#f4e4dd",
    fontSize: 12,
    fontWeight: "600",
  },
});
