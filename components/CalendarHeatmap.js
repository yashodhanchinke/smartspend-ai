import Feather from "@expo/vector-icons/Feather";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

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

const getHeatColor = (count) => {
  if (!count) return "#43302a";
  if (count === 1) return "#5d4339";
  if (count === 2) return "#7a5649";
  if (count === 3) return "#996b5b";
  if (count <= 5) return "#bb836f";
  return "#efb7a2";
};

const buildMonthCells = (visibleMonth, today, dayCountMap) => {
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
      count: dayCountMap[dateKey] || 0,
      isToday,
    });
  }

  return cells;
};

const getWeekRowCount = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.ceil((firstDay + daysInMonth) / 7);
};

const HeatmapMonthPage = memo(function HeatmapMonthPage({
  dayCountMap,
  item,
  pageWidth,
  today,
}) {
  const monthDate = new Date(item.year, item.month, 1);
  const cells = buildMonthCells(monthDate, today, dayCountMap);
  const weekRows = getWeekRowCount(item.year, item.month);

  return (
    <View
      style={[
        styles.page,
        {
          width: pageWidth,
          minHeight: weekRows === 4 ? 236 : weekRows === 5 ? 286 : 336,
        },
      ]}
    >
      <Text style={styles.monthTitle}>
        {monthDate.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        })}
      </Text>

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
                { backgroundColor: getHeatColor(cell.count) },
                cell.isToday && styles.today,
              ]}
            >
              <Text style={styles.dayText}>{cell.day}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default function CalendarHeatmap({ onPress, refreshKey = 0 }) {
  const [transactions, setTransactions] = useState([]);
  const listRef = useRef(null);
  const today = new Date();
  const currentMonthYear = today.getFullYear();
  const currentMonthNumber = today.getMonth();
  const months = useMemo(
    () => buildMonthRange(new Date(currentMonthYear, currentMonthNumber, 1)),
    [currentMonthNumber, currentMonthYear]
  );
  const currentMonthIndex = months.length - 1;
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width - 36, 280);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex?.({
        index: currentMonthIndex,
        animated: false,
      });
    });
  }, [currentMonthIndex, refreshKey]);

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
      .select("date,type")
      .eq("user_id", user.id);

    if (error) {
      console.warn("Could not load heatmap:", error.message);
      setTransactions([]);
      return;
    }

    setTransactions(data || []);
  };

  const dayCountMap = useMemo(() => {
    const counts = {};

    transactions.forEach((transaction) => {
      if (transaction.type === "transfer") {
        return;
      }

      const key = formatDateKey(parseStoredDate(transaction.date));
      counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
  }, [transactions]);

  const renderMonth = ({ item }) => (
    <HeatmapMonthPage
      item={item}
      pageWidth={pageWidth}
      today={today}
      dayCountMap={dayCountMap}
    />
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.headerRow} onPress={onPress}>
        <View style={styles.headerLeft}>
          <Feather name="calendar" size={22} color={colors.text} />
          <Text style={styles.title}>Calendar heatmap</Text>
        </View>

        <Feather name="chevron-right" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.divider} />

      <FlatList
        ref={listRef}
        data={months}
        style={styles.monthPager}
        horizontal
        pagingEnabled
        snapToInterval={pageWidth}
        disableIntervalMomentum
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={16}
        windowSize={3}
        removeClippedSubviews
        renderItem={renderMonth}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        initialScrollIndex={currentMonthIndex}
        onMomentumScrollEnd={(event) => {
          void event;
        }}
        onScrollToIndexFailed={() => {}}
      />
    </View>
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

  monthPager: {
    width: "100%",
  },

  page: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
  },

  monthTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 0,
  },

  day: {
    width: "14.285%",
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 233, 226, 0.02)",
  },

  emptyDay: {
    width: "14.285%",
    aspectRatio: 1,
    marginBottom: 6,
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
