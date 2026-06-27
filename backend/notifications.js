import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "./supabase.js";
import { MultinomialNaiveBayes } from "./ml/naiveBayes.js";

const GENERATION_COOLDOWN_MS = 1000 * 60 * 60 * 6;

function formatDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) {
    return new Date();
  }

  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1);
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getStartOfDay(value = new Date()) {
  const date = parseDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getStartOfWeek(value = new Date()) {
  const date = getStartOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getBudgetRange(period, referenceDate = new Date()) {
  const date = getStartOfDay(referenceDate);

  if (period === "daily") {
    return { start: date, end: addDays(date, 1) };
  }

  if (period === "weekly") {
    const start = getStartOfWeek(referenceDate);
    return { start, end: addDays(start, 7) };
  }

  if (period === "yearly") {
    const start = new Date(date.getFullYear(), 0, 1);
    return { start, end: new Date(date.getFullYear() + 1, 0, 1) };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
    const start = new Date(date.getFullYear(), quarterStartMonth, 1);
    return { start, end: new Date(date.getFullYear(), quarterStartMonth + 3, 1) };
  }

  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  return { start, end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
}

function isDateInRange(dateValue, start, end) {
  const value = parseDate(dateValue);
  return value >= start && value < end;
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function pickFirstName(profileName) {
  const first = String(profileName || "").trim().split(/\s+/)[0];
  return first || "there";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCategoryIdsForBudget(budget) {
  const linkedIds = (budget.budget_categories || [])
    .map((item) => item.category_id || item.categories?.id)
    .filter(Boolean);

  return [...new Set([budget.category_id, ...linkedIds].filter(Boolean))];
}

function buildBudgetCandidates(budgets, transactions, now = new Date()) {
  const expenseTransactions = (transactions || []).filter((item) => item.type === "expense");

  return (budgets || [])
    .map((budget) => {
      const amount = Number(budget.amount || 0);
      if (amount <= 0) {
        return null;
      }

      const { start, end } = getBudgetRange(budget.period || "monthly", now);
      const categoryIds = getCategoryIdsForBudget(budget);
      const budgetCategoryNames = (budget.budget_categories || [])
        .map((row) => row?.categories?.name)
        .filter(Boolean);
      const spent = expenseTransactions
        .filter((transaction) => {
          if (!isDateInRange(transaction.date, start, end)) {
            return false;
          }

          if (budget.budget_type === "overall") {
            return true;
          }

          return categoryIds.includes(transaction.category_id);
        })
        .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
      const progress = spent / amount;

      if (progress < 0.7) {
        return null;
      }

      const severity = progress >= 1 ? "critical" : progress >= 0.9 ? "warning" : "attention";
      const periodKey = formatDateKey(start);
      const categoryLabel = budget.budget_type === "overall"
        ? "overall"
        : budgetCategoryNames.length
          ? budgetCategoryNames.slice(0, 2).join(", ")
          : "selected categories";

      return {
        fingerprint: `budget:${budget.id}:${periodKey}:${severity}`,
        source_module: "budget",
        source_entity_type: "budget",
        source_entity_id: budget.id,
        tone: severity,
        language: "hinglish",
        kind: "nudge",
        title: "",
        body: "",
        summary: `${budget.name || "Budget"} (${categoryLabel}) is at ${Math.round(progress * 100)}% usage. Limit ${formatCurrency(amount)}, spent ${formatCurrency(spent)}, remaining ${formatCurrency(Math.max(amount - spent, 0))}.`,
        fallbackTitle: progress >= 1 ? `${budget.name || "Budget"} crossed` : `${budget.name || "Budget"} almost full`,
        fallbackBody:
          progress >= 1
            ? `${categoryLabel}: budget cross ho gaya, aaj home/plan karke spend cut karo.`
            : `${categoryLabel}: ${formatCurrency(Math.max(amount - spent, 0))} left, aaj thoda tight rakho.`,
      };
    })
    .filter(Boolean);
}

function buildLoanCandidates(loans, now = new Date()) {
  const todayKey = formatDateKey(now);

  return (loans || [])
    .filter((loan) => (!loan.status || loan.status === "pending") && loan.end_date && loan.end_date <= todayKey)
    .map((loan) => {
      const isBorrowing = loan.type === "borrowing";

      return {
        fingerprint: `loan:${loan.id}:${loan.end_date}`,
        source_module: "loan",
        source_entity_type: "loan",
        source_entity_id: loan.id,
        tone: "warning",
        language: "hinglish",
        kind: "nudge",
        title: "",
        body: "",
        summary: isBorrowing
          ? `Borrowed loan ${loan.name || "Loan"} of ${formatCurrency(loan.amount)} is due since ${loan.end_date}. User should settle it soon to reduce pressure.`
          : `Lent loan ${loan.name || "Loan"} of ${formatCurrency(loan.amount)} is due since ${loan.end_date}. User should follow up and recover money.`,
        fallbackTitle: isBorrowing ? `Borrowed loan due hai` : `Loan follow-up pending`,
        fallbackBody: isBorrowing
          ? `${loan.name || "Loan"} ka payment delay mat karo, jaldi settle karke cash flow halka rakho.`
          : `${loan.name || "Loan"} ka paisa follow-up karo, wapas aaya toh savings fast badhegi.`,
      };
    });
}

function buildGoalCandidates(goals, now = new Date()) {
  return (goals || [])
    .map((goal) => {
      const target = Number(goal.target_amount || 0);
      const current = Number(goal.current_amount || 0);

      if (target <= 0) {
        return null;
      }

      const endDate = goal.end_date ? parseDate(goal.end_date) : null;
      const startDate = goal.start_date ? parseDate(goal.start_date) : getStartOfDay(now);
      const totalDurationMs = Math.max(endDate ? endDate.getTime() - startDate.getTime() : 0, 1);
      const elapsedMs = clamp(now.getTime() - startDate.getTime(), 0, totalDurationMs);
      const expectedProgress = endDate ? elapsedMs / totalDurationMs : 0;
      const actualProgress = current / target;
      const isPastDue = endDate ? endDate < now && actualProgress < 1 : false;
      const isLagging = endDate ? actualProgress + 0.15 < expectedProgress : actualProgress < 0.35;

      if (!isPastDue && !isLagging) {
        return null;
      }

      const fingerprint = isPastDue
        ? `goal:past-due:${goal.id}:${goal.end_date}`
        : `goal:lagging:${goal.id}:${formatDateKey(now).slice(0, 7)}`;

      return {
        fingerprint,
        source_module: "goal",
        source_entity_type: "goal",
        source_entity_id: goal.id,
        tone: isPastDue ? "warning" : "attention",
        language: "hinglish",
        kind: "nudge",
        title: "",
        body: "",
        summary: `${goal.title || "Goal"} target is ${formatCurrency(target)}, current saved is ${formatCurrency(current)}, actual progress ${Math.round(actualProgress * 100)}%. Expected progress is ${Math.round(expectedProgress * 100)}%. End date ${goal.end_date || "not set"}.`,
        fallbackTitle: isPastDue ? `Goal deadline nikal gayi` : `Goal pace ko push chahiye`,
        fallbackBody: isPastDue
          ? `${goal.title || "Goal"} abhi pending hai, aaj chhota top-up karke momentum wapas lao.`
          : `${goal.title || "Goal"} ke liye aaj thoda save karke progress ko catch up karao.`,
      };
    })
    .filter(Boolean);
}

function buildRecurringCandidates(items, now = new Date()) {
  const todayKey = formatDateKey(now);

  return (items || [])
    .filter((item) => item.next_run && item.next_run <= todayKey)
    .map((item) => ({
      fingerprint: `recurring:${item.id}:${item.next_run}`,
      source_module: "recurring",
      source_entity_type: "recurring_transaction",
      source_entity_id: item.id,
      tone: "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `Recurring ${item.type || "expense"} item ${item.title || "Recurring"} amount ${formatCurrency(item.amount)} was due on ${item.next_run} and still needs attention.`,
      fallbackTitle: `Recurring item check karo`,
      fallbackBody: `${item.title || "Recurring payment"} due hai. Time pe handle karoge toh surprise charges aur missed tracking dono bachenge.`,
    }));
}

function buildTrendCandidates(transactions, now = new Date()) {
  const expenses = (transactions || []).filter((item) => item.type === "expense");
  const thisWeekStart = getStartOfWeek(now);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const thisWeekTotal = expenses
    .filter((item) => isDateInRange(item.date, thisWeekStart, addDays(thisWeekStart, 7)))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lastWeekTotal = expenses
    .filter((item) => isDateInRange(item.date, lastWeekStart, thisWeekStart))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (!lastWeekTotal || thisWeekTotal < lastWeekTotal * 1.25) {
    return [];
  }

  const changePercent = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100);
  return [
    {
      fingerprint: `trend:weekly:${formatDateKey(thisWeekStart)}`,
      source_module: "spending",
      source_entity_type: "weekly_trend",
      source_entity_id: null,
      tone: "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `This week spending ${formatCurrency(thisWeekTotal)} is ${changePercent}% higher than last week's ${formatCurrency(lastWeekTotal)}.`,
      fallbackTitle: `Spending pace badh gaya`,
      fallbackBody: `Is week spend kaafi fast hai, aaj 1 non-essential cut karke pace control karo.`,
    },
  ];
}

function getCategorySuggestion(categoryName) {
  const name = normalizeText(categoryName);

  if (/(food|dining|restaurant|swiggy|zomato|cafe|pizza|burger)/i.test(name)) {
    return "Aaj ghar ka khana try karo, save hoga.";
  }

  if (/(shopping|fashion|clothes|apparel|beauty|cosmetic)/i.test(name)) {
    return "48-hour rule: cart me rakho, kal decide karo.";
  }

  if (/(transport|uber|ola|cab|fuel|petrol|diesel)/i.test(name)) {
    return "Short trips me walk/public transport try karo.";
  }

  if (/(entertainment|movie|ott|subscription|games)/i.test(name)) {
    return "1 subscription pause karo, next month resume.";
  }

  if (/(grocery|groceries)/i.test(name)) {
    return "List bana ke lo, impulse items skip karo.";
  }

  return "Aaj 1 non-essential skip karo, small win.";
}

function buildCategoryOverspendCandidates(transactions, now = new Date()) {
  const monthRange = getBudgetRange("monthly", now);
  const categoryTotals = new Map();
  const expenseTransactions = (transactions || []).filter((item) => item.type === "expense");

  expenseTransactions.forEach((transaction) => {
    if (!isDateInRange(transaction.date, monthRange.start, monthRange.end)) {
      return;
    }

    const categoryName = transaction.categories?.name || "Other";
    const key = categoryName;
    categoryTotals.set(key, Number(categoryTotals.get(key) || 0) + Number(transaction.amount || 0));
  });

  const sorted = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  if (!top) {
    return [];
  }

  const [topCategoryName, topAmount] = top;
  if (topAmount < 3000) {
    return [];
  }

  const suggestion = getCategorySuggestion(topCategoryName);

  return [
    {
      fingerprint: `category:top:${formatDateKey(monthRange.start)}:${normalizeText(topCategoryName)}`,
      source_module: "spending",
      source_entity_type: "category_top",
      source_entity_id: null,
      tone: "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `Top category this month is ${topCategoryName} at ${formatCurrency(topAmount)}.`,
      fallbackTitle: `${topCategoryName}: spend zyada`,
      fallbackBody: `${formatCurrency(topAmount)} spent. ${suggestion}`,
    },
  ];
}

function sumMatchingMerchants(transactions, keywords, days, now = new Date()) {
  const cutoff = addDays(getStartOfDay(now), -days);

  return (transactions || [])
    .filter((item) => item.type === "expense")
    .filter((item) => parseDate(item.date) >= cutoff)
    .reduce((sum, item) => {
      const title = normalizeText(item.title);
      const description = normalizeText(item.description);
      const haystack = `${title} ${description}`.trim();
      const match = keywords.some((keyword) => haystack.includes(keyword));
      return match ? sum + Number(item.amount || 0) : sum;
    }, 0);
}

function buildUnnecessarySpendCandidates(transactions, now = new Date()) {
  const deliveryTotal = sumMatchingMerchants(transactions, ["swiggy", "zomato"], 14, now);
  const impulseTotal = sumMatchingMerchants(transactions, ["amazon", "flipkart", "myntra", "ajio"], 14, now);

  const candidates = [];

  if (deliveryTotal >= 1200) {
    candidates.push({
      fingerprint: `unnecessary:delivery:${formatDateKey(now).slice(0, 7)}`,
      source_module: "spending",
      source_entity_type: "delivery_spend",
      source_entity_id: null,
      tone: "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `Food delivery spend in last 14 days is ${formatCurrency(deliveryTotal)}.`,
      fallbackTitle: "Delivery spend check",
      fallbackBody: `${formatCurrency(deliveryTotal)} delivery spend, aaj ghar ka option choose karo.`,
    });
  }

  if (impulseTotal >= 2000) {
    candidates.push({
      fingerprint: `unnecessary:shopping:${formatDateKey(now).slice(0, 7)}`,
      source_module: "spending",
      source_entity_type: "shopping_spend",
      source_entity_id: null,
      tone: "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `Shopping spend in last 14 days is ${formatCurrency(impulseTotal)}.`,
      fallbackTitle: "Shopping pause",
      fallbackBody: `${formatCurrency(impulseTotal)} shopping spend, next buy se pehle 48-hour rule follow karo.`,
    });
  }

  return candidates.slice(0, 2);
}

function buildLowBalanceCandidates({ accounts, transactions, now = new Date() }) {
  const totalBalance = (accounts || []).reduce((sum, account) => sum + Number(account.balance || 0), 0);
  if (totalBalance <= 0) {
    return [];
  }

  const monthRange = getBudgetRange("monthly", now);
  const monthIncome = (transactions || [])
    .filter((t) => t.type === "income" && isDateInRange(t.date, monthRange.start, monthRange.end))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const monthExpense = (transactions || [])
    .filter((t) => t.type === "expense" && isDateInRange(t.date, monthRange.start, monthRange.end))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  if (monthIncome <= 0 || monthExpense <= 0) {
    return [];
  }

  const usedRatio = monthExpense / (monthExpense + totalBalance);
  if (usedRatio < 0.5) {
    return [];
  }

  const usedPercent = Math.round(usedRatio * 100);

  return [
    {
      fingerprint: `balance:pace:${formatDateKey(monthRange.start)}`,
      source_module: "account",
      source_entity_type: "balance_pace",
      source_entity_id: null,
      tone: usedRatio >= 0.7 ? "warning" : "attention",
      language: "hinglish",
      kind: "nudge",
      title: "",
      body: "",
      summary: `This month expenses ${formatCurrency(monthExpense)} and remaining total balance ${formatCurrency(totalBalance)} implies ${usedPercent}% used ratio.`,
      fallbackTitle: "Balance pace fast",
      fallbackBody: `Is month approx ${usedPercent}% use ho gaya, aaj 1 non-essential skip karo.`,
    },
  ];
}

function buildPositiveKeepItUpCandidates({ budgets, transactions, now = new Date() }) {
  const monthRange = getBudgetRange("monthly", now);
  const monthExpense = (transactions || [])
    .filter((t) => t.type === "expense" && isDateInRange(t.date, monthRange.start, monthRange.end))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const budgetTotal = (budgets || []).reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const monthIncome = (transactions || [])
    .filter((t) => t.type === "income" && isDateInRange(t.date, monthRange.start, monthRange.end))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Case 1: Balanced spending with Budget
  if (budgetTotal > 0 && monthExpense > 0 && monthExpense <= budgetTotal * 0.7) {
    return [
      {
        fingerprint: `positive:budget:${formatDateKey(monthRange.start)}`,
        source_module: "nudge",
        source_entity_type: "keep_it_up",
        tone: "positive",
        kind: "nudge",
        summary: `Monthly expense ${formatCurrency(monthExpense)} is within 70% of total budget ${formatCurrency(budgetTotal)}.`,
        fallbackTitle: "Budget balanced",
        fallbackBody: "Aapka budget control me hai, keep going!",
      },
    ];
  }

  // Case 2: Healthy savings even without Budget
  if (budgetTotal === 0 && monthIncome > 0 && monthExpense > 0) {
    const savings = monthIncome - monthExpense;
    const savingsRatio = savings / monthIncome;

    if (savingsRatio >= 0.1) {
      return [
        {
          fingerprint: `positive:savings:${formatDateKey(monthRange.start)}`,
          source_module: "nudge",
          source_entity_type: "savings_rate",
          tone: "positive",
          kind: "nudge",
          summary: `User has no budget, but is saving ${Math.round(savingsRatio * 100)}% of income.`,
          fallbackTitle: "Natural Saver",
          fallbackBody: `Bina budget ke bhi ${Math.round(savingsRatio * 100)}% save kar rahe ho, kamaal hai! 💎`,
        },
      ];
    }
  }

  return [];
}

function buildCandidates({ budgets, loans, goals, recurringTransactions, transactions, accounts, now }) {
  return [
    ...buildBudgetCandidates(budgets, transactions, now),
    ...buildLoanCandidates(loans, now),
    ...buildGoalCandidates(goals, now),
    ...buildRecurringCandidates(recurringTransactions, now),
    ...buildTrendCandidates(transactions, now),
    ...buildCategoryOverspendCandidates(transactions, now),
    ...buildUnnecessarySpendCandidates(transactions, now),
    ...buildLowBalanceCandidates({ accounts, transactions, now }),
    ...buildPositiveKeepItUpCandidates({ budgets, transactions, now }),
    ...buildInvestmentAdviceCandidates(transactions, accounts),
  ].slice(0, 8);
}

/**
 * NEW: 50/30/20 Rule Advisor
 */
function buildInvestmentAdviceCandidates(transactions, accounts) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const recentTx = transactions.filter(t => new Date(t.date) >= monthStart);
  
  const income = recentTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = recentTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  if (income < 1000) return []; // Too little data/income to advise

  // 50/30/20 Classification (Simplified)
  const wantsCategories = ['Shopping', 'Entertainment', 'Dining', 'Personal', 'Other'];
  const needsCategories = ['Groceries', 'Bills', 'Rent', 'Transport', 'Healthcare', 'Education'];

  const wantsSpend = recentTx
    .filter(t => t.type === 'expense' && wantsCategories.includes(t.category_name))
    .reduce((sum, t) => sum + t.amount, 0);

  const investments = recentTx
    .filter(t => t.type === 'expense' && (t.category_name === 'Investment' || t.category_name === 'Goal'))
    .reduce((sum, t) => sum + t.amount, 0);

  const wantsRatio = (wantsSpend / income) * 100;
  const savingsRatio = (investments / income) * 100;

  const results = [];

  if (wantsRatio > 35) {
    results.push({
      fingerprint: `advice:wants_overspend:${now.getMonth()}`,
      source_module: "advisor",
      source_entity_type: "50_30_20",
      tone: "cautionary",
      kind: "nudge",
      title: "Wants Control",
      body: `Aapka 'Wants' spend ${Math.round(wantsRatio)}% ho gaya hai. Global rules ke hisab se 30% limit honi chahiye. Thoda control?`,
      summary: "User exceeding 30% wants threshold.",
      fallbackTitle: "Smart Advice",
      fallbackBody: "Bhai, shopping aur dining thoda jyada ho raha hai. Try to keep it under 30%.",
    });
  }

  if (savingsRatio < 15 && income > 5000) {
    results.push({
      fingerprint: `advice:investment_low:${now.getMonth()}`,
      source_module: "advisor",
      source_entity_type: "50_30_20",
      tone: "cautionary",
      kind: "nudge",
      title: "Investment Tip",
      body: `Aapki savings/investments sirf ${Math.round(savingsRatio)}% hain. 20% ka target rakho to mast future secure hoga!`,
      summary: "User below 20% savings threshold.",
      fallbackTitle: "Investment Advice",
      fallbackBody: "Try to invest at least 20% of your income every month.",
    });
  }

  return results;
}

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: "gemini-2.0-flash" });
}

function extractJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini response did not contain a JSON array.");
  }

  return JSON.parse(text.slice(start, end + 1));
}

async function rewriteCandidatesWithGemini({ candidates, profileName, languageMode }) {
  const model = getModel();

  if (!model || !candidates.length) {
    return candidates.map((candidate) => ({
      ...candidate,
      title: candidate.fallbackTitle,
      body: candidate.fallbackBody,
      language: languageMode || "hinglish",
    }));
  }

  const prompt = `
You write short personal finance notifications for an Indian savings app called SmartSpend AI.

Requirements:
- Return JSON array only.
- For each input candidate, keep fingerprint, source_module, source_entity_type, source_entity_id, tone, and kind unchanged.
- Write a short title and body for each item.
- Language mode: ${languageMode || "hinglish"}.
- Tone should inspire saving money, chasing goals, settling loans, and staying on top of recurring payments.
- Hinglish should stay natural and light, not too slangy.
- Keep title under 55 characters.
- Keep body under 140 characters.
- Body MUST be a single sentence (no 2-4 sentence paragraphs).
- No investment advice (no mutual funds, stocks, crypto, SIP suggestions). Only savings + good habits.

Profile first name: ${pickFirstName(profileName)}

Input candidates:
${JSON.stringify(candidates.map((candidate) => ({
  fingerprint: candidate.fingerprint,
  source_module: candidate.source_module,
  source_entity_type: candidate.source_entity_type,
  source_entity_id: candidate.source_entity_id,
  tone: candidate.tone,
  kind: candidate.kind,
  summary: candidate.summary,
})), null, 2)}
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = extractJsonArray(responseText);

    return candidates.map((candidate) => {
      const rewritten = parsed.find((item) => item.fingerprint === candidate.fingerprint) || {};

      return {
        ...candidate,
        title: String(rewritten.title || candidate.fallbackTitle).trim(),
        body: String(rewritten.body || candidate.fallbackBody).trim(),
        language: String(rewritten.language || languageMode || "hinglish").trim(),
      };
    });
  } catch (error) {
    console.error("Gemini notification rewrite failed:", error.message);
    return candidates.map((candidate) => ({
      ...candidate,
      title: candidate.fallbackTitle,
      body: candidate.fallbackBody,
      language: languageMode || "hinglish",
    }));
  }
}

async function loadUserNotificationData(userId) {
  const [preferencesResult, budgetsResult, loansResult, goalsResult, recurringResult, transactionsResult, profileResult, accountsResult] = await Promise.all([
    supabaseAdmin
      .from("notification_preferences")
      .select("user_id,push_enabled,push_permission_status,expo_push_token,language_mode,last_generated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("budgets")
      .select(`
        id,
        name,
        amount,
        period,
        budget_type,
        category_id,
        budget_categories (
          category_id,
          categories (
            id,
            name
          )
        )
      `)
      .eq("user_id", userId),
    supabaseAdmin
      .from("loans")
      .select("id,name,amount,type,start_date,end_date,status")
      .eq("user_id", userId),
    supabaseAdmin
      .from("goals")
      .select("id,title,target_amount,current_amount,start_date,end_date")
      .eq("user_id", userId),
    supabaseAdmin
      .from("recurring_transactions")
      .select("id,title,amount,type,period,next_run")
      .eq("user_id", userId),
    supabaseAdmin
      .from("transactions")
      .select("id,title,description,amount,type,date,category_id,categories(name)")
      .eq("user_id", userId)
      .gte("date", formatDateKey(addDays(new Date(), -400)))
      .order("date", { ascending: false }),
    supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("accounts")
      .select("id,balance")
      .eq("user_id", userId),
  ]);

  const errors = [
    preferencesResult.error,
    budgetsResult.error,
    loansResult.error,
    goalsResult.error,
    recurringResult.error,
    transactionsResult.error,
    profileResult.error,
    accountsResult.error,
  ].filter(Boolean);

  if (errors.length) {
    throw errors[0];
  }

  return {
    preferences: preferencesResult.data || null,
    budgets: budgetsResult.data || [],
    loans: loansResult.data || [],
    goals: goalsResult.data || [],
    recurringTransactions: recurringResult.data || [],
    transactions: transactionsResult.data || [],
    profileName: profileResult.data?.name || "",
    accounts: accountsResult.data || [],
  };
}

async function loadExistingNotificationMap(userId, fingerprints) {
  if (!fingerprints.length) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id,fingerprint,read_at,expires_at")
    .eq("user_id", userId)
    .in("fingerprint", fingerprints);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((item) => [item.fingerprint, item]));
}

async function persistNotifications(userId, notifications) {
  const existingMap = await loadExistingNotificationMap(
    userId,
    notifications.map((item) => item.fingerprint)
  );
  const nowIso = new Date().toISOString();
  const insertedOrReopened = [];

  for (const notification of notifications) {
    const existing = existingMap.get(notification.fingerprint);

    if (!existing) {
      const { data, error } = await supabaseAdmin
        .from("notifications")
        .insert([
          {
            user_id: userId,
            fingerprint: notification.fingerprint,
            title: notification.title,
            body: notification.body,
            tone: notification.tone,
            language: notification.language,
            kind: notification.kind,
            source_module: notification.source_module,
            source_entity_type: notification.source_entity_type,
            source_entity_id: notification.source_entity_id,
            metadata: { summary: notification.summary },
          },
        ])
        .select("id,title,body,source_module")
        .single();

      if (error) {
        throw error;
      }

      insertedOrReopened.push(data);
      continue;
    }

    const isExpired = existing.read_at && existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now();

    const payload = {
      title: notification.title,
      body: notification.body,
      tone: notification.tone,
      language: notification.language,
      kind: notification.kind,
      source_module: notification.source_module,
      source_entity_type: notification.source_entity_type,
      source_entity_id: notification.source_entity_id,
      metadata: { summary: notification.summary },
    };

    if (isExpired) {
      payload.created_at = nowIso;
      payload.read_at = null;
      payload.expires_at = null;
      payload.push_attempted_at = null;
      payload.push_sent_at = null;
      payload.push_error = null;
    }

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update(payload)
      .eq("id", existing.id)
      .select("id,title,body,source_module")
      .single();

    if (error) {
      throw error;
    }

    if (isExpired) {
      insertedOrReopened.push(data);
    }
  }

  return insertedOrReopened;
}

async function sendPushNotifications({ pushToken, notifications }) {
  if (!pushToken || !notifications.length) {
    return { sentIds: [], failed: [] };
  }

  const sentIds = [];
  const failed = [];

  for (const notification of notifications.slice(0, 3)) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: pushToken,
          title: notification.title,
          body: notification.body,
          sound: "default",
          data: {
            notificationId: notification.id,
            sourceModule: notification.source_module,
          },
        }),
      });

      const payload = await response.json();

      if (!response.ok || payload?.data?.status === "error" || payload?.errors?.length) {
        failed.push({
          id: notification.id,
          error: payload?.errors?.[0]?.message || payload?.data?.message || "Push send failed",
        });
      } else {
        sentIds.push(notification.id);
      }
    } catch (error) {
      failed.push({ id: notification.id, error: error.message || "Push send failed" });
    }
  }

  return { sentIds, failed };
}

async function updatePushDeliveryState(sentIds, failed) {
  const nowIso = new Date().toISOString();

  if (sentIds.length) {
    await supabaseAdmin
      .from("notifications")
      .update({
        push_attempted_at: nowIso,
        push_sent_at: nowIso,
        push_error: null,
      })
      .in("id", sentIds);
  }

  for (const failure of failed) {
    await supabaseAdmin
      .from("notifications")
      .update({
        push_attempted_at: nowIso,
        push_error: failure.error,
      })
      .eq("id", failure.id);
  }
}

export async function registerNotificationDevice({ userId, expoPushToken, permissionStatus, languageMode }) {
  const payload = {
    user_id: userId,
    push_enabled: permissionStatus === "granted" && Boolean(expoPushToken),
    push_permission_status: permissionStatus || "unknown",
    expo_push_token: expoPushToken || null,
    language_mode: languageMode || "hinglish",
  };

  const { data, error } = await supabaseAdmin
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,push_enabled,push_permission_status,language_mode")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function generateNotificationsForUser({ userId, force = false }) {
  const now = new Date();
  const {
    preferences,
    budgets,
    loans,
    goals,
    recurringTransactions,
    transactions,
    profileName,
    accounts,
  } = await loadUserNotificationData(userId);
  const lastGeneratedAt = preferences?.last_generated_at ? new Date(preferences.last_generated_at).getTime() : 0;

  if (!force && lastGeneratedAt && Date.now() - lastGeneratedAt < GENERATION_COOLDOWN_MS) {
    return { generated: 0, pushed: 0, skipped: true };
  }

  let candidates = buildCandidates({
    budgets,
    loans,
    goals,
    recurringTransactions,
    transactions,
    accounts,
    now,
  });

  console.info(`[Notifications] Found ${candidates.length} candidate nudges for user ${userId}`);

  if (!candidates.length) {
    // If 'force' is true, we create a very fresh fingerprint so the UI always gets a "new" notification
    const genericSuffix = force ? `${formatDateKey(now)}:${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}` : formatDateKey(now);
    
    candidates = [
      {
        fingerprint: `positive:generic:${genericSuffix}`,
        source_module: "nudge",
        source_entity_type: "keep_it_up",
        source_entity_id: null,
        tone: "positive",
        language: preferences?.language_mode || "hinglish",
        kind: "nudge",
        title: "Keep it up",
        body: "Aaj ka spend mindful rakho, chhote savings se bada impact aata hai.",
        summary: "Generic keep-it-up nudge when no other triggers fire.",
        fallbackTitle: "Keep it up",
        fallbackBody: "Aaj ka spend mindful rakho, chhote savings se bada impact aata hai.",
      },
    ];
  }

  const rewritten = await rewriteCandidatesWithGemini({
    candidates,
    profileName,
    languageMode: preferences?.language_mode || "hinglish",
  });
  const persisted = await persistNotifications(userId, rewritten);

  let pushed = 0;
  if (persisted.length && preferences?.push_enabled && preferences?.expo_push_token) {
    const { sentIds, failed } = await sendPushNotifications({
      pushToken: preferences.expo_push_token,
      notifications: persisted,
    });

    await updatePushDeliveryState(sentIds, failed);
    pushed = sentIds.length;
  }

  await supabaseAdmin
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        push_enabled: preferences?.push_enabled || false,
        push_permission_status: preferences?.push_permission_status || "unknown",
        expo_push_token: preferences?.expo_push_token || null,
        language_mode: preferences?.language_mode || "hinglish",
        last_generated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );

  return {
    generated: persisted.length,
    pushed,
    skipped: false,
  };
}

export async function analyzeSmsWithAi({ sender, message }) {
  // Route classification through Multinomial Naive Bayes class facade
  return await MultinomialNaiveBayes.classify(sender, message, async ({ sender, message }) => {
    const model = getModel();
    if (!model) {
      return { isTransaction: false, bankName: null };
    }

    const prompt = `
Analyze this SMS message from an Indian bank/sender and extract transaction details.
Sender: ${sender}
Message: ${message}

Return JSON strictly:
{
  "isTransaction": boolean,
  "bankName": string (canonical name like "HDFC Bank", "State Bank of India", "Bandhan Bank", etc.),
  "type": "debit" | "credit" | null,
  "amount": number | null,
  "merchant": string | null,
  "currency": "INR"
}

Identify the bank name reliably from the sender ID (e.g. "HDFCBK" -> "HDFC Bank", "BANDHN" -> "Bandhan Bank") or message context.
If it is an OTP, PIN, or Alert NOT related to money movement, set isTransaction: false.
`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const parsed = extractJsonArray(responseText);
      return parsed;
    } catch (error) {
      console.error("Gemini SMS analysis failed:", error.message);
      return { isTransaction: false, bankName: null };
    }
  });
}
