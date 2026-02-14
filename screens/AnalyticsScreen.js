// screens/AnalyticsScreen.js
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import colors from "../theme/colors";

export default function AnalyticsScreen({ navigation }) {

  // Dummy Data (later backend-driven)
  const lineData = {
    labels: ["08/25", "09/25", "10/25", "11/25", "12/25", "01/26"],
    datasets: [
      {
        data: [200, 0, 0, 0, 0, 0],
        color: () => "#f5b38a",
        strokeWidth: 2,
      },
    ],
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Analytics" navigation={navigation} />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ====== OVERALL SPENDING CARDS ====== */}
        <View style={styles.row}>
          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Current Spending</Text>
            <Text style={[styles.amountRed, { fontSize: 20 }]}>₹0.00</Text>
            <Text style={styles.cardSubSmall}>0.0% vs last month</Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Monthly Average</Text>
            <Text style={styles.amountBlue}>₹33.33</Text>
            <Text style={styles.cardSubSmall}>Last 6 Months</Text>
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitleSmall}>Predicted</Text>
            <Text style={styles.amountGreen}>₹60.00</Text>
            <Text style={styles.cardSubSmall}>Stable</Text>
          </View>
        </View>

        {/* ========= TOP CATEGORY ========= */}
        <View style={styles.bigCard}>
          <Text style={styles.heading}>Top categories</Text>

          <View style={styles.categoryRow}>
            <View style={styles.categoryLeft}>
              <View style={styles.categoryIcon} />
              <View>
                <Text style={styles.categoryName}>Food</Text>
                <Text style={styles.categoryPercent}>100.0% of total</Text>
              </View>
            </View>

            <Text style={styles.categoryAmount}>₹200.00</Text>
          </View>
        </View>

        {/* ========= MONTHLY OVERVIEW (LINE CHART) ========= */}
        <View style={styles.bigCard}>
          <Text style={styles.heading}>Monthly Overview</Text>

          <LineChart
            data={lineData}
            width={Dimensions.get("window").width - 32}
            height={260}
            chartConfig={{
              backgroundColor: colors.card,
              backgroundGradientFrom: colors.card,
              backgroundGradientTo: colors.card,
              color: () => "#f5b38a",
              labelColor: () => "#c6b9b0",
              propsForDots: {
                r: "4",
                strokeWidth: "2",
                stroke: "#f5b38a",
              },
            }}
            style={{ borderRadius: 12, marginTop: 10 }}
            bezier
          />
        </View>

        {/* ========= SPENDING PREDICTIONS ========= */}
        <View style={styles.bigCard}>
          <Text style={styles.heading}>Spending Predictions</Text>

          <Text style={styles.predTitle}>Food</Text>
          <View style={styles.predRow}>
            <View>
              <Text style={styles.predText}>Average Spending: ₹33.33</Text>
              <Text style={styles.predText}>Predicted: ₹60.00</Text>
            </View>
            <Text style={styles.predArrow}>↑</Text>
          </View>
        </View>

        {/* ========= ABOUT ANALYSIS ========= */}
        <View style={styles.bigCard}>
          <Text style={styles.heading}>About This Analysis</Text>

          <Text style={styles.subHeading}>Calculation Method:</Text>
          <Text style={styles.listItem}>• Based on last 6 months</Text>
          <Text style={styles.listItem}>• Transfers excluded</Text>
          <Text style={styles.listItem}>
            • Weighted averages (recent months matter more)
          </Text>
          <Text style={styles.listItem}>
            • Anomalies detected using statistical analysis
          </Text>

          <Text style={styles.subHeading}>Limitations:</Text>
          <Text style={styles.listItem}>
            • May not account for irregular expenses
          </Text>
          <Text style={styles.listItem}>
            • Past trends may not reflect future spending
          </Text>
          <Text style={styles.listItem}>
            • Seasonal variations impact accuracy
          </Text>
          <Text style={styles.listItem}>
            • Limited data reduces prediction accuracy
          </Text>

          <Text style={styles.subHeading}>Weight Distribution:</Text>
          <Text style={styles.listItem}>• Current month: 30%</Text>
          <Text style={styles.listItem}>• Last month: 25%</Text>
          <Text style={styles.listItem}>• 2 months ago: 20%</Text>
          <Text style={styles.listItem}>• 3 months ago: 15%</Text>
          <Text style={styles.listItem}>• 4–5 months ago: 5% each</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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

  amountBlue: { color: "#33aaff", fontWeight: "800", fontSize: 18 },
  amountGreen: { color: "#79ff8a", fontWeight: "800", fontSize: 18 },
  amountRed: { color: "#ff7474", fontWeight: "800", fontSize: 18 },

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

  /* CATEGORY BLOCK */
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryLeft: { flexDirection: "row", alignItems: "center" },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#c68c74",
    marginRight: 14,
  },
  categoryName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  categoryPercent: { color: colors.muted, fontSize: 12 },
  categoryAmount: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },

  /* Prediction */
  predTitle: { color: "#ff7878", fontSize: 18, fontWeight: "700" },
  predRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  predText: { color: colors.text, marginTop: 4 },
  predArrow: { color: "#ff7878", fontSize: 22, fontWeight: "800" },

  /* About section */
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
