const CATEGORY_INTENTS = {
  expense: {
    food: [
      "swiggy",
      "zomato",
      "restaurant",
      "cafe",
      "coffee",
      "tea",
      "chai",
      "bhel",
      "juice",
      "snacks",
      "bakery",
      "dining",
      "hotel",
      "dhaba",
      "eatery",
    ],
    groceries: [
      "grocery",
      "supermarket",
      "mart",
      "general store",
      "kirana",
      "provision",
      "dmart",
      "bigbasket",
      "blinkit",
      "zepto",
      "fresh",
      "vegetable",
    ],
    shopping: [
      "amazon",
      "flipkart",
      "myntra",
      "ajio",
      "meesho",
      "shopping",
      "store",
      "collection",
      "fashion",
      "clothing",
      "textile",
      "garments",
      "boutique",
      "jewellers",
      "footwear",
    ],
    transport: [
      "uber",
      "ola",
      "rapido",
      "metro",
      "fuel",
      "petrol",
      "diesel",
      "parking",
      "fastag",
      "toll",
      "cab",
      "auto",
      "bus",
      "train",
    ],
    travel: [
      "irctc",
      "flight",
      "airlines",
      "hotel booking",
      "makemytrip",
      "goibibo",
      "booking",
      "trip",
    ],
    bills: [
      "bill",
      "recharge",
      "postpaid",
      "prepaid",
      "broadband",
      "jiofiber",
      "dth",
      "emi",
      "insurance",
      "premium",
    ],
    utilities: ["electricity", "water", "gas", "utility", "bses", "mseb", "torrent power"],
    rent: ["rent", "landlord", "lease"],
    health: [
      "hospital",
      "clinic",
      "pharmacy",
      "medical",
      "medicine",
      "apollo",
      "diagnostic",
      "lab",
    ],
    entertainment: [
      "movie",
      "cinema",
      "netflix",
      "spotify",
      "prime video",
      "hotstar",
      "bookmyshow",
    ],
    education: ["school", "college", "tuition", "course", "udemy", "coursera", "byju", "academy"],
    housing: ["maintenance", "society", "housing", "home loan", "property tax", "flat"],
  },
  income: {
    salary: ["salary", "payroll", "wages", "stipend", "salary credit"],
    business: ["client", "vendor", "invoice", "settlement", "commission", "payout"],
    investments: ["dividend", "mutual fund", "interest", "stock", "sip", "redemption"],
    gifts: ["gift", "reward", "cashback", "bonus", "incentive", "refund"],
    savings: ["deposit", "fd", "rd", "savings"],
  },
};

const CATEGORY_NAME_ALIASES = {
  expense: {
    food: ["food", "dining", "meals", "snacks", "restaurant", "cafe", "chai", "tea"],
    groceries: ["grocery", "groceries", "kirana", "supermarket", "provisions"],
    shopping: ["shopping", "shop", "fashion", "clothes", "clothing", "store", "lifestyle"],
    transport: ["transport", "travel local", "commute", "fuel", "cab", "auto", "metro", "toll"],
    travel: ["travel", "trip", "vacation", "holiday", "tour"],
    bills: ["bills", "bill payments", "recharge", "subscriptions", "emi"],
    utilities: ["utilities", "electricity", "water", "gas", "internet", "broadband"],
    rent: ["rent", "house rent", "lease"],
    health: ["health", "medical", "medicine", "hospital", "pharmacy", "doctor"],
    entertainment: ["entertainment", "movies", "music", "ott"],
    education: ["education", "learning", "course", "school", "college", "fees"],
    housing: ["housing", "home", "maintenance", "society"],
  },
  income: {
    salary: ["salary", "pay", "payroll", "wages", "stipend"],
    business: ["business", "freelance", "client", "invoice", "commission", "payout"],
    investments: ["investment", "investments", "interest", "dividend", "sip", "returns"],
    gifts: ["gift", "cashback", "bonus", "reward", "refund"],
    savings: ["savings", "deposit", "fd", "rd"],
  },
};

const RX_AMOUNT = [
  /(?:inr|rs\.?|mrp|amt\.?|amount)\s*[:\-]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /₹\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:inr|rs\.?)/i,
];

const RX_MERCHANT = [
  /(?:at|to|towards|for|merchant|payee)\s+([A-Za-z0-9&.,' -]{2,40})/i,
  /(?:upi(?:\s+ref[^\s]*)?\s+(?:to|at))\s+([A-Za-z0-9&.,' -]{2,40})/i,
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCategoryLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(message) {
  for (const pattern of RX_AMOUNT) {
    const match = message.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }

  return null;
}

function detectType(message) {
  const lower = message.toLowerCase();

  if (
    /(otp|one time password|verification code|login code|auth code|due date reminder|available credit|credit limit)/i.test(lower)
  ) {
    return null;
  }

  if (/(credited|received|deposited|salary|refund|cashback)/i.test(lower)) {
    return "income";
  }

  if (/(debited|spent|paid|purchase|txn|withdrawn|sent)/i.test(lower)) {
    return "expense";
  }

  return null;
}

function parseMerchant(message, sender) {
  for (const pattern of RX_MERCHANT) {
    const match = message.match(pattern);
    const merchant = normalizeText(match?.[1] || "");
    if (merchant) {
      return merchant.replace(/[.,]$/, "");
    }
  }

  return normalizeText(sender || "SMS");
}

function parseDateInput(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  let numeric = Number(value);
  if (Number.isFinite(numeric)) {
    // Handle seconds vs milliseconds
    if (numeric < 2000000000) {
      numeric *= 1000;
    }
    const parsed = new Date(numeric);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsedFromString = new Date(String(value || ""));
  return Number.isNaN(parsedFromString.getTime()) ? null : parsedFromString;
}

function applyParsedTime(date, hour, minute, second = 0) {
  const next = new Date(date.getTime());
  next.setHours(hour, minute, second, 0);
  return next;
}

function parseTimeSegment(raw) {
  const match = String(raw || "")
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const period = (match[4] || "").toLowerCase();

  if (minutes > 59 || seconds > 59) {
    return null;
  }

  if (period) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (period === "pm" && hours !== 12) {
      hours += 12;
    }
    if (period === "am" && hours === 12) {
      hours = 0;
    }
  } else if (hours > 23) {
    return null;
  }

  return { hours, minutes, seconds };
}

function inferOccurredAt(date, message) {
  const baseDate = parseDateInput(date) || new Date();
  const normalized = normalizeText(message);

  // 1. Try to find a Date + Time pattern first
  // Pattern: DD-MM-YY HH:MM:SS or DD/MM/YYYY HH:MM
  const fullDateTimePattern = /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:am|pm)?)/i;
  const fullMatch = normalized.match(fullDateTimePattern);
  if (fullMatch) {
    const bodyDate = new Date(fullMatch[1]);
    const bodyTime = parseTimeSegment(fullMatch[2]);
    if (!Number.isNaN(bodyDate.getTime()) && bodyTime) {
      return applyParsedTime(bodyDate, bodyTime.hours, bodyTime.minutes, bodyTime.seconds);
    }
  }

  // 2. Try patterns like "on 24-APR-24 at 14:30"
  const dateAndAtTimePattern = /(\d{1,2}[-/](?:[a-z]{3}|\d{1,2})[-/]\d{2,4}).*?(?:at|time)\s*(\d{1,2}[:.]\d{2})/i;
  const dateAtMatch = normalized.match(dateAndAtTimePattern);
  if (dateAtMatch) {
    const bodyDate = new Date(dateAtMatch[1]);
    const bodyTime = parseTimeSegment(dateAtMatch[2]);
    if (!Number.isNaN(bodyDate.getTime()) && bodyTime) {
      return applyParsedTime(bodyDate, bodyTime.hours, bodyTime.minutes, bodyTime.seconds);
    }
  }

  // 3. Fallback: Only try to find a Time pattern and use the message's base date
  const timeOnlyPatterns = [
    /\b(?:at|time)\s*[:\-]?\s*(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:am|pm)?)\b/i,
    /\b(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:am|pm))\b/i,
    /\b(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)\b/,
  ];

  for (const pattern of timeOnlyPatterns) {
    const match = normalized.match(pattern);
    const parsedTime = parseTimeSegment(match?.[1]);
    if (!parsedTime) {
      continue;
    }

    return applyParsedTime(baseDate, parsedTime.hours, parsedTime.minutes, parsedTime.seconds);
  }

  return baseDate;
}

function findBestIntent({ haystack, type }) {
  const intentMap = CATEGORY_INTENTS[type] || {};
  let bestIntent = null;
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(intentMap)) {
    const score = keywords.reduce((count, keyword) => {
      return haystack.includes(keyword) ? count + 1 : count;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestScore > 0 ? bestIntent : null;
}

function findCategoryByIntent({ intent, type, availableCategories = [] }) {
  if (!intent) {
    return null;
  }

  const aliases = CATEGORY_NAME_ALIASES[type]?.[intent] || [intent];
  let bestCategory = null;
  let bestScore = 0;

  for (const category of availableCategories) {
    if (category?.type !== type) {
      continue;
    }

    const normalizedName = normalizeCategoryLabel(category.name);
    if (!normalizedName) {
      continue;
    }

    const score = aliases.reduce((count, alias) => {
      const token = normalizeCategoryLabel(alias);
      return token && normalizedName.includes(token) ? count + 1 : count;
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory?.name || null;
}

function inferCategoryName({ message, merchant, type, availableCategories = [] }) {
  const haystack = `${message} ${merchant}`.toLowerCase();

  const directMatch = availableCategories.find((category) => {
    if (category?.type !== type) {
      return false;
    }
    const name = normalizeCategoryLabel(category?.name);
    return name && haystack.includes(name);
  });

  if (directMatch?.name) {
    return directMatch.name;
  }

  const bestIntent = findBestIntent({ haystack, type });
  const mappedCategoryName = findCategoryByIntent({
    intent: bestIntent,
    type,
    availableCategories,
  });

  if (mappedCategoryName) {
    return mappedCategoryName;
  }

  return "Other";
}

export function parseSmsTransaction({ sender, message, date, availableCategories = [] }) {
  const normalizedMessage = normalizeText(message);

  if (!normalizedMessage) {
    return null;
  }

  const amount = parseAmount(normalizedMessage);
  const type = detectType(normalizedMessage);

  if (!amount || !type) {
    return null;
  }

  const merchant = parseMerchant(normalizedMessage, sender);
  const suggestedCategoryName = inferCategoryName({
    message: normalizedMessage,
    merchant,
    type,
    availableCategories,
  });
  const occurredAt = inferOccurredAt(date, normalizedMessage);

  return {
    amount,
    merchant,
    title: merchant || (type === "income" ? "SMS income" : "SMS expense"),
    type,
    occurredAt: (occurredAt && !Number.isNaN(occurredAt.getTime())) ? occurredAt : (parseDateInput(date) || new Date()),
    suggestedCategoryName,
  };
}
