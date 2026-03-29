import DateTimePicker from "@react-native-community/datetimepicker";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");
const SCREEN_PADDING = 16;
const CARD_WIDTH = width - SCREEN_PADDING * 2;
const DONUT_CANVAS_WIDTH = Math.min(width - 24, 336);
const DONUT_CANVAS_MIN_HEIGHT = 212;
const DONUT_RADIUS = 70;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const CHART_HEIGHT = 210;
const CHART_TOP_PADDING = 16;
const CHART_BOTTOM_PADDING = 28;
const RANGE_OPTIONS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];
const TYPE_OPTIONS = ["income", "expense"];
const SECTION_CARDS = [
  {
    key: "yearly-summary",
    title: "Yearly Summary",
    description: "Comprehensive annual financial summary with monthly breakdowns",
    icon: "trending-up",
  },
  {
    key: "category-breakdown",
    title: "Category Breakdown",
    description: "Detailed spending analysis by category with visual charts",
    icon: "chart-donut",
  },
  {
    key: "budget-performance",
    title: "Budget Performance",
    description: "Track budget vs actual spending with performance indicators",
    icon: "bullseye-arrow",
  },
  {
    key: "cash-flow-analysis",
    title: "Cash Flow Analysis",
    description: "Money flow trends and patterns over time",
    icon: "cash-multiple",
  },
  {
    key: "goal-progress",
    title: "Goal Progress",
    description: "Financial goals tracking with milestone progress",
    icon: "trophy-outline",
  },
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatShortCurrency(value) {
  const amount = Number(value || 0);
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount)}`;
}

function getNiceChartMax(value) {
  const amount = Number(value || 0);

  if (amount <= 0) {
    return 4;
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
}

function getChartTicks(maxValue, count = 5) {
  const safeMax = Number(maxValue || 0);

  if (safeMax <= 0) {
    return [];
  }

  const intervals = Math.max(count - 1, 1);
  const step = safeMax / intervals;
  return Array.from({ length: count }, (_, index) => step * index).reverse();
}

function parseStoredDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function getStartOfWeek(dateValue) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getEndOfWeek(dateValue) {
  const date = getStartOfWeek(dateValue);
  date.setDate(date.getDate() + 6);
  return date;
}

function buildGroupKey(date, grouping) {
  if (grouping === "daily") {
    return formatDateKey(date);
  }

  if (grouping === "weekly") {
    return `week-${formatDateKey(getStartOfWeek(date))}`;
  }

  if (grouping === "monthly") {
    return `month-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  return `year-${date.getFullYear()}`;
}

function buildGroupLabel(date, grouping) {
  if (grouping === "daily") {
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  }

  if (grouping === "weekly") {
    const start = getStartOfWeek(date);
    const end = getEndOfWeek(date);
    const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel =
      start.getMonth() === end.getMonth()
        ? end.toLocaleDateString("en-US", { day: "numeric" })
        : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startLabel}-${endLabel}`;
  }

  if (grouping === "monthly") {
    return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }

  return String(date.getFullYear());
}

function getYearBounds(year) {
  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
  };
}

function getGroupBounds(dateValue, grouping) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);

  if (grouping === "daily") {
    return { start: date, end: date };
  }

  if (grouping === "weekly") {
    return { start: getStartOfWeek(date), end: getEndOfWeek(date) };
  }

  if (grouping === "monthly") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
  }

  return {
    start: new Date(date.getFullYear(), 0, 1),
    end: new Date(date.getFullYear(), 11, 31),
  };
}

function buildGroupedSeries(transactions, grouping) {
  const groups = new Map();

  transactions.forEach((transaction) => {
    const date = parseStoredDate(transaction.date);
    const key = buildGroupKey(date, grouping);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date,
        label: buildGroupLabel(date, grouping),
        income: 0,
        expense: 0,
        total: 0,
        count: 0,
      });
    }

    const group = groups.get(key);
    const amount = Number(transaction.amount || 0);

    if (transaction.type === "income") {
      group.income += amount;
    } else if (transaction.type === "expense") {
      group.expense += amount;
    }

    group.total += amount;
    group.count += 1;
  });

  return Array.from(groups.values()).sort((left, right) => left.date - right.date);
}

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
}

function filterTransactionsByBounds(transactions, startDate, endDate) {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  return transactions.filter((transaction) => transaction.date >= startKey && transaction.date <= endKey);
}

function buildChartSeriesForRange(transactions, range, periodStart, periodEnd) {
  if (range === "daily") {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      key: `hour-${hour}`,
      label: [0, 6, 12, 18, 23].includes(hour) ? `${String(hour).padStart(2, "0")}:00` : "",
      shortLabel: `${String(hour).padStart(2, "0")}:00`,
      income: 0,
      expense: 0,
    }));

    transactions.forEach((transaction) => {
      const hour = Number(String(transaction.time || "00:00:00").split(":")[0] || 0);
      const amount = Number(transaction.amount || 0);

      if (transaction.type === "income") {
        buckets[hour].income += amount;
      } else if (transaction.type === "expense") {
        buckets[hour].expense += amount;
      }
    });

    return buckets;
  }

  if (range === "weekly") {
    const days = [];

    for (let index = 0; index < 7; index += 1) {
      const date = addDays(getStartOfWeek(periodStart), index);
      const dayTransactions = filterTransactionsByBounds(transactions, date, date);

      days.push({
        key: formatDateKey(date),
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        shortLabel: date.toLocaleDateString("en-US", { weekday: "short" }),
        income: dayTransactions
          .filter((item) => item.type === "income")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
        expense: dayTransactions
          .filter((item) => item.type === "expense")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      });
    }

    return days;
  }

  if (range === "monthly") {
    const days = [];
    const start = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
    const end = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0);

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const dayTransactions = filterTransactionsByBounds(transactions, cursor, cursor);
      const dayOfMonth = cursor.getDate();

      days.push({
        key: formatDateKey(cursor),
        label: [1, 7, 13, 19, 25, 31].includes(dayOfMonth) ? String(dayOfMonth) : "",
        shortLabel: String(dayOfMonth),
        income: dayTransactions
          .filter((item) => item.type === "income")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
        expense: dayTransactions
          .filter((item) => item.type === "expense")
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      });
    }

    return days;
  }

  const months = [];
  const start = new Date(periodStart.getFullYear(), 0, 1);

  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(start.getFullYear(), month, 1);
    const monthEnd = new Date(start.getFullYear(), month + 1, 0);
    const monthTransactions = filterTransactionsByBounds(transactions, monthStart, monthEnd);
    const label = monthStart.toLocaleDateString("en-US", { month: "short" });

    months.push({
      key: `${monthStart.getFullYear()}-${month + 1}`,
      label: month % 2 === 0 ? label : "",
      shortLabel: label,
      income: monthTransactions
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      expense: monthTransactions
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    });
  }

  return months;
}

function buildCategoryBreakdown(transactions, type) {
  const bucket = {};

  transactions
    .filter((transaction) => transaction.type === type)
    .forEach((transaction) => {
      const key = transaction.category_id || transaction.categories?.name || "other";

      if (!bucket[key]) {
        bucket[key] = {
          key,
          name: transaction.categories?.name || (type === "income" ? "Income" : "Others"),
          icon: transaction.categories?.icon || "tag",
          color: transaction.categories?.color || (type === "income" ? "#eb727b" : "#6db2ec"),
          total: 0,
          count: 0,
        };
      }

      bucket[key].total += Number(transaction.amount || 0);
      bucket[key].count += 1;
    });

  const items = Object.values(bucket).sort((left, right) => right.total - left.total);
  const total = items.reduce((sum, item) => sum + item.total, 0);

  return items.map((item, index) => ({
    ...item,
    percentage: total > 0 ? (item.total / total) * 100 : 0,
    color: item.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
  }));
}

function buildDonutSegments(items) {
  let cumulativeFraction = 0;

  return items.map((item) => {
    const fraction = item.percentage / 100;
    const segment = {
      ...item,
      fraction,
      strokeDasharray: `${DONUT_CIRCUMFERENCE * fraction} ${DONUT_CIRCUMFERENCE}`,
      strokeDashoffset: DONUT_CIRCUMFERENCE * (1 - cumulativeFraction),
    };
    cumulativeFraction += fraction;
    return segment;
  });
}

function getSegmentLabelPoint(segments, segmentKey, centerX, centerY, radius) {
  const index = segments.findIndex((item) => item.key === segmentKey);
  const angleBefore = segments
    .slice(0, index)
    .reduce((sum, item) => sum + item.fraction * 360, -90);
  const midAngle = angleBefore + segments[index].fraction * 180;
  const radians = (midAngle * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function getLabelTextStyle(name, totalSegments = 0) {
  if (totalSegments >= 12) {
    if (name.length > 12) {
      return { fontSize: 10, text: `${name.slice(0, 10)}..` };
    }

    return { fontSize: 10, text: name };
  }

  if (totalSegments >= 10) {
    if (name.length > 14) {
      return { fontSize: 11, text: `${name.slice(0, 11)}..` };
    }

    return { fontSize: 11, text: name };
  }

  if (totalSegments >= 7) {
    if (name.length > 15) {
      return { fontSize: 12, text: `${name.slice(0, 12)}..` };
    }

    return { fontSize: 12, text: name };
  }

  if (name.length > 18) {
    return { fontSize: 12, text: `${name.slice(0, 15)}...` };
  }

  if (name.length > 13) {
    return { fontSize: 13, text: name };
  }

  return { fontSize: 14, text: name };
}

function groupSegmentsBySide(segments) {
  const orderedSegments = [...segments].sort(
    (leftSegment, rightSegment) =>
      Math.sin((getSegmentMidAngle(segments, leftSegment.key) * Math.PI) / 180) -
      Math.sin((getSegmentMidAngle(segments, rightSegment.key) * Math.PI) / 180)
  );

  const left = orderedSegments.filter(
    (segment) => Math.cos((getSegmentMidAngle(segments, segment.key) * Math.PI) / 180) < 0
  );
  const right = orderedSegments.filter(
    (segment) => Math.cos((getSegmentMidAngle(segments, segment.key) * Math.PI) / 180) >= 0
  );

  const moveClosestToCenter = (from, to) => {
    if (!from.length) {
      return;
    }

    const sourceIndex = from.reduce((bestIndex, segment, index) => {
      const currentDistance = Math.abs(
        Math.sin((getSegmentMidAngle(segments, segment.key) * Math.PI) / 180)
      );
      const bestDistance = Math.abs(
        Math.sin((getSegmentMidAngle(segments, from[bestIndex].key) * Math.PI) / 180)
      );

      return currentDistance < bestDistance ? index : bestIndex;
    }, 0);

    to.push(from[sourceIndex]);
    from.splice(sourceIndex, 1);
  };

  while (left.length - right.length > 1) {
    moveClosestToCenter(left, right);
  }

  while (right.length - left.length > 1) {
    moveClosestToCenter(right, left);
  }

  left.sort(
    (leftSegment, rightSegment) =>
      Math.sin((getSegmentMidAngle(segments, leftSegment.key) * Math.PI) / 180) -
      Math.sin((getSegmentMidAngle(segments, rightSegment.key) * Math.PI) / 180)
  );
  right.sort(
    (leftSegment, rightSegment) =>
      Math.sin((getSegmentMidAngle(segments, leftSegment.key) * Math.PI) / 180) -
      Math.sin((getSegmentMidAngle(segments, rightSegment.key) * Math.PI) / 180)
  );

  return { left, right };
}

function getSegmentMidAngle(segments, segmentKey) {
  const index = segments.findIndex((item) => item.key === segmentKey);
  const angleBefore = segments
    .slice(0, index)
    .reduce((sum, item) => sum + item.fraction * 360, -90);
  return angleBefore + segments[index].fraction * 180;
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function createDonutArcPath(centerX, centerY, outerRadius, innerRadius, startAngle, endAngle) {
  const clampedEndAngle = endAngle - startAngle >= 359.999 ? startAngle + 359.999 : endAngle;
  const startOuter = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const endOuter = polarToCartesian(centerX, centerY, outerRadius, clampedEndAngle);
  const startInner = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const endInner = polarToCartesian(centerX, centerY, innerRadius, clampedEndAngle);
  const largeArcFlag = clampedEndAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

const DEFAULT_CHART_COLORS = ["#6db2ec", "#eb727b", "#54b7b4", "#a58374", "#8d7bf7", "#ffb36b"];

function createLinePoints(values) {
  return values.map((point) => `${point.x},${point.y}`).join(" ");
}

function createSmoothLinePath(points) {
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
}

function BarChart({ data, chartWidth, maxValue, slotWidth }) {
  const innerHeight = CHART_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING;
  const barWidth = Math.max(8, Math.min(16, slotWidth * 0.24));

  return (
    <Svg width={chartWidth} height={CHART_HEIGHT}>
      {[0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = CHART_TOP_PADDING + innerHeight * ratio;
        return <Line key={ratio} x1="0" y1={y} x2={chartWidth} y2={y} stroke="#4a332d" strokeWidth="1" />;
      })}

      {data.map((item, index) => {
        const xCenter = slotWidth * index + slotWidth / 2;
        const expenseHeight = maxValue > 0 ? (item.expense / maxValue) * innerHeight : 0;
        const incomeHeight = maxValue > 0 ? (item.income / maxValue) * innerHeight : 0;

        return (
          <G key={item.key}>
            <Rect
              x={xCenter - barWidth - 2}
              y={CHART_TOP_PADDING + innerHeight - expenseHeight}
              width={barWidth}
              height={Math.max(expenseHeight, item.expense > 0 ? 4 : 0)}
              rx="4"
              fill="#f46872"
            />
            <Rect
              x={xCenter + 2}
              y={CHART_TOP_PADDING + innerHeight - incomeHeight}
              width={barWidth}
              height={Math.max(incomeHeight, item.income > 0 ? 4 : 0)}
              rx="4"
              fill="#7dd56c"
            />
          </G>
        );
      })}
    </Svg>
  );
}

function LineChart({ data, chartWidth, maxValue, slotWidth }) {
  const innerHeight = CHART_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING;
  const baselineY = CHART_TOP_PADDING + innerHeight;
  const incomePlotPoints = data.map((item, index) => ({
    x: slotWidth * index + slotWidth / 2,
    y: baselineY - (maxValue > 0 ? (item.income / maxValue) * innerHeight : 0),
  }));
  const expensePlotPoints = data.map((item, index) => ({
    x: slotWidth * index + slotWidth / 2,
    y: baselineY - (maxValue > 0 ? (item.expense / maxValue) * innerHeight : 0),
  }));
  const incomePoints = createLinePoints(incomePlotPoints);
  const expensePoints = createLinePoints(expensePlotPoints);
  const incomeSmoothPath = createSmoothLinePath(incomePlotPoints);
  const expenseSmoothPath = createSmoothLinePath(expensePlotPoints);

  return (
    <Svg width={chartWidth} height={CHART_HEIGHT}>
      {[0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = CHART_TOP_PADDING + innerHeight * ratio;
        return <Line key={ratio} x1="0" y1={y} x2={chartWidth} y2={y} stroke="#4a332d" strokeWidth="1" />;
      })}

      {incomePoints ? (
        <>
          <Path
            d={incomeSmoothPath}
            fill="none"
            stroke="#7dd56c"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity="0.88"
          />
          {incomePlotPoints.map((point, index) => {
            const item = data[index];
            if (item.income <= 0) {
              return null;
            }

            return <Circle key={`${item.key}-income`} cx={point.x} cy={point.y} r="3" fill="#7dd56c" />;
          })}
        </>
      ) : null}

      {expensePoints ? (
        <>
          <Path
            d={expenseSmoothPath}
            fill="none"
            stroke="#f46872"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity="0.88"
          />
          {expensePlotPoints.map((point, index) => {
            const item = data[index];
            if (item.expense <= 0) {
              return null;
            }

            return <Circle key={`${item.key}-expense`} cx={point.x} cy={point.y} r="3" fill="#f46872" />;
          })}
        </>
      ) : null}
    </Svg>
  );
}

function DonutChart({ items, total, selectedType }) {
  const segments = buildDonutSegments(items);
  const { left, right } = groupSegmentsBySide(segments);
  const donutCanvasHeight = Math.max(DONUT_CANVAS_MIN_HEIGHT + 40, Math.max(left.length, right.length) * 28 + 90);
  const centerX = DONUT_CANVAS_WIDTH / 2;
  const centerY = donutCanvasHeight / 2;
  const LOCAL_DONUT_RADIUS = 74;
  const outerRadius = LOCAL_DONUT_RADIUS + 4;
  const innerRadius = LOCAL_DONUT_RADIUS - 30;
  const gapAngle = 0;

  if (!segments.length || total <= 0) {
    return (
      <View style={styles.emptyDonut}>
        <MaterialCommunityIcons name="chart-donut-variant" size={54} color="#8c7066" />
        <Text style={styles.emptyDonutText}>No {selectedType} data</Text>
      </View>
    );
  }

  return (
    <View style={styles.donutWrap}>
      <Svg width={DONUT_CANVAS_WIDTH} height={donutCanvasHeight}>
        {segments.length === 1 ? (
          <Circle cx={centerX} cy={centerY} r={outerRadius} fill={segments[0].color} />
        ) : (
          segments.map((segment, index) => {
            const rawStartAngle =
              segments.slice(0, index).reduce((sum, item) => sum + item.fraction * 360, 0);
            const rawEndAngle = rawStartAngle + segment.fraction * 360;
            const startAngle = rawStartAngle + gapAngle / 2;
            const endAngle = rawEndAngle - gapAngle / 2;

            return (
              <Path
                key={segment.key}
                d={createDonutArcPath(centerX, centerY, outerRadius, innerRadius, startAngle, endAngle)}
                fill={segment.color}
              />
            );
          })
        )}

        <Circle cx={centerX} cy={centerY} r={innerRadius - 2} fill="#382721" />

        {(() => {
          const labels = segments.map((segment, index) => {
            const angleBefore = segments.slice(0, index).reduce((sum, item) => sum + item.fraction * 360, -90);
            const trueMidAngle = angleBefore + segment.fraction * 180;
            return { segment, trueMidAngle, renderAngle: trueMidAngle };
          });

          const minAngleGap = labels.length > 8 ? 16 : 22;
          for (let iter = 0; iter < 50; iter++) {
            for (let i = 0; i < labels.length - 1; i++) {
              for (let j = i + 1; j < labels.length; j++) {
                let diff = labels[j].renderAngle - labels[i].renderAngle;
                if (Math.abs(diff) < minAngleGap) {
                  const push = (minAngleGap - Math.abs(diff)) / 2;
                  if (diff > 0) {
                     labels[i].renderAngle -= push;
                     labels[j].renderAngle += push;
                  } else {
                     labels[i].renderAngle += push;
                     labels[j].renderAngle -= push;
                  }
                }
              }
            }
          }

          const boxes = labels.map((label) => {
            const trueRadians = (label.trueMidAngle * Math.PI) / 180;
            const renderRadians = (label.renderAngle * Math.PI) / 180;

            const point = {
              x: centerX + (outerRadius + 3) * Math.cos(trueRadians),
              y: centerY + (outerRadius + 3) * Math.sin(trueRadians),
            };

            const labelRadius = outerRadius + 28;
            let textX = centerX + labelRadius * Math.cos(renderRadians);
            let textY = centerY + labelRadius * Math.sin(renderRadians);

            const isTopOrBottom = Math.abs(Math.sin(renderRadians)) > 0.85;
            let textAnchor = "middle";
            if (!isTopOrBottom) {
              textAnchor = Math.cos(renderRadians) >= 0 ? "start" : "end";
            }
            if (textAnchor === "start") textX += 6;
            if (textAnchor === "end") textX -= 6;
            
            return { ...label, point, textX, textY, textAnchor };
          });
          
          const resolveOverlap = (overlapBoxes) => {
            const PAD_Y = 34;
            const PAD_X = 72; 
            for (let iter = 0; iter < 500; iter++) {
              let moved = false;
              for (let i = 0; i < overlapBoxes.length; i++) {
                for (let j = i + 1; j < overlapBoxes.length; j++) {
                  const b1 = overlapBoxes[i];
                  const b2 = overlapBoxes[j];
                  
                  // Calculate TRUE visual center of text
                  const cx1 = b1.textAnchor === "start" ? b1.textX + 36 : b1.textAnchor === "end" ? b1.textX - 36 : b1.textX;
                  const cx2 = b2.textAnchor === "start" ? b2.textX + 36 : b2.textAnchor === "end" ? b2.textX - 36 : b2.textX;
                  const cy1 = b1.textY;
                  const cy2 = b2.textY;

                  const dy = cy1 - cy2;
                  const dx = cx1 - cx2;
                  
                  if (Math.abs(dy) < PAD_Y && Math.abs(dx) < PAD_X) {
                    moved = true;
                    const overlapY = PAD_Y - Math.abs(dy);
                    const overlapX = PAD_X - Math.abs(dx);
                    
                    if (overlapY < overlapX * 0.5) {
                      const pushY = overlapY / 2;
                      if (dy < 0) { b1.textY -= pushY; b2.textY += pushY; }
                      else { b1.textY += pushY; b2.textY -= pushY; }
                    } else {
                      const pushX = overlapX / 2;
                      if (dx < 0) { b1.textX -= pushX; b2.textX += pushX; }
                      else { b1.textX += pushX; b2.textX -= pushX; }
                    }
                  }
                }
              }
              if (!moved) break;
            }
          };
          
          resolveOverlap(boxes);

          boxes.forEach((box) => {
             box.textY = Math.max(16, Math.min(donutCanvasHeight - 20, box.textY));
             box.textX = Math.max(30, Math.min(DONUT_CANVAS_WIDTH - 30, box.textX));
          });
          
          return boxes.map(({ segment, point, textX, textY, textAnchor }) => {

            const nameStyle = getLabelTextStyle(segment.name, segments.length);
            const percentFontSize = segments.length >= 12 ? "10" : segments.length >= 9 ? "11" : "13";
            const connectorEndX = textAnchor === "start" ? textX - 4 : textAnchor === "end" ? textX + 4 : textX;

            return (
              <G key={`${segment.key}-label`}>
                <Path
                  d={`M ${point.x} ${point.y} Q ${point.x + (connectorEndX - point.x) / 2} ${point.y} ${connectorEndX} ${textY - 3}`}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="1.5"
                />
                <SvgText
                  x={textX}
                  y={textY - 7}
                  fill="#ffffff"
                  fontSize={nameStyle.fontSize}
                  fontWeight="700"
                  textAnchor={textAnchor}
                >
                  {nameStyle.text}
                </SvgText>
                <SvgText
                  x={textX}
                  y={textY + 8}
                  fill="#ffffff"
                  fontSize={percentFontSize}
                  fontWeight="700"
                  textAnchor={textAnchor}
                >
                  {`${Math.round(segment.percentage)}%`}
                </SvgText>
              </G>
            );
          });
        })()}
      </Svg>

    </View>
  );
}

function ReportFeatureCard({ item }) {
  return (
    <Pressable style={styles.featureCard}>
      <View style={styles.featureIconWrap}>
        <MaterialCommunityIcons name={item.icon} size={22} color="#f7b8a4" />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{item.title}</Text>
        <Text style={styles.featureDescription}>{item.description}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#8f756b" />
    </Pressable>
  );
}

function FilterSheet({
  visible,
  draftAccountIds,
  draftCategoryIds,
  draftEndDate,
  draftRange,
  draftStartDate,
  accounts,
  categories,
  onApply,
  onClose,
  onOpenDatePicker,
  onToggleAccount,
  onToggleCategory,
  onSelectRange,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Filter</Text>

          <View style={styles.modalDateRow}>
            <Pressable style={styles.modalDateCard} onPress={() => onOpenDatePicker("start")}>
              <View style={styles.modalDateLeft}>
                <Feather name="calendar" size={18} color="#f4dfd5" />
                <Text style={styles.modalDateText}>{formatDateLabel(draftStartDate)}</Text>
              </View>
            </Pressable>

            <Pressable style={styles.modalDateCard} onPress={() => onOpenDatePicker("end")}>
              <View style={styles.modalDateLeft}>
                <Feather name="calendar" size={18} color="#f4dfd5" />
                <Text style={styles.modalDateText}>{formatDateLabel(draftEndDate)}</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.rangeRow}>
            {RANGE_OPTIONS.map((option) => {
              const isActive = option.key === draftRange;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                  onPress={() => onSelectRange(option.key)}
                >
                  <Text style={[styles.rangeChipText, isActive && styles.rangeChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.modalSectionTitle}>Select account</Text>
          <View style={styles.modalChipWrap}>
            {accounts.map((account) => {
              const isActive = draftAccountIds.includes(account.id);
              return (
                <Pressable
                  key={account.id}
                  style={[styles.modalChip, isActive && styles.modalChipActive]}
                  onPress={() => onToggleAccount(account.id)}
                >
                  <MaterialCommunityIcons
                    name={account.type === "cash" ? "cash" : "bank-outline"}
                    size={16}
                    color={isActive ? "#20120d" : account.color || "#61a6ff"}
                  />
                  <Text style={[styles.modalChipText, isActive && styles.modalChipTextActive]}>
                    {account.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.modalSectionTitle}>Select category</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalCategoryWrap}>
            {categories.map((category) => {
              const isActive = draftCategoryIds.includes(category.id);
              return (
                <Pressable
                  key={category.id}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => onToggleCategory(category.id)}
                >
                  <MaterialCommunityIcons
                    name={category.icon || "tag"}
                    size={16}
                    color={isActive ? "#20120d" : category.color || "#f6b9a5"}
                  />
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.applyButton} onPress={onApply}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ReportsScreen() {
  const currentYear = new Date().getFullYear();
  const currentBounds = getYearBounds(currentYear);

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [selectedType, setSelectedType] = useState("expense");
  const [filterVisible, setFilterVisible] = useState(false);
  const [pickerField, setPickerField] = useState(null);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(null);

  const [appliedRange, setAppliedRange] = useState("monthly");
  const [appliedAccountIds, setAppliedAccountIds] = useState([]);
  const [appliedCategoryIds, setAppliedCategoryIds] = useState([]);
  const [appliedStartDate, setAppliedStartDate] = useState(currentBounds.start);
  const [appliedEndDate, setAppliedEndDate] = useState(currentBounds.end);

  const [draftRange, setDraftRange] = useState("monthly");
  const [draftAccountIds, setDraftAccountIds] = useState([]);
  const [draftCategoryIds, setDraftCategoryIds] = useState([]);
  const [draftStartDate, setDraftStartDate] = useState(currentBounds.start);
  const [draftEndDate, setDraftEndDate] = useState(currentBounds.end);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
      return;
    }

    const [{ data: txData, error: txError }, { data: accountData }, { data: categoryData }] = await Promise.all([
      supabase
        .from("transactions")
        .select(`
          *,
          categories(id,name,icon,color,type),
          accounts(name),
          to_account:to_account_id(name)
        `)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("accounts").select("id,name,type,color").eq("user_id", user.id).order("created_at"),
      supabase.from("categories").select("id,name,icon,color,type").eq("user_id", user.id).order("name"),
    ]);

    if (txError) {
      console.warn("Could not load reports:", txError.message);
      setTransactions([]);
      return;
    }

    setTransactions(txData || []);
    setAccounts(accountData || []);
    setCategories(categoryData || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const toggleDraftSelection = (value, list, setter) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (
        transaction.date < formatDateKey(appliedStartDate) ||
        transaction.date > formatDateKey(appliedEndDate)
      ) {
        return false;
      }

      if (appliedAccountIds.length && !appliedAccountIds.includes(transaction.account_id)) {
        return false;
      }

      if (appliedCategoryIds.length && !appliedCategoryIds.includes(transaction.category_id)) {
        return false;
      }

      return true;
    });
  }, [appliedAccountIds, appliedCategoryIds, appliedEndDate, appliedStartDate, transactions]);

  const availablePeriods = useMemo(
    () => buildGroupedSeries(filteredTransactions, appliedRange).sort((left, right) => right.date - left.date),
    [appliedRange, filteredTransactions]
  );

  const headerPeriods = useMemo(() => {
    if (availablePeriods.length) {
      return availablePeriods;
    }

    return [
      {
        key: `fallback-${appliedRange}-${formatDateKey(appliedStartDate)}`,
        label: buildGroupLabel(appliedStartDate, appliedRange),
        date: appliedStartDate,
      },
    ];
  }, [appliedRange, appliedStartDate, availablePeriods]);

  useEffect(() => {
    setSelectedPeriodKey(null);
  }, [appliedRange, appliedStartDate, appliedEndDate]);

  useEffect(() => {
    if (!headerPeriods.length) {
      setSelectedPeriodKey(null);
      return;
    }

    const stillExists = headerPeriods.some((period) => period.key === selectedPeriodKey);
    if (!stillExists) {
      setSelectedPeriodKey(headerPeriods[0].key);
    }
  }, [headerPeriods, selectedPeriodKey]);

  const selectedPeriod = useMemo(
    () => headerPeriods.find((period) => period.key === selectedPeriodKey) || headerPeriods[0] || null,
    [headerPeriods, selectedPeriodKey]
  );

  const periodTransactions = useMemo(() => {
    if (!selectedPeriod) {
      return filteredTransactions;
    }

    const bounds = getGroupBounds(selectedPeriod.date, appliedRange);
    return filterTransactionsByBounds(filteredTransactions, bounds.start, bounds.end);
  }, [appliedRange, filteredTransactions, selectedPeriod]);

  const selectedPeriodBounds = useMemo(() => {
    if (!selectedPeriod) {
      return { start: appliedStartDate, end: appliedEndDate };
    }

    return getGroupBounds(selectedPeriod.date, appliedRange);
  }, [appliedEndDate, appliedRange, appliedStartDate, selectedPeriod]);

  const annualSummary = useMemo(
    () =>
      periodTransactions.reduce(
        (summary, transaction) => {
          const amount = Number(transaction.amount || 0);

          if (transaction.type === "income") {
            summary.income += amount;
          } else if (transaction.type === "expense") {
            summary.expense += amount;
          }

          return summary;
        },
        { income: 0, expense: 0 }
      ),
    [periodTransactions]
  );

  const groupedSeries = useMemo(
    () =>
      buildChartSeriesForRange(
        periodTransactions,
        appliedRange,
        selectedPeriodBounds.start,
        selectedPeriodBounds.end
      ),
    [appliedRange, periodTransactions, selectedPeriodBounds.end, selectedPeriodBounds.start]
  );

  const breakdownItems = useMemo(
    () => buildCategoryBreakdown(periodTransactions, selectedType),
    [periodTransactions, selectedType]
  );
  const chartBreakdownItems = breakdownItems;

  const selectedTypeTotal = breakdownItems.reduce((sum, item) => sum + item.total, 0);
  const rawMaxChartValue = Math.max(...groupedSeries.flatMap((item) => [item.income, item.expense]), 0);
  const maxChartValue = getNiceChartMax(rawMaxChartValue);
  const chartTicks = getChartTicks(maxChartValue);
  const chartSlotWidth = appliedRange === "daily" ? 74 : appliedRange === "monthly" ? 26 : appliedRange === "yearly" ? 38 : 42;
  const chartWidth = Math.max(CARD_WIDTH - 36, groupedSeries.length * chartSlotWidth);

  const openFilters = () => {
    setDraftRange(appliedRange);
    setDraftAccountIds(appliedAccountIds);
    setDraftCategoryIds(appliedCategoryIds);
    setDraftStartDate(appliedStartDate);
    setDraftEndDate(appliedEndDate);
    setFilterVisible(true);
  };

  const applyFilters = () => {
    const nextStart = draftStartDate <= draftEndDate ? draftStartDate : draftEndDate;
    const nextEnd = draftEndDate >= draftStartDate ? draftEndDate : draftStartDate;

    setAppliedRange(draftRange);
    setAppliedAccountIds(draftAccountIds);
    setAppliedCategoryIds(draftCategoryIds);
    setAppliedStartDate(nextStart);
    setAppliedEndDate(nextEnd);
    setFilterVisible(false);
  };

  const handleDateChange = (_, selectedDate) => {
    setPickerField(null);
    if (!selectedDate) {
      return;
    }

    if (pickerField === "start") {
      setDraftStartDate(selectedDate);
    } else if (pickerField === "end") {
      setDraftEndDate(selectedDate);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.yearRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodScroll}>
            {headerPeriods.map((period) => {
              const isActive = period.key === selectedPeriod?.key;

              return (
                <Pressable
                  key={period.key}
                  style={[styles.yearChip, isActive && styles.yearChipActive]}
                  onPress={() => setSelectedPeriodKey(period.key)}
                >
                  <Text style={[styles.yearChipText, isActive && styles.yearChipTextActive]}>
                    {period.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total balance</Text>
          <Text style={styles.balanceValue}>
            {formatCurrency(annualSummary.income - annualSummary.expense)}
          </Text>

          <View style={styles.balanceStats}>
            <View style={[styles.balanceStat, styles.balanceStatIncome]}>
              <Text style={styles.balanceStatTitle}>Income</Text>
              <Text style={[styles.balanceStatValue, styles.incomeText]}>
                {formatCurrency(annualSummary.income)}
              </Text>
            </View>

            <View style={[styles.balanceStat, styles.balanceStatExpense]}>
              <Text style={[styles.balanceStatTitle, styles.expenseText]}>Expense</Text>
              <Text style={[styles.balanceStatValue, styles.expenseText]}>
                {formatCurrency(annualSummary.expense)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.cardTitle}>Reports</Text>
              <Text style={styles.chartSubTitle}>
                {selectedPeriod?.label || "No period"} • {appliedRange}
              </Text>
            </View>

            <View style={styles.viewToggle}>
              <Pressable
                style={[styles.viewButton, chartType === "bar" && styles.viewButtonActive]}
                onPress={() => setChartType("bar")}
              >
                <MaterialCommunityIcons
                  name="chart-bar"
                  size={20}
                  color={chartType === "bar" ? "#20120d" : "#e4cfc4"}
                />
              </Pressable>
              <Pressable
                style={[styles.viewButton, chartType === "line" && styles.viewButtonActive]}
                onPress={() => setChartType("line")}
              >
                <MaterialCommunityIcons
                  name="chart-timeline-variant"
                  size={20}
                  color={chartType === "line" ? "#20120d" : "#e4cfc4"}
                />
              </Pressable>
            </View>
          </View>

          {groupedSeries.length === 0 ? (
            <View style={styles.emptyChart}>
              <MaterialCommunityIcons name="chart-box-outline" size={40} color="#8f756b" />
              <Text style={styles.emptyChartText}>No transactions match this filter.</Text>
            </View>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
                <View>
                  <View style={styles.chartYAxis}>
                    {chartTicks.map((value, index) => (
                      <Text key={`${value}-${index}`} style={styles.axisText}>
                        {formatShortCurrency(value)}
                      </Text>
                    ))}
                  </View>
                  <View style={styles.chartSvgWrap}>
                    {chartType === "bar" ? (
                      <BarChart
                        data={groupedSeries}
                        chartWidth={chartWidth}
                        maxValue={maxChartValue}
                        slotWidth={chartSlotWidth}
                      />
                    ) : (
                      <LineChart
                        data={groupedSeries}
                        chartWidth={chartWidth}
                        maxValue={maxChartValue}
                        slotWidth={chartSlotWidth}
                      />
                    )}
                  </View>

                  <View style={[styles.chartLabelsRow, { width: chartWidth }]}>
                    {groupedSeries.map((item) => (
                      <Text key={item.key} style={[styles.chartLabel, { width: chartSlotWidth }]}>
                        {item.label}
                      </Text>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.expenseBar]} />
                  <Text style={styles.legendText}>Expense</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.incomeBar]} />
                  <Text style={styles.legendText}>Income</Text>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={styles.segmentShell}>
          {TYPE_OPTIONS.map((type) => {
            const isActive = selectedType === type;
            return (
              <Pressable
                key={type}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                onPress={() => setSelectedType(type)}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {type === "income" ? "Income" : "Expense"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <Text style={styles.breakdownTitle}>
              {selectedType === "income" ? "Income" : "Expense"}
            </Text>
            <Text style={styles.breakdownAmount}>{formatCurrency(selectedTypeTotal)}</Text>
          </View>

          <DonutChart items={chartBreakdownItems} total={selectedTypeTotal} selectedType={selectedType} />

          {chartBreakdownItems.map((item) => (
            <View key={`${item.key}-card`} style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <View style={[styles.breakdownIcon, { backgroundColor: `${item.color}22` }]}>
                  <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={styles.breakdownCopy}>
                  <Text style={styles.breakdownName}>
                    {item.name} ({item.percentage.toFixed(1)}%)
                  </Text>
                  <Text style={styles.breakdownCount}>{item.count} transactions</Text>
                </View>
              </View>
              <View style={styles.breakdownRight}>
                <Text style={styles.breakdownValue}>{formatCurrency(item.total)}</Text>
                <Feather name="chevron-right" size={18} color="#92766d" />
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.financialReportsTitle}>Financial Reports</Text>
        {SECTION_CARDS.map((item) => (
          <ReportFeatureCard key={item.key} item={item} />
        ))}
      </ScrollView>

      <Pressable style={styles.floatingFilter} onPress={openFilters}>
        <Feather name="filter" size={22} color="#23120d" />
      </Pressable>

      <FilterSheet
        visible={filterVisible}
        draftAccountIds={draftAccountIds}
        draftCategoryIds={draftCategoryIds}
        draftEndDate={draftEndDate}
        draftRange={draftRange}
        draftStartDate={draftStartDate}
        accounts={accounts}
        categories={categories}
        onApply={applyFilters}
        onClose={() => setFilterVisible(false)}
        onOpenDatePicker={setPickerField}
        onToggleAccount={(accountId) =>
          toggleDraftSelection(accountId, draftAccountIds, setDraftAccountIds)
        }
        onToggleCategory={(categoryId) =>
          toggleDraftSelection(categoryId, draftCategoryIds, setDraftCategoryIds)
        }
        onSelectRange={setDraftRange}
      />

      {pickerField ? (
        <DateTimePicker
          value={pickerField === "start" ? draftStartDate : draftEndDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1f110d",
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 130,
  },
  yearRow: {
    marginBottom: 10,
  },
  periodScroll: {
    paddingRight: 6,
    gap: 6,
  },
  yearChip: {
    minWidth: 104,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#6b681c",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  yearChipActive: {
    backgroundColor: "#ffb69d",
  },
  yearChipText: {
    color: "#f7ebdd",
    fontSize: 13,
    fontWeight: "800",
  },
  yearChipTextActive: {
    color: "#2b1914",
  },
  balanceCard: {
    width: CARD_WIDTH,
    backgroundColor: "#473631",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  balanceLabel: {
    color: "#e9d6ce",
    fontSize: 15,
    fontWeight: "700",
  },
  balanceValue: {
    color: "#fff2ed",
    fontSize: 38,
    fontWeight: "900",
    marginTop: 6,
  },
  balanceStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  balanceStat: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  balanceStatIncome: {
    backgroundColor: "#324229",
    borderColor: "#4d6a3c",
  },
  balanceStatExpense: {
    backgroundColor: "#4d312f",
    borderColor: "#6e4341",
  },
  balanceStatTitle: {
    color: "#cde2c4",
    fontSize: 14,
    fontWeight: "700",
  },
  balanceStatValue: {
    fontSize: 19,
    fontWeight: "900",
    marginTop: 4,
  },
  incomeText: {
    color: "#82d76e",
  },
  expenseText: {
    color: "#f46f74",
  },
  chartCard: {
    backgroundColor: "#382721",
    borderRadius: 26,
    padding: 18,
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  cardTitle: {
    color: "#f4e5de",
    fontSize: 18,
    fontWeight: "800",
  },
  chartSubTitle: {
    color: "#bca59b",
    fontSize: 12,
    marginTop: 4,
  },
  viewToggle: {
    flexDirection: "row",
    gap: 8,
  },
  viewButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#241510",
    alignItems: "center",
    justifyContent: "center",
  },
  viewButtonActive: {
    backgroundColor: "#ffb69d",
  },
  chartScroll: {
    paddingBottom: 6,
  },
  chartYAxis: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 28,
    justifyContent: "space-between",
    zIndex: 2,
  },
  chartSvgWrap: {
    marginLeft: 52,
  },
  axisText: {
    color: "#9c857b",
    fontSize: 11,
    fontWeight: "700",
    width: 44,
  },
  chartLabelsRow: {
    flexDirection: "row",
    marginLeft: 52,
    marginTop: 6,
    alignItems: "flex-start",
  },
  chartLabel: {
    color: "#bda79c",
    fontSize: 10,
    textAlign: "center",
  },
  emptyChart: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
  },
  emptyChartText: {
    color: "#a98f84",
    fontSize: 14,
    marginTop: 10,
  },
  legendRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: "#d4beb4",
    fontSize: 13,
    fontWeight: "700",
  },
  expenseBar: {
    backgroundColor: "#f46872",
  },
  incomeBar: {
    backgroundColor: "#7dd56c",
  },
  segmentShell: {
    flexDirection: "row",
    backgroundColor: "#2a1813",
    borderRadius: 28,
    padding: 6,
    marginBottom: 18,
  },
  segmentButton: {
    flex: 1,
    height: 54,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#ffb69d",
  },
  segmentText: {
    color: "#ead8d0",
    fontSize: 17,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#291610",
  },
  breakdownCard: {
    backgroundColor: "#382721",
    borderRadius: 26,
    padding: 18,
    marginBottom: 20,
  },
  breakdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  breakdownTitle: {
    color: "#f4e6dd",
    fontSize: 18,
    fontWeight: "800",
  },
  breakdownAmount: {
    color: "#f7d6c5",
    fontSize: 18,
    fontWeight: "900",
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 32,
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterLabel: {
    color: "#e4cec3",
    fontSize: 14,
    fontWeight: "700",
  },
  donutCenterAmount: {
    color: "#fff4ee",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
  },
  chartCaption: {
    textAlign: "center",
    color: "#e2cfc4",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 14,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2f1d18",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  breakdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  breakdownIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  breakdownCopy: {
    flex: 1,
  },
  breakdownName: {
    color: "#f6e4dc",
    fontSize: 15,
    fontWeight: "700",
  },
  breakdownCount: {
    color: "#baa198",
    fontSize: 13,
    marginTop: 4,
  },
  breakdownRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownValue: {
    color: "#f7d8ca",
    fontSize: 15,
    fontWeight: "800",
  },
  financialReportsTitle: {
    color: "#f3dfd6",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 14,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#251612",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3f2a24",
    padding: 16,
    marginBottom: 12,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#3a211a",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureCopy: {
    flex: 1,
    marginRight: 12,
  },
  featureTitle: {
    color: "#f4e2d9",
    fontSize: 18,
    fontWeight: "800",
  },
  featureDescription: {
    color: "#beaaa1",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  floatingFilter: {
    position: "absolute",
    right: 20,
    bottom: 96,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ffb69d",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: "#2a1a15",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 28,
  },
  modalTitle: {
    color: "#f5e3db",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 18,
  },
  modalDateRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  modalDateCard: {
    flex: 1,
    backgroundColor: "#4a3932",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  modalDateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalDateText: {
    color: "#f5dfd4",
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  rangeChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6b681c",
    borderRadius: 16,
    paddingVertical: 12,
  },
  rangeChipActive: {
    backgroundColor: "#ffb69d",
  },
  rangeChipText: {
    color: "#f7ebdd",
    fontSize: 14,
    fontWeight: "700",
  },
  rangeChipTextActive: {
    color: "#291610",
  },
  modalSectionTitle: {
    color: "#f0ded5",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  modalChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  modalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#33211d",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalChipActive: {
    backgroundColor: "#ffb69d",
  },
  modalChipText: {
    color: "#ead6cc",
    fontSize: 14,
    fontWeight: "700",
  },
  modalChipTextActive: {
    color: "#291610",
  },
  modalCategoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 18,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#241611",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: "#ffb69d",
  },
  categoryChipText: {
    color: "#ead8cf",
    fontSize: 14,
    fontWeight: "700",
  },
  categoryChipTextActive: {
    color: "#291610",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cancelText: {
    color: "#f0c8b7",
    fontSize: 18,
    fontWeight: "700",
  },
  applyButton: {
    minWidth: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7f5849",
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  applyText: {
    color: "#fff4ed",
    fontSize: 18,
    fontWeight: "800",
  },
  emptyDonut: {
    alignItems: "center",
    justifyContent: "center",
    height: 220,
  },
  emptyDonutText: {
    color: "#a88e84",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
  },
});
