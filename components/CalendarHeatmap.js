import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const START_YEAR = 2000;
const END_YEAR = 2066;
const OUTER_SCREEN_PADDING = 32;
const CARD_HORIZONTAL_PADDING = 40;

const MONTHS = buildMonths();

function buildMonths() {
  const months = [];

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (let month = 0; month < 12; month++) {
      months.push({ year, month, key: `${year}-${String(month + 1).padStart(2, "0")}` });
    }
  }

  return months;
}

function buildMonthCells(year, month, monthData, today) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ key: `empty-${year}-${month}-${i}`, empty: true });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const count = monthData[day] || 0;
    const isToday =
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day;

    cells.push({
      key: `${year}-${month}-${day}`,
      count,
      day,
      isToday,
    });
  }

  return cells;
}

function getHeatColor(count) {
  if (!count) return "#3b2b25";
  if (count === 1) return "#6e4a3a";
  if (count === 2) return "#a05c3b";

  return "#ff914d";
}

export default function CalendarHeatmap({ refreshKey = 0 }) {
  const [heatmapData, setHeatmapData] = useState({});
  const listRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();
  const pageWidth = windowWidth - OUTER_SCREEN_PADDING - CARD_HORIZONTAL_PADDING;
  const cellSize = Math.min(34, Math.floor(pageWidth / 8));
  const today = new Date();
  const currentMonthIndex =
    (today.getFullYear() - START_YEAR) * 12 + today.getMonth();

  useEffect(() => {
    loadHeatmap();
  }, [refreshKey]);

  useEffect(() => {
    if (!listRef.current || currentMonthIndex < 0) return;

    listRef.current.scrollToIndex({
      index: currentMonthIndex,
      animated: false,
    });
  }, [currentMonthIndex, pageWidth]);

  const loadHeatmap = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("transactions")
      .select("date")
      .eq("user_id", user.id);

    const map = {};

    data?.forEach((transaction) => {
      const date = new Date(transaction.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

      if (!map[monthKey]) {
        map[monthKey] = {};
      }

      if (!map[monthKey][day]) {
        map[monthKey][day] = 0;
      }

      map[monthKey][day] += 1;
    });

    setHeatmapData(map);
  };

  const renderMonth = ({ item }) => {
    const monthLabel = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric",
    }).format(new Date(item.year, item.month, 1));
    const cells = buildMonthCells(
      item.year,
      item.month,
      heatmapData[item.key] || {},
      today
    );

    return (
      <View style={[styles.monthPage, { width: pageWidth }]}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>

        <View style={styles.grid}>
          {cells.map((cell) => {
            if (cell.empty) {
              return (
                <View
                  key={cell.key}
                  style={[styles.emptyDay, { width: cellSize, height: cellSize }]}
                />
              );
            }

            return (
              <View
                key={cell.key}
                style={[
                  styles.day,
                  { width: cellSize, height: cellSize },
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
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendar heatmap</Text>

      <FlatList
        ref={listRef}
        data={MONTHS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        keyExtractor={(item) => item.key}
        renderItem={renderMonth}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 18,
    marginBottom: 20,
  },

  title: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 18,
    marginBottom: 14,
  },

  monthPage: {},

  monthLabel: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 12,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },

  day: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    marginHorizontal: 3,
  },

  emptyDay: {
    marginBottom: 6,
    marginHorizontal: 3,
  },

  today: {
    borderWidth: 2,
    borderColor: colors.gold,
  },

  dayText: {
    color: "#fff",
    fontSize: 12,
  },
});
