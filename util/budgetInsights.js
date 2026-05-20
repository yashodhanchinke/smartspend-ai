import { supabase } from "../lib/supabase";

export function parseStoredDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

export function formatDateKey(value) {
  const date = parseStoredDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStartOfDay(value) {
  const date = parseStoredDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfDay(value) {
  const date = getStartOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getStartOfWeek(value) {
  const date = getStartOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getEndOfWeek(value) {
  const date = getStartOfWeek(value);
  date.setDate(date.getDate() + 6);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getStartOfMonth(value) {
  const date = parseStoredDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(value) {
  const date = parseStoredDate(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getStartOfYear(value) {
  const date = parseStoredDate(value);
  return new Date(date.getFullYear(), 0, 1);
}

function getEndOfYear(value) {
  const date = parseStoredDate(value);
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function getBudgetPeriodRange(period, referenceDate = new Date()) {
  if (period === "daily") {
    return { start: getStartOfDay(referenceDate), end: getEndOfDay(referenceDate) };
  }

  if (period === "weekly") {
    return { start: getStartOfWeek(referenceDate), end: getEndOfWeek(referenceDate) };
  }

  if (period === "yearly") {
    return { start: getStartOfYear(referenceDate), end: getEndOfYear(referenceDate) };
  }

  return { start: getStartOfMonth(referenceDate), end: getEndOfMonth(referenceDate) };
}

function isDateWithinRange(value, start, end) {
  const date = parseStoredDate(value);
  return date >= start && date <= end;
}

function getBudgetCategoryIds(budget) {
  const linkedCategoryIds = (budget?.budget_categories || [])
    .map((entry) => entry.category_id || entry.categories?.id)
    .filter(Boolean);

  return [...new Set([budget?.category_id, ...linkedCategoryIds].filter(Boolean))];
}

function getBudgetTone(progress) {
  if (progress >= 1) return "critical";
  if (progress >= 0.9) return "warning";
  if (progress >= 0.75) return "attention";
  return "positive";
}

function getTonePriority(tone) {
  if (tone === "critical") return 4;
  if (tone === "warning") return 3;
  if (tone === "attention") return 2;
  return 1;
}

function getBudgetWindowLabel(period) {
  if (period === "daily") return "today";
  if (period === "weekly") return "this week";
  if (period === "yearly") return "this year";
  return "this month";
}

function getBudgetPeriodTitle(period) {
  if (period === "daily") return "Daily";
  if (period === "weekly") return "Weekly";
  if (period === "yearly") return "Yearly";
  return "Monthly";
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

function formatPercent(progress) {
  return `${Math.round(Math.max(progress, 0) * 100)}%`;
}

function createCategoryMap(categories) {
  return Object.fromEntries((categories || []).map((category) => [category.id, category]));
}

export async function loadBudgetNotificationContext(userId) {
  if (!userId) {
    return { budgets: [], categories: [], transactions: [] };
  }

  const [budgetsResult, categoriesResult, transactionsResult] = await Promise.all([
    supabase
      .from("budgets")
      .select(`
        id,
        name,
        amount,
        spent,
        period,
        color,
        mode,
        budget_type,
        notes,
        category_id,
        budget_categories (
          category_id,
          categories (
            id,
            name,
            icon,
            color
          )
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id,name,icon,color,type")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select("id,title,amount,type,date,time,category_id")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (budgetsResult.error) {
    throw budgetsResult.error;
  }

  if (categoriesResult.error) {
    throw categoriesResult.error;
  }

  if (transactionsResult.error) {
    throw transactionsResult.error;
  }

  return {
    budgets: budgetsResult.data || [],
    categories: categoriesResult.data || [],
    transactions: transactionsResult.data || [],
  };
}

export function buildBudgetInsights({ budgets, transactions, categories, now = new Date() }) {
  const expenseTransactions = (transactions || []).filter((transaction) => transaction.type === "expense");
  const categoryMap = createCategoryMap(categories);

  return (budgets || []).map((budget) => {
    const amount = Number(budget.amount || 0);
    const period = budget.period || "monthly";
    const periodRange = getBudgetPeriodRange(period, now);
    const categoryIds = getBudgetCategoryIds(budget);
    const matchedTransactions = expenseTransactions.filter((transaction) => {
      if (!isDateWithinRange(transaction.date, periodRange.start, periodRange.end)) {
        return false;
      }

      if (budget.budget_type === "overall") {
        return true;
      }

      if (!categoryIds.length) {
        return false;
      }

      return categoryIds.includes(transaction.category_id);
    });

    const liveSpent = matchedTransactions.reduce(
      (total, transaction) => total + Number(transaction.amount || 0),
      0
    );
    const progress = amount > 0 ? liveSpent / amount : 0;
    const remaining = Math.max(amount - liveSpent, 0);
    const linkedCategories = categoryIds
      .map((categoryId) => categoryMap[categoryId] || null)
      .filter(Boolean);

    return {
      ...budget,
      amount,
      liveSpent,
      progress,
      remaining,
      period,
      periodTitle: getBudgetPeriodTitle(period),
      periodLabel: getBudgetWindowLabel(period),
      periodStart: formatDateKey(periodRange.start),
      periodEnd: formatDateKey(periodRange.end),
      tone: getBudgetTone(progress),
      categoryIds,
      linkedCategories,
      matchedTransactions,
    };
  });
}

export function buildBudgetNotifications({ budgetInsights }) {
  if (!budgetInsights?.length) {
    return [];
  }

  const urgentNotifications = budgetInsights
    .filter((budget) => budget.amount > 0 && budget.progress >= 0.75)
    .map((budget) => {
      const progressText = formatPercent(budget.progress);
      const isExceeded = budget.progress >= 1;
      const categoryLabel = budget.budget_type === "overall"
        ? "overall budget"
        : budget.linkedCategories.length
          ? `${budget.linkedCategories.length} selected categor${budget.linkedCategories.length === 1 ? "y" : "ies"}`
          : "selected categories";

      return {
        id: `budget:${budget.id}:${budget.periodStart}:${budget.tone}`,
        kind: "budget",
        tone: budget.tone,
        accentColor: budget.color || "#ffb49a",
        title: isExceeded
          ? `${budget.name || "Budget"} exceeded`
          : `${budget.name || "Budget"} is at ${progressText}`,
        message: isExceeded
          ? `You've spent ${formatCurrency(budget.liveSpent)} on your ${categoryLabel} ${budget.periodLabel}, which is ${formatCurrency(budget.liveSpent - budget.amount)} over budget.`
          : `You've used ${progressText} of ${budget.name || "this budget"} ${budget.periodLabel}. ${formatCurrency(budget.remaining)} is left.`
      };
    });

  if (urgentNotifications.length) {
    return urgentNotifications.sort((left, right) => {
      const priorityDiff = getTonePriority(right.tone) - getTonePriority(left.tone);
      if (priorityDiff !== 0) return priorityDiff;
      return right.message.length - left.message.length;
    });
  }

  const mostActiveBudget = [...budgetInsights]
    .filter((budget) => budget.amount > 0)
    .sort((left, right) => right.progress - left.progress)[0];

  if (!mostActiveBudget) {
    return [];
  }

  return [
    {
      id: `budget:${mostActiveBudget.id}:${mostActiveBudget.periodStart}:positive`,
      kind: "budget",
      tone: "positive",
      accentColor: mostActiveBudget.color || "#ffb49a",
      title: `${mostActiveBudget.name || "Budget"} is on track`,
      message: `You've used ${formatPercent(mostActiveBudget.progress)} of your ${mostActiveBudget.period.toLowerCase()} limit. ${formatCurrency(mostActiveBudget.remaining)} is still available ${mostActiveBudget.periodLabel}.`,
    },
  ];
}

function buildExpenseByCategory(transactions) {
  return (transactions || []).reduce((totals, transaction) => {
    if (transaction.type !== "expense" || !transaction.category_id) {
      return totals;
    }

    const key = transaction.category_id;
    totals[key] = Number(totals[key] || 0) + Number(transaction.amount || 0);
    return totals;
  }, {});
}

function getLastNDaysTotal(transactions, startDate, dayCount) {
  const start = getStartOfDay(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() - (dayCount - 1));

  return (transactions || []).reduce((total, transaction) => {
    const date = getStartOfDay(transaction.date);
    if (date <= start && date >= end && transaction.type === "expense") {
      return total + Number(transaction.amount || 0);
    }

    return total;
  }, 0);
}

function getSpendingStreak(expenseTransactions, referenceDate = new Date()) {
  if (!expenseTransactions.length) {
    return 0;
  }

  const expenseDates = new Set(expenseTransactions.map((transaction) => formatDateKey(transaction.date)));
  const latestDate = parseStoredDate(expenseTransactions[0].date || referenceDate);
  let current = getStartOfDay(latestDate);
  let streak = 0;

  while (expenseDates.has(formatDateKey(current))) {
    streak += 1;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

export function buildSelfRuleNotifications({ transactions, categories, now = new Date() }) {
  const expenseTransactions = (transactions || []).filter((transaction) => transaction.type === "expense");
  const notifications = [];
  const categoryMap = createCategoryMap(categories);
  const monthRange = getBudgetPeriodRange("monthly", now);
  const thisMonthExpenses = expenseTransactions.filter((transaction) =>
    isDateWithinRange(transaction.date, monthRange.start, monthRange.end)
  );
  const thisMonthTotal = thisMonthExpenses.reduce(
    (total, transaction) => total + Number(transaction.amount || 0),
    0
  );
  const last7DaysTotal = getLastNDaysTotal(expenseTransactions, now, 7);
  const previous7Start = getStartOfDay(now);
  previous7Start.setDate(previous7Start.getDate() - 7);
  const previous7DaysTotal = getLastNDaysTotal(expenseTransactions, previous7Start, 7);

  if (last7DaysTotal > 0 && previous7DaysTotal > 0 && last7DaysTotal >= previous7DaysTotal * 1.2) {
    const changePercent = Math.round(((last7DaysTotal - previous7DaysTotal) / previous7DaysTotal) * 100);
    notifications.push({
      id: `self:weekly-rise:${formatDateKey(now)}`,
      kind: "self-rule",
      tone: "warning",
      accentColor: "#ff9b71",
      title: "Spending picked up this week",
      message: `Your last 7 days are up ${changePercent}% compared with the previous week. You've spent ${formatCurrency(last7DaysTotal)} recently.`,
    });
  }

  const categoryTotals = buildExpenseByCategory(thisMonthExpenses);
  const topCategoryEntry = Object.entries(categoryTotals).sort((left, right) => right[1] - left[1])[0];

  if (topCategoryEntry && thisMonthTotal > 0) {
    const [topCategoryId, topCategoryTotal] = topCategoryEntry;
    const share = topCategoryTotal / thisMonthTotal;

    if (share >= 0.4) {
      const categoryName = categoryMap[topCategoryId]?.name || "one category";
      notifications.push({
        id: `self:top-category:${formatDateKey(monthRange.start)}:${topCategoryId}`,
        kind: "self-rule",
        tone: "attention",
        accentColor: categoryMap[topCategoryId]?.color || "#f0b24a",
        title: `${categoryName} is leading your spend`,
        message: `${categoryName} makes up ${formatPercent(share)} of your spending this month at ${formatCurrency(topCategoryTotal)}.`,
      });
    }
  }

  const spendingStreak = getSpendingStreak(expenseTransactions, now);
  if (spendingStreak >= 3) {
    notifications.push({
      id: `self:streak:${formatDateKey(now)}:${spendingStreak}`,
      kind: "self-rule",
      tone: "attention",
      accentColor: "#ffd166",
      title: `${spendingStreak}-day spending streak`,
      message: `You've logged expenses for ${spendingStreak} straight days. A quick review now could help slow the pace.`,
    });
  }

  if (!notifications.length && thisMonthTotal > 0) {
    notifications.push({
      id: `self:monthly-summary:${formatDateKey(monthRange.start)}`,
      kind: "self-rule",
      tone: "positive",
      accentColor: "#7fd1ae",
      title: "Monthly spending snapshot",
      message: `You've spent ${formatCurrency(thisMonthTotal)} so far this month. Keep an eye on the pace before the month closes.`,
    });
  }

  if (!notifications.length) {
    notifications.push({
      id: `self:get-started:${formatDateKey(now)}`,
      kind: "self-rule",
      tone: "positive",
      accentColor: "#8cc8ff",
      title: "Start your first spending pattern",
      message: "Add a few transactions and SmartSpend will begin nudging you with self-generated spending insights.",
    });
  }

  return notifications;
}

export function buildNudgeNotifications({ budgets, transactions, categories, now = new Date() }) {
  const budgetInsights = buildBudgetInsights({ budgets, transactions, categories, now });
  const notifications = budgetInsights.length
    ? buildBudgetNotifications({ budgetInsights })
    : buildSelfRuleNotifications({ transactions, categories, now });

  return {
    budgetInsights,
    notifications,
  };
}
