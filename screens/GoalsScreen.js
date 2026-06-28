import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 32;
const RING_SIZE = 64;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const GOAL_TABS = ["Active", "Completed"];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function getSignedGoalAmount(transaction) {
  const amount = Number(transaction?.amount || 0);

  if (transaction?.type === "expense") {
    return -amount;
  }

  if (transaction?.type === "income") {
    return amount;
  }

  return 0;
}

function formatShortDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getGoalStatus(goal, currentAmount = Number(goal.savedAmount ?? goal.current_amount ?? 0)) {
  const target = Number(goal.target_amount || 0);
  const current = Number(currentAmount || 0);
  const startDate = goal.start_date ? new Date(goal.start_date) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (target > 0 && current >= target) {
    return "Completed";
  }

  if (startDate && startDate > today) {
    return "Active";
  }

  return "Active";
}

function getGoalProgress(goal, currentAmount = Number(goal.savedAmount ?? goal.current_amount ?? 0)) {
  const target = Number(goal.target_amount || 0);
  const current = Number(currentAmount || 0);

  if (target <= 0) {
    return 0;
  }

  return Math.max(Math.min(current / target, 1), 0);
}

function getGoalDayStats(goal, currentAmount = Number(goal.savedAmount ?? goal.current_amount ?? 0)) {
  const start = goal.start_date ? new Date(goal.start_date) : null;
  const end = goal.end_date ? new Date(goal.end_date) : null;
  const today = new Date();

  if (!start || !end) {
    return { daysLeft: 0, totalDays: 0, dailyTarget: 0 };
  }

  const normalizedStart = new Date(start);
  const normalizedEnd = new Date(end);
  normalizedStart.setHours(0, 0, 0, 0);
  normalizedEnd.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const totalDays = Math.max(Math.floor((normalizedEnd - normalizedStart) / 86400000) + 1, 1);
  const daysLeft = Math.max(Math.floor((normalizedEnd - today) / 86400000) + 1, 0);
  const remaining = Math.max(Number(goal.target_amount || 0) - Number(currentAmount || 0), 0);
  const dailyTarget = daysLeft > 0 ? remaining / daysLeft : 0;

  return { daysLeft, totalDays, dailyTarget };
}

function GoalProgressRing({ progress, color }) {
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={strokeDashoffset}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
  );
}

function GoalCard({ goal, onPress, index, totalCount }) {
  const target = Number(goal.target_amount || 0);
  const current = Number(goal.savedAmount ?? goal.current_amount ?? 0);
  const progress = getGoalProgress(goal, current);
  const remaining = Math.max(target - current, 0);
  const dayStats = getGoalDayStats(goal, current);
  const color = goal.color || "#ffb49a";

  return (
    <Pressable style={[styles.goalCard, { borderColor: `${color}22` }]} onPress={onPress}>
      <View style={styles.goalCardHeader}>
        <View style={[styles.goalIconWrap, { backgroundColor: `${color}26` }]}>
          <MaterialCommunityIcons name="flag-checkered" size={24} color={color} />
        </View>

        <View style={styles.goalHeaderCopy}>
          <Text style={[styles.goalEyebrow, { color }]} numberOfLines={1}>
            {goal.status || "Saving Goal"}
          </Text>
          <Text style={styles.goalTitle} numberOfLines={1}>
            {goal.title || "Goal"}
          </Text>
        </View>

        <View style={styles.goalRingWrap}>
          <GoalProgressRing progress={progress} color={color} />
          <Text style={styles.goalRingText}>{Math.round(progress * 100)}%</Text>
        </View>
      </View>

      <View style={styles.goalMetaRow}>
        <Text style={styles.goalMetaText}>From: {formatShortDate(goal.start_date)}</Text>
        <Text style={styles.goalMetaText}>To: {formatShortDate(goal.end_date)}</Text>
        <Text style={styles.goalMetaText}>Daily: {formatCurrency(dayStats.dailyTarget)}</Text>
      </View>

      <View style={styles.goalDivider} />

      <View style={styles.goalStatsRow}>
        <View style={styles.goalStat}>
          <Text style={styles.goalStatLabel}>Saved</Text>
          <Text style={styles.goalStatValue}>{formatCurrency(current)}</Text>
        </View>
        <View style={styles.goalStat}>
          <Text style={styles.goalStatLabel}>Goal</Text>
          <Text style={styles.goalStatValue}>{formatCurrency(target)}</Text>
        </View>
        <View style={styles.goalStat}>
          <Text style={styles.goalStatLabel}>Remaining</Text>
          <Text style={styles.goalStatValue}>
            {dayStats.daysLeft} / {dayStats.totalDays} days
          </Text>
        </View>
      </View>

      <View style={styles.goalProgressTrack}>
        <View
          style={[
            styles.goalProgressFill,
            {
              width: `${Math.max(progress * 100, 3)}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>

      <Text style={styles.goalFooter}>
        Remaining {formatCurrency(remaining)} • {Math.max(totalCount, 0)} goal
        {totalCount === 1 ? "" : "s"} in this section
      </Text>
    </Pressable>
  );
}

export default function GoalsScreen({ navigation }) {
  const [goals, setGoals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState("Active");
  const [pageIndex, setPageIndex] = useState(0);
  const listRef = useRef(null);

  const fetchGoals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setGoals([]);
      return;
    }

    const [goalsResult, txResult] = await Promise.all([
      supabase
      .from("goals")
      .select("id,title,target_amount,current_amount,start_date,end_date,color")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false }),
      supabase
        .from("transactions")
        .select("id,amount,type,goal_id,date")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    setGoals(goalsResult.data || []);
    setTransactions(txResult.data || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchGoals();
    }, [fetchGoals])
  );

  const visibleGoals = useMemo(() => {
    const goalMap = new Map();

    (transactions || []).forEach((transaction) => {
      if (!transaction.goal_id) {
        return;
      }

      goalMap.set(
        transaction.goal_id,
        (goalMap.get(transaction.goal_id) || 0) + getSignedGoalAmount(transaction)
      );
    });

    return (goals || [])
      .map((goal) => ({
        ...goal,
        savedAmount: goalMap.get(goal.id) ?? Number(goal.current_amount || 0),
        status: getGoalStatus(goal, goalMap.get(goal.id) ?? Number(goal.current_amount || 0)),
      }))
      .filter((goal) => goal.status === activeTab)
      .sort((left, right) => {
        const leftDate = left.end_date ? new Date(left.end_date).getTime() : 0;
        const rightDate = right.end_date ? new Date(right.end_date).getTime() : 0;
        return rightDate - leftDate;
      });
  }, [activeTab, goals, transactions]);

  const handleMomentumEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(offsetX / CARD_WIDTH);
    setPageIndex(Math.max(0, Math.min(nextIndex, Math.max(visibleGoals.length - 1, 0))));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Goals" />

      <View style={styles.headerRow}>
        <Text style={styles.headerSubtitle}>
          {activeTab === "Active"
            ? `${visibleGoals.length} active goal${visibleGoals.length === 1 ? "" : "s"}`
            : `${visibleGoals.length} completed goal${visibleGoals.length === 1 ? "" : "s"}`}
        </Text>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryPillText}>
            {pageIndex + 1}/{Math.max(visibleGoals.length, 1)}
          </Text>
        </View>
      </View>

      {visibleGoals.length === 0 ? (
        <View style={styles.emptyWrapper}>
          <Feather name="target" size={72} color="#ead5d0" />
          <Text style={styles.emptyTitle}>No {activeTab.toLowerCase()} goals</Text>
          <Text style={styles.emptySubtitle}>
            Tap the + button to create a new goal or switch tabs to see the others.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={visibleGoals}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          snapToInterval={CARD_WIDTH}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={({ item, index }) => (
            <View style={styles.carouselPage}>
              <GoalCard
                goal={item}
                index={index}
                totalCount={visibleGoals.length}
                onPress={() => navigation.navigate("GoalDetails", { goal: item })}
              />
            </View>
          )}
        />
      )}

      <Pressable style={styles.floatingAddButton} onPress={() => navigation.navigate("AddGoal")}>
        <Feather name="plus" size={20} color="#2f1814" />
      </Pressable>

      <View style={styles.tabBar}>
        {GOAL_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab(tab);
              setPageIndex(0);
              listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 10,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  summaryPill: {
    backgroundColor: "#2d1f1a",
    borderWidth: 1,
    borderColor: "#7d4e2b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryPillText: {
    color: "#e5a44e",
    fontSize: 13,
    fontWeight: "800",
  },
  emptyWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
  },
  emptySubtitle: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 26,
    fontSize: 15,
  },
  carouselContent: {
    paddingBottom: 124,
    paddingTop: 10,
  },
  carouselPage: {
    width: CARD_WIDTH,
    paddingRight: 0,
  },
  goalCard: {
    backgroundColor: "#53363d",
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    minHeight: 260,
  },
  goalCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  goalIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  goalHeaderCopy: {
    flex: 1,
    paddingTop: 2,
  },
  goalEyebrow: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  goalTitle: {
    color: "#f3d0d9",
    fontSize: 22,
    fontWeight: "800",
  },
  goalRingWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: RING_SIZE,
    height: RING_SIZE,
  },
  goalRingText: {
    position: "absolute",
    color: "#f4d8dc",
    fontSize: 12,
    fontWeight: "800",
  },
  goalMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 16,
    flexWrap: "wrap",
  },
  goalMetaText: {
    color: "#e8cdd5",
    fontSize: 13,
    fontWeight: "600",
  },
  goalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginVertical: 16,
  },
  goalStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  goalStat: {
    flex: 1,
  },
  goalStatLabel: {
    color: "#dab6be",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  goalStatValue: {
    color: "#fff3f5",
    fontSize: 15,
    fontWeight: "800",
  },
  goalProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#6b4850",
    overflow: "hidden",
    marginTop: 16,
  },
  goalProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  goalFooter: {
    color: "#d5b4be",
    marginTop: 14,
    fontSize: 12,
    fontWeight: "600",
  },
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    backgroundColor: "#201310",
    borderRadius: 999,
    padding: 5,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#2f211c",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 999,
  },
  tabButtonActive: {
    backgroundColor: "#ffb49a",
  },
  tabText: {
    color: "#d2bbb2",
    fontSize: 15,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#2a130f",
  },
  floatingAddButton: {
    position: "absolute",
    right: 16,
    bottom: 86,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ffb49a",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
});
