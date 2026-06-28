import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const PREDICTION_WEIGHTS = [0.05, 0.05, 0.15, 0.2, 0.25, 0.3];
const SCREEN_WIDTH = Dimensions.get("window").width;

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

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

const parseStoredDate = (value) => {
  if (!value) return null;

  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const getMonthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (date) =>
  date.toLocaleDateString("en-US", { month: "short" });

const getMonthSeries = () => {
  const currentMonth = startOfMonth(new Date());

  return Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5));
};

const getPercentChange = (currentValue, previousValue) => {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);

  if (!previous) {
    if (!current) {
      return { value: 0, text: "0.0% vs last month" };
    }

    return { value: 100, text: "New vs last month" };
  }

  const delta = ((current - previous) / previous) * 100;
  const prefix = delta > 0 ? "+" : "";

  return {
    value: delta,
    text: `${prefix}${delta.toFixed(1)}% vs last month`,
  };
};

const getWeightedPrediction = (values) => {
  const usableWeights = PREDICTION_WEIGHTS.slice(-values.length);
  const weightTotal = usableWeights.reduce((sum, value) => sum + value, 0) || 1;
  const weightedTotal = values.reduce(
    (sum, value, index) => sum + Number(value || 0) * usableWeights[index],
    0
  );

  return weightedTotal / weightTotal;
};

const normaliseInsightType = (value) => {
  if (!value) return "Insight";

  return String(value)
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const buildAnalytics = (transactions, insights) => {
  const monthSeries = getMonthSeries();
  const monthKeys = monthSeries.map(getMonthKey);
  const currentMonthKey = monthKeys[monthKeys.length - 1];
  const previousMonthKey = monthKeys[monthKeys.length - 2];

  const monthlyTotals = Object.fromEntries(monthKeys.map((key) => [key, 0]));
  const categoryMonthlyTotals = {};
  const currentMonthCategoryTotals = {};
  const currentMonthCategoryMeta = {};

  (transactions || []).forEach((transaction) => {
    if (transaction.type !== "expense") {
      return;
    }

    const amount = Number(transaction.amount || 0);
    const monthDate = parseStoredDate(transaction.date);
    if (!monthDate) {
      return;
    }

    const monthKey = getMonthKey(startOfMonth(monthDate));
    if (!monthlyTotals[monthKey] && monthlyTotals[monthKey] !== 0) {
      return;
    }

    monthlyTotals[monthKey] += amount;

    const categoryId = transaction.category_id || `uncategorized-${monthKey}`;
    const categoryName = transaction.categories?.name || "Uncategorized";
    const categoryIcon = transaction.categories?.icon || "tag";
    const categoryColor = transaction.categories?.color || "#c68c74";

    if (!categoryMonthlyTotals[categoryId]) {
      categoryMonthlyTotals[categoryId] = {
        id: categoryId,
        name: categoryName,
        icon: categoryIcon,
        color: categoryColor,
        totals: Object.fromEntries(monthKeys.map((key) => [key, 0])),
      };
    }

    categoryMonthlyTotals[categoryId].totals[monthKey] += amount;

    if (monthKey === currentMonthKey) {
      currentMonthCategoryTotals[categoryId] =
        (currentMonthCategoryTotals[categoryId] || 0) + amount;
      currentMonthCategoryMeta[categoryId] = {
        id: categoryId,
        name: categoryName,
        icon: categoryIcon,
        color: categoryColor,
      };
    }
  });

  const monthlyValues = monthKeys.map((key) => monthlyTotals[key] || 0);
  const currentSpending = monthlyTotals[currentMonthKey] || 0;
  const previousSpending = monthlyTotals[previousMonthKey] || 0;
  const monthlyAverage =
    monthlyValues.reduce((sum, value) => sum + value, 0) / (monthlyValues.length || 1);
  const predictedSpending = getWeightedPrediction(monthlyValues);
  const currentChange = getPercentChange(currentSpending, previousSpending);

  const topCategories = Object.entries(currentMonthCategoryTotals)
    .map(([categoryId, total]) => ({
      ...currentMonthCategoryMeta[categoryId],
      total,
      percent: currentSpending ? (total / currentSpending) * 100 : 0,
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 3);

  const predictionRows = Object.values(categoryMonthlyTotals)
    .map((category) => {
      const values = monthKeys.map((key) => category.totals[key] || 0);
      const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
      const predicted = getWeightedPrediction(values);
      const latest = values[values.length - 1] || 0;
      const direction =
        predicted > average * 1.05 ? "up" : predicted < average * 0.95 ? "down" : "flat";

      return {
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        average,
        latest,
        predicted,
        direction,
      };
    })
    .filter((category) => category.predicted > 0 || category.latest > 0)
    .sort((left, right) => right.predicted - left.predicted)
    .slice(0, 3);

  return {
    currentSpending,
    currentChange,
    monthlyAverage,
    predictedSpending,
    topCategories,
    predictionRows,
    insights: insights || [],
    lineData: {
      labels: monthSeries.map(getMonthLabel),
      datasets: [
        {
          data: monthlyValues.map((value) => Number(value.toFixed(2))),
          color: () => "#f5b38a",
          strokeWidth: 2,
        },
      ],
    },
  };
};

function getInteractiveAnalyticsState({
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
  const pointX =
    data.length === 1
      ? chartWidth / 2
      : chartSidePadding + (plotWidth / Math.max(data.length - 1, 1)) * index;
  const pointY = baselineY - (maxValue > 0 ? (data[index] / maxValue) * innerHeight : 0);
  const tooltipWidth = 172;
  const tooltipHeight = 86;
  const tooltipOffset = 12;
  const tooltipLeft = clamp(pointX - tooltipWidth / 2, 8, Math.max(chartWidth - tooltipWidth - 8, 8));
  const preferredTop = pointY - tooltipHeight - tooltipOffset;
  const tooltipTop =
    preferredTop < 8
      ? clamp(pointY + tooltipOffset, 8, chartHeight - tooltipHeight - 8)
      : clamp(preferredTop, 8, chartHeight - tooltipHeight - 8);

  return {
    index,
    pointX,
    pointY,
    tooltipLeft,
    tooltipTop,
  };
}

function AnalyticsTrendChart({ lineData }) {
  const values = useMemo(() => lineData?.datasets?.[0]?.data || [], [lineData]);
  const labels = useMemo(() => lineData?.labels || [], [lineData]);
  const [chartInteraction, setChartInteraction] = useState(null);
  const tooltipOpacity = useState(new Animated.Value(0))[0];
  const tooltipScale = useState(new Animated.Value(0.96))[0];
  const tooltipTranslate = useState(new Animated.ValueXY({ x: 0, y: 8 }))[0];

  const chartWidth = Math.max(SCREEN_WIDTH - 124, 220);
  const chartHeight = 260;
  const chartTopPadding = 18;
  const chartBottomPadding = 34;
  const chartSidePadding = 22;
  const innerHeight = chartHeight - chartTopPadding - chartBottomPadding;
  const baselineY = chartTopPadding + innerHeight;
  const maxValue = getNiceChartMax(Math.max(...values, 1));
  const points = values.map((value, index) => ({
    x:
      values.length === 1
        ? chartWidth / 2
        : chartSidePadding + ((chartWidth - chartSidePadding * 2) / Math.max(values.length - 1, 1)) * index,
    y: baselineY - (value / maxValue) * innerHeight,
    value,
    label: labels[index] || `M${index + 1}`,
    key: `${labels[index] || index}`,
  }));
  const linePath = createSmoothLinePath(points);
  const yTicks = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];

  useEffect(() => {
    setChartInteraction(null);
  }, [lineData]);

  const showChartInteraction = useCallback(
    (touchX, touchY) => {
      const nextInteraction = getInteractiveAnalyticsState({
        data: values,
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
      chartTopPadding,
      chartWidth,
      maxValue,
      tooltipOpacity,
      tooltipScale,
      tooltipTranslate,
      values,
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
            {formatCurrency(tick)}
          </Text>
        ))}
      </View>

      <View style={styles.trendPlotWrap}>
        <Svg width={chartWidth} height={chartHeight}>
          {yTicks.slice(0, -1).map((tick) => {
            const y = chartTopPadding + innerHeight * (1 - tick / maxValue);
            return <Line key={tick} x1={chartSidePadding} y1={y} x2={chartWidth - chartSidePadding} y2={y} stroke="#5b433c" strokeWidth="1" />;
          })}

          <Path
            d={linePath}
            fill="none"
            stroke="#f5b38a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((point) => (
            <Circle key={point.key} cx={point.x} cy={point.y} r="4.5" fill="#f8efe9" stroke="#f5b38a" strokeWidth="2" />
          ))}

          {chartInteraction ? (
            <>
              <Line
                x1={chartInteraction.pointX}
                y1={chartTopPadding}
                x2={chartInteraction.pointX}
                y2={baselineY}
                stroke="#f5b38a"
                strokeOpacity="0.28"
                strokeWidth="2"
                strokeDasharray="5 6"
              />
              <Circle cx={chartInteraction.pointX} cy={chartInteraction.pointY} r="8" fill="#f5b38a" fillOpacity="0.16" />
              <Circle cx={chartInteraction.pointX} cy={chartInteraction.pointY} r="4" fill="#f8efe9" stroke="#f5b38a" strokeWidth="2" />
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
            <Text style={styles.trendTooltipLabel}>{labels[chartInteraction.index] || "Month"}</Text>
            <Text style={styles.trendTooltipText}>Spent {formatCurrency(values[chartInteraction.index])}</Text>
          </Animated.View>
        ) : null}

        <View style={[styles.trendLabelsRow, { width: chartWidth, paddingHorizontal: chartSidePadding }]}>
          {labels.map((label, index) => (
            <Text
              key={label || index}
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

export default function AnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [analytics, setAnalytics] = useState(() =>
    buildAnalytics([], [])
  );

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAnalytics(buildAnalytics([], []));
        return;
      }

      const oldestMonth = getMonthSeries()[0];
      const startDate = getMonthKey(oldestMonth) + "-01";
      const endDate = getMonthKey(addMonths(startOfMonth(new Date()), 1)) + "-01";

      const [{ data: transactions, error: transactionError }, { data: insights, error: insightsError }] =
        await Promise.all([
          supabase
            .from("transactions")
            .select(`
              amount,
              date,
              type,
              category_id,
              categories(name,icon,color)
            `)
            .eq("user_id", user.id)
            .gte("date", startDate)
            .lt("date", endDate)
            .order("date", { ascending: true }),
          supabase
            .from("ai_insights")
            .select("id,insight_type,message,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

      if (transactionError) {
        throw transactionError;
      }

      if (insightsError) {
        throw insightsError;
      }

      setAnalytics(
        buildAnalytics(
          transactions || [],
          (insights || []).map((item) => ({
            ...item,
            label: normaliseInsightType(item.insight_type),
          }))
        )
      );
    } catch (error) {
      setErrorMessage(error.message || "Could not load analytics right now.");
      setAnalytics(buildAnalytics([], []));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  const hasTransactions = useMemo(
    () =>
      analytics.lineData.datasets[0].data.some((value) => Number(value || 0) > 0) ||
      analytics.topCategories.length > 0,
    [analytics]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Analytics" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Current Spending</Text>
            <Text style={[styles.amountRed, styles.amountCompact]}>
              {formatCurrency(analytics.currentSpending)}
            </Text>
            <Text style={styles.cardSubSmall}>{analytics.currentChange.text}</Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Monthly Average</Text>
            <Text style={styles.amountBlue}>{formatCurrency(analytics.monthlyAverage)}</Text>
            <Text style={styles.cardSubSmall}>Last 6 months</Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Predicted</Text>
            <Text style={styles.amountGreen}>{formatCurrency(analytics.predictedSpending)}</Text>
            <Text style={styles.cardSubSmall}>Weighted forecast</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.bigCard}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={styles.helperText}>Loading live analytics from Supabase...</Text>
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.bigCard}>
            <Text style={styles.heading}>Couldn&apos;t load analytics</Text>
            <Text style={styles.helperText}>{errorMessage}</Text>
            <Pressable style={styles.retryButton} onPress={loadAnalytics}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorMessage && !hasTransactions ? (
          <View style={styles.bigCard}>
            <Text style={styles.heading}>No analytics yet</Text>
            <Text style={styles.helperText}>
              Add a few expense transactions and this screen will start showing spending trends,
              top categories, predictions, and AI insights.
            </Text>
          </View>
        ) : null}

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Top Categories</Text>

          {analytics.topCategories.length ? (
            analytics.topCategories.map((category) => (
              <View key={category.id} style={styles.categoryRow}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryIcon, { backgroundColor: `${category.color}33` }]}>
                    <MaterialCommunityIcons
                      name={category.icon}
                      size={20}
                      color={category.color}
                    />
                  </View>
                  <View>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryPercent}>
                      {category.percent.toFixed(1)}% of this month&apos;s spending
                    </Text>
                  </View>
                </View>

                <Text style={styles.categoryAmount}>{formatCurrency(category.total)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.helperText}>No expense categories recorded this month yet.</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Monthly Overview</Text>

          <AnalyticsTrendChart lineData={analytics.lineData} />
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Spending Predictions</Text>

          {analytics.predictionRows.length ? (
            analytics.predictionRows.map((item) => (
              <View key={item.id} style={styles.predictionCard}>
                <View style={styles.predictionHeader}>
                  <View style={styles.predictionTitleWrap}>
                    <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />
                    <Text style={[styles.predTitle, { color: item.color }]}>{item.name}</Text>
                  </View>
                  <Text style={styles.predArrow}>
                    {item.direction === "up" ? "↑" : item.direction === "down" ? "↓" : "→"}
                  </Text>
                </View>

                <View style={styles.predRow}>
                  <View>
                    <Text style={styles.predText}>
                      6-month average: {formatCurrency(item.average)}
                    </Text>
                    <Text style={styles.predText}>
                      Current month: {formatCurrency(item.latest)}
                    </Text>
                  </View>
                  <Text style={styles.predictedAmount}>{formatCurrency(item.predicted)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.helperText}>Need more expense history before predictions appear.</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>AI Insights</Text>

          {analytics.insights.length ? (
            analytics.insights.map((insight) => (
              <View key={insight.id} style={styles.insightRow}>
                <View style={styles.insightBadge}>
                  <Text style={styles.insightBadgeText}>{insight.label}</Text>
                </View>
                <Text style={styles.insightMessage}>{insight.message}</Text>
                <Text style={styles.insightDate}>
                  {new Date(insight.created_at).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.helperText}>
              No AI insights have been stored yet for this account.
            </Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>About This Analysis</Text>

          <Text style={styles.subHeading}>Calculation Method</Text>
          <Text style={styles.listItem}>• Uses the last 6 months of expense transactions</Text>
          <Text style={styles.listItem}>• Transfers are excluded from spending analysis</Text>
          <Text style={styles.listItem}>• Category predictions use weighted monthly averages</Text>
          <Text style={styles.listItem}>• AI insights are read directly from the `ai_insights` table</Text>

          <Text style={styles.subHeading}>Weight Distribution</Text>
          <Text style={styles.listItem}>• 5 months ago: 5%</Text>
          <Text style={styles.listItem}>• 4 months ago: 5%</Text>
          <Text style={styles.listItem}>• 3 months ago: 15%</Text>
          <Text style={styles.listItem}>• 2 months ago: 20%</Text>
          <Text style={styles.listItem}>• Last month: 25%</Text>
          <Text style={styles.listItem}>• Current month: 30%</Text>
        </View>
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
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  cardSmall: {
    backgroundColor: colors.card,
    width: "31%",
    padding: 14,
    borderRadius: 16,
  },
  cardTitleSmall: {
    color: colors.text,
    fontSize: 12,
    marginBottom: 6,
  },
  amountCompact: {
    fontSize: 18,
  },
  amountBlue: {
    color: "#33aaff",
    fontWeight: "800",
    fontSize: 16,
  },
  amountGreen: {
    color: "#79ff8a",
    fontWeight: "800",
    fontSize: 16,
  },
  amountRed: {
    color: "#ff7474",
    fontWeight: "800",
    fontSize: 18,
  },
  cardSubSmall: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  bigCard: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 14,
  },
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  helperText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    backgroundColor: colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: "#2f1814",
    fontWeight: "700",
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  categoryName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  categoryPercent: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  categoryAmount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
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
    color: "#c6b9b0",
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
    width: 172,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(29, 18, 13, 0.95)",
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
  trendTooltipText: {
    color: "#d5c8be",
    fontSize: 12,
    fontWeight: "700",
  },
  trendLabelsRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  trendLabel: {
    flex: 1,
    color: "#c6b9b0",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  predictionCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  predictionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  predictionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  predTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  predRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  predText: {
    color: colors.text,
    marginTop: 4,
  },
  predArrow: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: "800",
  },
  predictedAmount: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 12,
  },
  insightRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  insightBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#4a332d",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  insightBadgeText: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "700",
  },
  insightMessage: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  insightDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  subHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 14,
  },
  listItem: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
  },
});
