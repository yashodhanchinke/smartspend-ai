import Feather from "@expo/vector-icons/Feather";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Alert,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import TransactionListItem from "../components/TransactionListItem";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const INSIGHT_TABS = ["Daily", "Weekly", "Monthly", "Yearly"];
const TREND_TABS = ["month", "week"];

const parseStoredDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
};

const toStartOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : parseStoredDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getWeekStart = (value) => {
  const date = toStartOfDay(value);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date;
};

const getMonthStart = (value) => {
  const date = toStartOfDay(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getYearStart = (value) => {
  const date = toStartOfDay(value);
  return new Date(date.getFullYear(), 0, 1);
};

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getNiceChartMax = (value) => {
  const amount = Number(value || 0);

  if (amount <= 0) {
    return 1;
  }

  const roughStep = amount / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  let niceStep = magnitude;
  if (normalized > 1 && normalized <= 2) {
    niceStep = 2 * magnitude;
  } else if (normalized > 2 && normalized <= 5) {
    niceStep = 5 * magnitude;
  } else if (normalized > 5) {
    niceStep = 10 * magnitude;
  }

  return niceStep * 4;
};

const createSmoothLinePath = (points) => {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x},${points[0].y}`;
  }

  let path = `M ${points[0].x},${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;

    path += ` C ${controlX},${current.y} ${controlX},${next.y} ${next.x},${next.y}`;
  }

  return path;
};

const formatCompactMoney = (value) => {
  const amount = Number(value || 0);
  const prefix = amount < 0 ? "-" : "";
  return `${prefix}₹${Math.abs(amount).toFixed(2)}`;
};

const formatShortDate = (value) =>
  toStartOfDay(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatRelativeDate = (value) => {
  const today = toStartOfDay(new Date());
  const date = toStartOfDay(value);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
};

const getTransactionValue = (transaction) => Math.abs(Number(transaction?.amount || 0));

const buildMonthlyTrend = (transactions) => {
  const currentMonth = new Date();
  const months = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - offset, 1);
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    const total = transactions.reduce((sum, transaction) => {
      const transactionDate = toStartOfDay(transaction.date);
      const transactionKey = `${transactionDate.getFullYear()}-${String(
        transactionDate.getMonth() + 1
      ).padStart(2, "0")}`;

      return transactionKey === monthKey ? sum + getTransactionValue(transaction) : sum;
    }, 0);

    months.push({
      label: monthStart.toLocaleDateString("en-US", { month: "short" }),
      total,
    });
  }

  return months;
};

const buildWeeklyTrend = (transactions) => {
  const currentWeekStart = getWeekStart(new Date());
  const weeks = [];

  for (let offset = 3; offset >= 0; offset -= 1) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() - offset * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const total = transactions.reduce((sum, transaction) => {
      const transactionDate = toStartOfDay(transaction.date);
      return transactionDate >= weekStart && transactionDate <= weekEnd
        ? sum + getTransactionValue(transaction)
        : sum;
    }, 0);

    weeks.push({
      label: weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      total,
    });
  }

  return weeks;
};

const formatSectionTitle = (tab, date) => {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return current.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  if (tab === "Weekly") {
    const start = getWeekStart(current);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const startMonth = start.toLocaleDateString("en-US", { month: "short" });
    const endMonth = end.toLocaleDateString("en-US", { month: "short" });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
    }

    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
  }

  if (tab === "Monthly") {
    return current.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  return current.getFullYear().toString();
};

const getGroupKey = (tab, date) => {
  const current = parseStoredDate(date);

  if (tab === "Daily") {
    return `D:${formatShortDate(current)}`;
  }

  if (tab === "Weekly") {
    const start = getWeekStart(current);
    return `W:${formatShortDate(start)}`;
  }

  if (tab === "Monthly") {
    const start = getMonthStart(current);
    return `M:${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }

  return `Y:${getYearStart(current).getFullYear()}`;
};

const getCountLabel = (count) => `${count} ${count === 1 ? "transaction" : "transactions"}`;

const getCalendarDaySpanCount = (transactions) => {
  if (!transactions.length) {
    return 0;
  }

  const orderedDates = transactions
    .map((transaction) => toStartOfDay(transaction.date).getTime())
    .sort((left, right) => left - right);

  const first = orderedDates[0];
  const last = orderedDates[orderedDates.length - 1];
  const diffDays = Math.floor((last - first) / 86400000);

  return diffDays + 1;
};

function getInteractiveCategoryChartState({
  data,
  chartWidth,
  maxValue,
  touchX,
  touchY,
  chartHeight,
  chartTopPadding,
  chartBottomPadding,
  chartSidePadding,
}) {
  if (!data.length) {
    return null;
  }

  const innerHeight = chartHeight - chartTopPadding - chartBottomPadding;
  const baselineY = chartTopPadding + innerHeight;
  const plotWidth = chartWidth - chartSidePadding * 2;
  const safeTouchX = clamp(touchX, chartSidePadding, chartWidth - chartSidePadding);
  const progress = plotWidth > 0 ? (safeTouchX - chartSidePadding) / plotWidth : 0;
  const index = clamp(Math.round(progress * Math.max(data.length - 1, 0)), 0, data.length - 1);
  const item = data[index];
  const pointX =
    data.length === 1
      ? chartWidth / 2
      : chartSidePadding + (plotWidth / Math.max(data.length - 1, 1)) * index;
  const pointY = baselineY - (maxValue > 0 ? (item.total / maxValue) * innerHeight : 0);
  const tooltipWidth = 176;
  const tooltipHeight = 92;
  const tooltipOffset = 14;
  const tooltipLeft = clamp(
    pointX - tooltipWidth / 2,
    8,
    Math.max(chartWidth - tooltipWidth - 8, 8)
  );
  const preferredTop = pointY - tooltipHeight - tooltipOffset;
  const tooltipTop =
    preferredTop < 8
      ? clamp(pointY + tooltipOffset, 8, chartHeight - tooltipHeight - 8)
      : clamp(preferredTop, 8, chartHeight - tooltipHeight - 8);

  return {
    index,
    item,
    pointX,
    pointY,
    tooltipLeft,
    tooltipTop,
  };
}

function CategoryTrendChart({ data, categoryColor }) {
  const [chartInteraction, setChartInteraction] = useState(null);
  const tooltipOpacity = useState(new Animated.Value(0))[0];
  const tooltipScale = useState(new Animated.Value(0.96))[0];
  const tooltipTranslate = useState(new Animated.ValueXY({ x: 0, y: 8 }))[0];

  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - 72, 260);
  const chartHeight = 240;
  const chartTopPadding = 18;
  const chartBottomPadding = 34;
  const chartSidePadding = 20;
  const innerHeight = chartHeight - chartTopPadding - chartBottomPadding;
  const baselineY = chartTopPadding + innerHeight;
  const maxValue = getNiceChartMax(Math.max(...data.map((item) => item.total), 1));
  const labels = data.map((item) => item.label);

  const points = data.map((item, index) => ({
    x:
      data.length === 1
        ? chartWidth / 2
        : chartSidePadding + ((chartWidth - chartSidePadding * 2) / Math.max(data.length - 1, 1)) * index,
    y: baselineY - (item.total / maxValue) * innerHeight,
    total: item.total,
    label: item.label,
    key: `${item.label || index}`,
  }));

  const linePath = createSmoothLinePath(points);
  const yTicks = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];

  useEffect(() => {
    setChartInteraction(null);
  }, [data]);

  const showChartInteraction = useCallback(
    (touchX, touchY) => {
      const nextInteraction = getInteractiveCategoryChartState({
        data,
        chartWidth,
        maxValue,
        touchX,
        touchY,
        chartHeight,
        chartTopPadding,
        chartBottomPadding,
        chartSidePadding,
      });

      if (!nextInteraction) {
        return;
      }

      setChartInteraction((current) => {
        if (!current) {
          tooltipOpacity.stopAnimation();
          tooltipScale.stopAnimation();
          tooltipOpacity.setValue(0);
          tooltipScale.setValue(0.96);
          Animated.parallel([
            Animated.spring(tooltipOpacity, {
              toValue: 1,
              useNativeDriver: true,
              tension: 180,
              friction: 16,
            }),
            Animated.spring(tooltipScale, {
              toValue: 1,
              useNativeDriver: true,
              tension: 180,
              friction: 16,
            }),
          ]).start();
        }

        tooltipTranslate.setValue({
          x: nextInteraction.tooltipLeft,
          y: nextInteraction.tooltipTop,
        });

        return nextInteraction;
      });
    },
    [
      chartBottomPadding,
      chartHeight,
      chartSidePadding,
      chartTopPadding,
      chartWidth,
      data,
      maxValue,
      tooltipOpacity,
      tooltipScale,
      tooltipTranslate,
    ]
  );

  const clearChartInteraction = useCallback(() => {
    setChartInteraction((current) => {
      if (current) {
        tooltipOpacity.stopAnimation();
        tooltipScale.stopAnimation();
        Animated.parallel([
          Animated.timing(tooltipOpacity, {
            toValue: 0,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(tooltipScale, {
            toValue: 0.96,
            duration: 120,
            useNativeDriver: true,
          }),
        ]).start();
      }

      return null;
    });
  }, [tooltipOpacity, tooltipScale]);

  const chartPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          showChartInteraction(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderMove: (evt) => {
          showChartInteraction(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderRelease: clearChartInteraction,
        onPanResponderTerminate: clearChartInteraction,
      }),
    [clearChartInteraction, showChartInteraction]
  );

  return (
    <View style={styles.trendWrap}>
      <View style={styles.trendYAxis}>
        {yTicks.map((tick) => (
          <Text key={tick} style={styles.trendTick}>
            {formatMoney(tick)}
          </Text>
        ))}
      </View>

      <View style={styles.trendPlotWrap}>
        <Svg width={chartWidth} height={chartHeight}>
          {yTicks.slice(0, -1).map((tick) => {
            const y = chartTopPadding + innerHeight * (1 - tick / maxValue);
            return <Line key={tick} x1={chartSidePadding} y1={y} x2={chartWidth - chartSidePadding} y2={y} stroke="#4a332d" strokeWidth="1" />;
          })}

          <Path d={linePath} fill="none" stroke={categoryColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

          {points.map((point) => (
            <Circle key={point.key} cx={point.x} cy={point.y} r="4.5" fill="#f8efe9" stroke={categoryColor} strokeWidth="2" />
          ))}

          {chartInteraction ? (
            <>
              <Line
                x1={chartInteraction.pointX}
                y1={chartTopPadding}
                x2={chartInteraction.pointX}
                y2={baselineY}
                stroke={categoryColor}
                strokeOpacity="0.28"
                strokeWidth="2"
                strokeDasharray="5 6"
              />
              <Circle cx={chartInteraction.pointX} cy={chartInteraction.pointY} r="8" fill={categoryColor} fillOpacity="0.16" />
              <Circle cx={chartInteraction.pointX} cy={chartInteraction.pointY} r="4" fill="#f8efe9" stroke={categoryColor} strokeWidth="2" />
            </>
          ) : null}
        </Svg>

        <View style={styles.trendGestureLayer} {...chartPanResponder.panHandlers} />

        {chartInteraction ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.trendTooltip,
              {
                opacity: tooltipOpacity,
                transform: [
                  { translateX: tooltipTranslate.x },
                  { translateY: tooltipTranslate.y },
                  { scale: tooltipScale },
                ],
              },
            ]}
          >
            <Text style={styles.trendTooltipLabel}>{chartInteraction.item.label}</Text>
            <Text style={styles.trendTooltipValue}>{formatMoney(chartInteraction.item.total)}</Text>
            <Text style={styles.trendTooltipMeta}>Selected category trend</Text>
          </Animated.View>
        ) : null}

        <View style={[styles.trendLabelsRow, { width: chartWidth, paddingHorizontal: chartSidePadding }]}>
          {labels.map((label, index) => (
            <Text
              key={`${label || index}`}
              style={[
                styles.trendLabel,
                {
                  textAlign: index === 0 ? "left" : index === labels.length - 1 ? "right" : "center",
                },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function CategoryDetailsScreen({ navigation }) {
  const route = useRoute();
  const { category } = route.params;

  const [transactions, setTransactions] = useState([]);
  const [trendTab, setTrendTab] = useState("month");
  const [insightTab, setInsightTab] = useState("Weekly");
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTransactions = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      setTransactions([]);
      return;
    }

    const [{ data, error }, { data: accountRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          `
          *,
          categories(name,color,icon)
        `
        )
        .eq("user_id", user.id)
        .eq("category_id", category.id)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("accounts").select("id,name").eq("user_id", user.id),
    ]);

    if (error) {
      console.warn("Could not load category transactions:", error.message);
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
  }, [category.id]);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [fetchTransactions])
  );

  useEffect(() => {
    let channel;

    const subscribe = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      channel = supabase
        .channel(`category-details-${user.id}-${category.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "transactions",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchTransactions();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "accounts",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchTransactions();
          }
        )
        .on(
          "broadcast",
          { event: "refresh" },
          () => {
            fetchTransactions();
          }
        )
        .subscribe();
    };

    subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [category.id, fetchTransactions]);

  const total = useMemo(
    () => transactions.reduce((sum, transaction) => sum + getTransactionValue(transaction), 0),
    [transactions]
  );

  const transactionsByDate = useMemo(
    () =>
      [...transactions].sort((left, right) => {
        const dateDiff = toStartOfDay(right.date).getTime() - toStartOfDay(left.date).getTime();
        if (dateDiff !== 0) return dateDiff;

        return String(right.time || "").localeCompare(String(left.time || ""));
      }),
    [transactions]
  );

  const average = transactions.length ? total / transactions.length : 0;
  const largestTransaction = transactions.reduce(
    (largest, transaction) =>
      getTransactionValue(transaction) > getTransactionValue(largest)
        ? transaction
        : largest,
    transactions[0] || null
  );
  const latestTransaction = transactionsByDate[0] || null;

  const groupedTransactions = useMemo(() => {
    const groups = new Map();
    transactionsByDate.forEach((transaction) => {
      const key = getGroupKey(insightTab, transaction.date);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: toStartOfDay(transaction.date),
          title: formatSectionTitle(insightTab, transaction.date),
          total: 0,
          items: [],
        });
      }

      const group = groups.get(key);
      group.items.push(transaction);
      group.total += transaction.type === "income" ? getTransactionValue(transaction) : -getTransactionValue(transaction);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => {
          const valueDiff = getTransactionValue(right) - getTransactionValue(left);
          if (valueDiff !== 0) return valueDiff;

          const dateDiff = toStartOfDay(right.date).getTime() - toStartOfDay(left.date).getTime();
          if (dateDiff !== 0) return dateDiff;

          return String(right.time || "").localeCompare(String(left.time || ""));
        }),
      }))
      .sort((left, right) => right.date - left.date);
  }, [insightTab, transactionsByDate]);

  const groupCount = transactions.length;
  const activeDays = getCalendarDaySpanCount(transactions);
  const dailyAverage = activeDays ? total / activeDays : 0;

  const monthlyTrend = useMemo(() => buildMonthlyTrend(transactions), [transactions]);
  const weeklyTrend = useMemo(() => buildWeeklyTrend(transactions), [transactions]);
  const chartData = trendTab === "month" ? monthlyTrend : weeklyTrend;
  const maxChartValue = Math.max(...chartData.map((item) => item.total), 0);
  const categoryColor = category.color || colors.gold;
  const categoryIcon = category.icon || "shape-outline";
  const titlePrefix = category.type === "income" ? "received" : "spent";
  const trendTitle =
    trendTab === "month"
      ? category.type === "income"
        ? "Monthly Earnings Trend"
        : "Monthly Spending Trend"
      : category.type === "income"
      ? "Recent Weekly Earnings"
      : "Recent Weekly Spending";

  const handleDeleteCategory = () => {
    if (isDeleting) return;

    Alert.alert(
      `Delete ${category.name}?`,
      "The category will be removed and its transactions will become uncategorized.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData?.user;

            if (!user) return;

            setIsDeleting(true);

            const { error: detachError } = await supabase
              .from("transactions")
              .update({ category_id: null })
              .eq("user_id", user.id)
              .eq("category_id", category.id);

            if (detachError) {
              setIsDeleting(false);
              Alert.alert("Error", detachError.message);
              return;
            }

            const { error: deleteError } = await supabase
              .from("categories")
              .delete()
              .eq("id", category.id)
              .eq("user_id", user.id);

            setIsDeleting(false);

            if (deleteError) {
              Alert.alert("Error", deleteError.message);
              return;
            }

            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Feather name="arrow-left" size={28} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {category.name}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconAction} onPress={handleDeleteCategory}>
              <Feather name="trash-2" size={22} color="#ffb8ab" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Category Overview</Text>
            <View style={[styles.categoryChip, { backgroundColor: `${categoryColor}22` }]}>
              <MaterialCommunityIcons name={categoryIcon} size={18} color={categoryColor} />
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricRow}>
              <View style={[styles.metricCard, styles.metricTopLeft]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="wallet-outline" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>
                    Total {category.type === "income" ? "received" : "spent"}
                  </Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(total)}</Text>
              </View>

              <View style={[styles.metricCard, styles.metricTopRight]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="receipt-text-outline" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Transactions</Text>
                </View>
                <Text style={styles.metricValue}>{transactions.length}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={[styles.metricCard, styles.metricBottomLeft]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="trending-up" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Average {titlePrefix}</Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(average)}</Text>
              </View>

              <View style={[styles.metricCard, styles.metricBottomRight]}>
                <View style={styles.metricLabelRow}>
                  <MaterialCommunityIcons name="arrow-up-right" size={18} color={categoryColor} />
                  <Text style={styles.metricLabel}>Largest transaction</Text>
                </View>
                <Text style={styles.metricValue}>{formatMoney(getTransactionValue(largestTransaction))}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>{trendTitle}</Text>

            <View style={styles.segmentedToggle}>
              {TREND_TABS.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.segmentedButton, trendTab === tab && styles.segmentedButtonActive]}
                  onPress={() => setTrendTab(tab)}
                >
                  <MaterialCommunityIcons
                    name={tab === "month" ? "calendar-month" : "view-week"}
                    size={22}
                    color={trendTab === tab ? "#2c1e1a" : colors.text}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {maxChartValue > 0 ? (
            <CategoryTrendChart data={chartData} categoryColor={categoryColor} />
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartTitle}>No trend data yet</Text>
              <Text style={styles.emptyChartText}>
                Add a few transactions in this category and the chart will appear here.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.insightCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardTitle}>Transaction Insights</Text>
          </View>

          <View style={styles.insightStats}>
            <View style={styles.insightStat}>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>
                  {insightTab === "Daily"
                    ? "Today"
                    : insightTab === "Weekly"
                    ? "This week"
                    : insightTab === "Monthly"
                    ? "This month"
                    : "This year"}
                </Text>
              </View>
              <Text style={styles.insightValue}>
                {getCountLabel(groupCount)}
              </Text>
            </View>

            <View style={styles.insightStat}>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="chart-line" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>Daily average</Text>
              </View>
              <Text style={styles.insightValue}>{formatMoney(dailyAverage)} per day</Text>
            </View>
          </View>

          <View style={styles.insightDivider} />

          <View style={styles.lastTransactionRow}>
            <View>
              <View style={styles.metricLabelRow}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={categoryColor} />
                <Text style={styles.metricLabel}>Last transaction</Text>
              </View>
              <Text style={styles.lastTransactionText}>
                {latestTransaction ? formatRelativeDate(latestTransaction.date) : "No transactions"}
              </Text>
            </View>

            {latestTransaction ? (
              <Text style={[styles.lastTransactionAmount, { color: categoryColor }]}>
                {formatCompactMoney(getTransactionValue(latestTransaction))}
              </Text>
            ) : null}
          </View>

        </View>

        <View style={styles.transactionsSection}>
          {groupedTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyChartTitle}>No transactions found</Text>
              <Text style={styles.emptyChartText}>
                This category does not have any transactions for the selected range yet.
              </Text>
            </View>
          ) : (
            groupedTransactions.map((group) => {
              return (
                <View key={group.key} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    <Text
                      style={[
                        styles.groupTotal,
                        group.total < 0 && styles.groupTotalExpense,
                        group.total > 0 && styles.groupTotalIncome,
                      ]}
                    >
                      {formatCompactMoney(group.total)}
                    </Text>
                  </View>

                  <View style={styles.groupCard}>
                    {group.items.map((item, index) => (
                      <TransactionListItem
                        key={item.id}
                        title={item.title || item.categories?.name || "Transaction"}
                        accountLabel={item.account?.name || "Account"}
                        dateLabel={formatShortDate(item.date)}
                        amount={item.amount}
                        time={item.time}
                        transactionType={item.type}
                        amountPrefix=""
                        categoryColor={item.categories?.color || categoryColor}
                        categoryIcon={item.categories?.icon || categoryIcon}
                        showDivider={index !== group.items.length - 1}
                        onPress={() =>
                          navigation.navigate("TransactionDetails", {
                          transaction: item,
                        })
                        }
                      />
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.floatingEditButton}
        onPress={() => navigation.navigate("UpdateCategory", { category })}
      >
        <Feather name="edit-2" size={20} color="#2c1e1a" />
        <Text style={styles.floatingEditText}>Edit</Text>
      </TouchableOpacity>

      <View style={styles.bottomTabBar}>
        {INSIGHT_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setInsightTab(tab)}
            style={[styles.bottomTabItem, insightTab === tab && styles.bottomActiveTab]}
          >
            <Text style={[styles.bottomTabText, insightTab === tab && styles.bottomActiveTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingBottom: 220,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },

  headerButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  headerActions: {
    width: 42,
    alignItems: "flex-end",
  },

  iconAction: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "left",
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginHorizontal: 12,
  },

  headerTitleWrap: {
    flex: 1,
    justifyContent: "center",
  },

  summaryCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  cardTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },

  categoryChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  metricsGrid: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricRow: {
    flexDirection: "row",
  },

  metricCard: {
    flex: 1,
    minHeight: 92,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    justifyContent: "center",
  },

  metricTopLeft: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricTopRight: {
    borderBottomWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricBottomLeft: {
    borderRightWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricBottomRight: {
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  metricLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },

  metricValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 10,
  },

  chartCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  segmentedToggle: {
    flexDirection: "row",
    backgroundColor: "#2d201b",
    borderRadius: 18,
    padding: 4,
  },

  segmentedButton: {
    width: 46,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  segmentedButtonActive: {
    backgroundColor: colors.gold,
  },

  chart: {
    borderRadius: 18,
    paddingRight: 12,
  },
  trendWrap: {
    minHeight: 280,
  },
  trendYAxis: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 30,
    justifyContent: "space-between",
    zIndex: 2,
  },
  trendTick: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    width: 44,
    textAlign: "right",
  },
  trendPlotWrap: {
    marginLeft: 52,
    position: "relative",
    overflow: "hidden",
  },
  trendGestureLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  trendTooltip: {
    position: "absolute",
    width: 176,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(29, 18, 13, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255, 194, 171, 0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
    zIndex: 10,
  },
  trendTooltipLabel: {
    color: "#f8efe9",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },
  trendTooltipValue: {
    color: "#f7d8ca",
    fontSize: 16,
    fontWeight: "900",
  },
  trendTooltipMeta: {
    color: "#d8c6bb",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  trendLabelsRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  trendLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyChart: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  emptyChartTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyChartText: {
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  insightCard: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    padding: 18,
  },

  insightStats: {
    flexDirection: "row",
    gap: 12,
  },

  insightStat: {
    flex: 1,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.08)",
  },

  insightValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },

  insightDivider: {
    height: 1,
    backgroundColor: "rgba(255, 233, 220, 0.08)",
    marginVertical: 16,
  },

  lastTransactionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },

  lastTransactionText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 8,
  },

  lastTransactionAmount: {
    fontSize: 18,
    fontWeight: "900",
  },

  transactionsSection: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  groupSection: {
    marginBottom: 22,
  },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },

  groupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },

  groupTotal: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
  },

  groupCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
  },

  floatingEditButton: {
    position: "absolute",
    right: 20,
    bottom: 102,
    minWidth: 92,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.gold,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  floatingEditText: {
    color: "#2c1e1a",
    fontSize: 15,
    fontWeight: "800",
  },

  bottomTabBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    flexDirection: "row",
    backgroundColor: "#261813",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 188, 0.08)",
    padding: 8,
  },

  bottomTabItem: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: "center",
  },

  bottomTabText: {
    color: "#ead7cd",
    fontSize: 15,
    fontWeight: "700",
  },

  bottomActiveTab: {
    backgroundColor: colors.gold,
  },

  bottomActiveTabText: {
    color: "#2a1812",
  },
});
