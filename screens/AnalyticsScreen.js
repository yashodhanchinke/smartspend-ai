import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BarChart, LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const chartWidth = Dimensions.get("window").width - 68;
const ANALYTICS_INSIGHT_TYPE = "analytics_summary";
const ANALYTICS_INSIGHT_PREFIX = `${ANALYTICS_INSIGHT_TYPE}::`;

function buildAnalyticsInsightKey(signature) {
  return `${ANALYTICS_INSIGHT_PREFIX}${signature}`;
}

function parseInsightSignature(insightType) {
  if (!insightType?.startsWith(ANALYTICS_INSIGHT_PREFIX)) {
    return null;
  }

  return insightType.slice(ANALYTICS_INSIGHT_PREFIX.length);
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatCardCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
  }).format(date);
}

function getComparison(currentValue, previousValue) {
  if (!previousValue) {
    if (!currentValue) {
      return { text: "0.0% vs last month", tone: "neutral" };
    }

    return { text: "New vs last month", tone: "positive" };
  }

  const change = ((currentValue - previousValue) / previousValue) * 100;

  if (change === 0) {
    return { text: "0.0% vs last month", tone: "neutral" };
  }

  return {
    text: `${change > 0 ? "+" : ""}${change.toFixed(1)}% vs last month`,
    tone: change > 0 ? "negative" : "positive",
  };
}

function getTrendArrow(currentValue, predictedValue) {
  if (predictedValue > currentValue) return "↑";
  if (predictedValue < currentValue) return "↓";

  return "→";
}

function getTrendColor(currentValue, predictedValue) {
  if (predictedValue > currentValue) return "#ff7878";
  if (predictedValue < currentValue) return "#79ff8a";

  return colors.text;
}

export default function AnalyticsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [reportSignature, setReportSignature] = useState(null);
  const [analytics, setAnalytics] = useState({
    currentSpending: 0,
    monthlyAverage: 0,
    predictedSpending: 0,
    comparison: { text: "0.0% vs last month", tone: "neutral" },
    monthlyLabels: [],
    monthlyValues: [],
    topCategories: [],
    predictionCategory: null,
  });
  const [aiSummary, setAiSummary] = useState("Your AI report will appear here once enough analytics data is available.");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const now = new Date();
    const startRange = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const endRange = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { data: transactions } = await supabase
      .from("transactions")
      .select(`
        amount,
        type,
        date,
        created_at,
        category_id,
        categories(name,color,icon)
      `)
      .eq("user_id", user.id)
      .gte("date", startRange.toISOString().split("T")[0])
      .lt("date", endRange.toISOString().split("T")[0])
      .neq("type", "transfer");

    const monthBuckets = [];

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.push({
        key: getMonthKey(monthDate),
        label: getMonthLabel(monthDate),
        total: 0,
      });
    }

    const monthMap = Object.fromEntries(
      monthBuckets.map((bucket) => [bucket.key, bucket])
    );
    const categoryTotals = {};
    let latestCreatedAt = null;
    const transactionCount = transactions?.length || 0;

    transactions?.forEach((transaction) => {
      const txDate = new Date(transaction.date);
      const monthKey = getMonthKey(txDate);
      const amount = Number(transaction.amount || 0);
      const createdAt = transaction.created_at || null;

      if (createdAt && (!latestCreatedAt || new Date(createdAt) > new Date(latestCreatedAt))) {
        latestCreatedAt = createdAt;
      }

      if (transaction.type === "expense" && monthMap[monthKey]) {
        monthMap[monthKey].total += amount;
      }

      if (transaction.type === "expense" && transaction.category_id) {
        if (!categoryTotals[transaction.category_id]) {
          categoryTotals[transaction.category_id] = {
            id: transaction.category_id,
            name: transaction.categories?.name || "Category",
            color: transaction.categories?.color || "#c68c74",
            icon: transaction.categories?.icon || "tag",
            total: 0,
          };
        }

        categoryTotals[transaction.category_id].total += amount;
      }
    });

    const monthlyValues = monthBuckets.map((bucket) => monthMap[bucket.key].total);
    const monthlyLabels = monthBuckets.map((bucket) => bucket.label);
    const currentSpending = monthlyValues[monthlyValues.length - 1] || 0;
    const lastMonthSpending = monthlyValues[monthlyValues.length - 2] || 0;
    const monthlyAverage =
      monthlyValues.reduce((sum, value) => sum + value, 0) /
      (monthlyValues.length || 1);
    const weighted =
      (monthlyValues[5] || 0) * 0.3 +
      (monthlyValues[4] || 0) * 0.25 +
      (monthlyValues[3] || 0) * 0.2 +
      (monthlyValues[2] || 0) * 0.15 +
      (monthlyValues[1] || 0) * 0.05 +
      (monthlyValues[0] || 0) * 0.05;
    const topCategories = Object.values(categoryTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    const signature = [
      monthBuckets[0]?.key || "none",
      monthBuckets[monthBuckets.length - 1]?.key || "none",
      transactionCount,
      latestCreatedAt || "none",
    ].join(":");

    setReportSignature(signature);

    setAnalytics({
      currentSpending,
      monthlyAverage,
      predictedSpending: weighted,
      comparison: getComparison(currentSpending, lastMonthSpending),
      monthlyLabels,
      monthlyValues,
      topCategories,
      predictionCategory: topCategories[0] || null,
    });

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
    }, [fetchAnalytics])
  );

  useEffect(() => {
    const generateSummary = async () => {
      if (!analytics.monthlyValues.length) return;

      let cachedInsight = null;
      let legacyInsight = null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setAiSummary("Sign in to view your AI report.");
          return;
        }

        const insightType = buildAnalyticsInsightKey(reportSignature || "empty");
        const { data: cachedInsights, error: cachedInsightsError } = await supabase
          .from("ai_insights")
          .select("id, insight_type, message, created_at")
          .eq("user_id", user.id)
          .like("insight_type", `${ANALYTICS_INSIGHT_PREFIX}%`)
          .order("created_at", { ascending: false })
          .limit(20);

        if (cachedInsightsError) {
          throw cachedInsightsError;
        }

        cachedInsight =
          cachedInsights?.find((item) => parseInsightSignature(item.insight_type) === reportSignature) ||
          null;

        if (
          !analytics.currentSpending &&
          !analytics.monthlyAverage &&
          !analytics.predictedSpending &&
          !analytics.topCategories.length
        ) {
          setAiSummary("Add more transaction data to generate your AI report.");
          return;
        }

        if (cachedInsight?.message) {
          setAiSummary(cachedInsight.message);
          return;
        }

        const { data: legacyInsightRow, error: legacyInsightError } = await supabase
          .from("ai_insights")
          .select("id, message, created_at")
          .eq("user_id", user.id)
          .eq("insight_type", ANALYTICS_INSIGHT_TYPE)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (legacyInsightError) {
          throw legacyInsightError;
        }

        legacyInsight = legacyInsightRow;

        if (legacyInsight?.message && reportSignature) {
          const { error: updateLegacyError } = await supabase
            .from("ai_insights")
            .update({
              insight_type: insightType,
              message: legacyInsight.message,
            })
            .eq("id", legacyInsight.id);

          if (updateLegacyError) {
            throw updateLegacyError;
          }

          setAiSummary(legacyInsight.message);
          return;
        }

        setAiLoading(true);
        const { data, error } = await supabase.functions.invoke(
          "generate-analytics-summary",
          {
            body: {
              currentSpending: analytics.currentSpending,
              monthlyAverage: analytics.monthlyAverage,
              predictedSpending: analytics.predictedSpending,
              monthlyLabels: analytics.monthlyLabels,
              monthlyValues: analytics.monthlyValues,
              topCategories: analytics.topCategories.map((item) => ({
                name: item.name,
                total: item.total,
              })),
            },
          }
        );

        if (error) {
          throw error;
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        const text = data?.summary || "AI report is unavailable right now.";

        const { error: insertError } = await supabase.from("ai_insights").insert([
          {
            user_id: user.id,
            insight_type: insightType,
            message: text,
          },
        ]);

        if (insertError) {
          throw insertError;
        }

        setAiSummary(text);
      } catch (error) {
        let message = error?.message
          ? `AI report error: ${error.message}`
          : "AI report could not be generated right now.";

        if (error instanceof FunctionsHttpError) {
          try {
            const errorData = await error.context.json();

            if (errorData?.error) {
              message = `AI report error: ${errorData.error}`;
            }
          } catch {
            message = "AI report error: The backend returned an unreadable response.";
          }
        }

        setAiSummary(cachedInsight?.message || legacyInsight?.message || message);
      } finally {
        setAiLoading(false);
      }
    };

    generateSummary();
  }, [analytics, reportSignature]);

  const maxMonthlyValue = Math.max(...analytics.monthlyValues, 0);
  const topTotal = analytics.topCategories[0]?.total || 0;
  const predictionCategory = analytics.predictionCategory;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Analytics" navigation={navigation} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Current Spending</Text>
            <Text
              style={[styles.amountValue, styles.amountRed]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {loading ? "..." : formatCardCurrency(analytics.currentSpending)}
            </Text>
            <Text
              style={[
                styles.cardSubSmall,
                analytics.comparison.tone === "positive" && styles.subPositive,
                analytics.comparison.tone === "negative" && styles.subNegative,
              ]}
            >
              {analytics.comparison.text}
            </Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Monthly Average</Text>
            <Text
              style={[styles.amountValue, styles.amountBlue]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {loading ? "..." : formatCardCurrency(analytics.monthlyAverage)}
            </Text>
            <Text style={styles.cardSubSmall}>Last 6 months</Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Predicted</Text>
            <Text
              style={[styles.amountValue, styles.amountGreen]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {loading ? "..." : formatCardCurrency(analytics.predictedSpending)}
            </Text>
            <Text style={styles.cardSubSmall}>Weighted forecast</Text>
          </View>
        </ScrollView>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Top categories</Text>

          {analytics.topCategories.length ? (
            analytics.topCategories.map((category) => {
              const share = topTotal ? (category.total / topTotal) * 100 : 0;

              return (
                <View key={category.id} style={styles.categoryBlock}>
                  <View style={styles.categoryRow}>
                    <View style={styles.categoryLeft}>
                      <View
                        style={[
                          styles.categoryIcon,
                          { backgroundColor: `${category.color}33` },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={category.icon}
                          size={20}
                          color={category.color}
                        />
                      </View>
                      <View>
                        <Text style={styles.categoryName}>{category.name}</Text>
                        <Text style={styles.categoryPercent}>
                          {share.toFixed(1)}% of top category spend
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.categoryAmount}>
                      {formatCurrency(category.total)}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No expense data yet</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Monthly Overview</Text>

          {analytics.monthlyValues.some((value) => value > 0) ? (
            <LineChart
              data={{
                labels: analytics.monthlyLabels,
                datasets: [
                  {
                    data: analytics.monthlyValues,
                    color: () => "#f5b38a",
                    strokeWidth: 2,
                  },
                ],
              }}
              width={chartWidth}
              height={240}
              chartConfig={{
                backgroundColor: colors.card,
                backgroundGradientFrom: colors.card,
                backgroundGradientTo: colors.card,
                color: () => "#f5b38a",
                labelColor: () => "#c6b9b0",
                decimalPlaces: 0,
                propsForDots: {
                  r: "4",
                  strokeWidth: "2",
                  stroke: "#f5b38a",
                },
              }}
              style={styles.chart}
              bezier
            />
          ) : (
            <Text style={styles.emptyText}>No monthly spending data yet</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Category Spend Chart</Text>

          {analytics.topCategories.length ? (
            <BarChart
              data={{
                labels: analytics.topCategories.map((item) => item.name.slice(0, 6)),
                datasets: [{ data: analytics.topCategories.map((item) => item.total) }],
              }}
              width={chartWidth}
              height={220}
              fromZero
              showValuesOnTopOfBars
              yAxisLabel="₹"
              chartConfig={{
                backgroundColor: colors.card,
                backgroundGradientFrom: colors.card,
                backgroundGradientTo: colors.card,
                decimalPlaces: 0,
                color: () => "#ffcc99",
                labelColor: () => "#c6b9b0",
                fillShadowGradient: "#ffcc99",
                fillShadowGradientOpacity: 1,
                barPercentage: 0.6,
              }}
              style={styles.chart}
            />
          ) : (
            <Text style={styles.emptyText}>Add expense data to see category charts</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>Spending Prediction</Text>

          {predictionCategory ? (
            <>
              <Text style={styles.predTitle}>{predictionCategory.name}</Text>
              <View style={styles.predRow}>
                <View>
                  <Text style={styles.predText}>
                    Current total: {formatCurrency(predictionCategory.total)}
                  </Text>
                  <Text style={styles.predText}>
                    Next month estimate: {formatCurrency(analytics.predictedSpending)}
                  </Text>
                  <Text style={styles.predText}>
                    6-month peak: {formatCurrency(maxMonthlyValue)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.predArrow,
                    { color: getTrendColor(analytics.currentSpending, analytics.predictedSpending) },
                  ]}
                >
                  {getTrendArrow(analytics.currentSpending, analytics.predictedSpending)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>Not enough data for prediction yet</Text>
          )}
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>AI Report</Text>
          <Text style={styles.aiStatus}>
            {aiLoading ? "Generating report..." : "Automated spending overview"}
          </Text>
          <Text style={styles.aiText}>{aiSummary}</Text>
        </View>

        <View style={styles.bigCard}>
          <Text style={styles.heading}>About This Analysis</Text>
          <Text style={styles.listItem}>• Based on your last 6 months of non-transfer transactions</Text>
          <Text style={styles.listItem}>• Current spending uses this month&apos;s expense transactions only</Text>
          <Text style={styles.listItem}>• Predicted spending uses a weighted month-over-month forecast</Text>
          <Text style={styles.listItem}>• Top categories are ranked by actual total expense amount</Text>
          <Text style={styles.listItem}>• AI report depends on a valid Gemini API key and network access</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  row: {
    paddingHorizontal: 16,
    marginTop: 12,
    paddingRight: 6,
  },

  cardSmall: {
    backgroundColor: colors.card,
    width: 186,
    padding: 14,
    borderRadius: 16,
    minHeight: 112,
    marginRight: 12,
  },

  cardTitleSmall: {
    color: colors.text,
    fontSize: 12,
    marginBottom: 10,
  },

  amountValue: {
    fontWeight: "800",
    fontSize: 21,
    lineHeight: 26,
    includeFontPadding: false,
  },
  amountBlue: { color: "#33aaff" },
  amountGreen: { color: "#79ff8a" },
  amountRed: { color: "#ff7474" },

  cardSubSmall: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },

  subPositive: {
    color: "#79ff8a",
  },

  subNegative: {
    color: "#ff7474",
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

  categoryBlock: {
    marginBottom: 14,
  },

  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  categoryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },

  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 14,
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 15,
    fontWeight: "700",
  },

  chart: {
    borderRadius: 12,
    marginTop: 8,
  },

  predTitle: {
    color: "#ffcc99",
    fontSize: 18,
    fontWeight: "700",
  },

  predRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    alignItems: "center",
  },

  predText: {
    color: colors.text,
    marginTop: 4,
    fontSize: 13,
  },

  predArrow: {
    fontSize: 24,
    fontWeight: "800",
  },

  aiStatus: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 8,
  },

  aiText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },

  emptyText: {
    color: colors.muted,
    fontSize: 14,
  },

  listItem: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
  },
});
