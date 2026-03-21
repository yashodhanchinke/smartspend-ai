const CATEGORY_KEYWORDS = {
  expense: {
    Bills: ["bill", "broadband", "bsnl", "jiofiber", "recharge", "postpaid", "prepaid"],
    Education: ["school", "college", "course", "udemy", "coursera", "byju"],
    Entertainment: ["netflix", "spotify", "prime video", "bookmyshow", "movie", "music"],
    Food: ["swiggy", "zomato", "restaurant", "cafe", "pizza", "burger", "dining"],
    Groceries: ["blinkit", "zepto", "bigbasket", "dmart", "grocery", "supermarket"],
    Health: ["apollo", "pharmacy", "hospital", "clinic", "medicine", "medplus"],
    Housing: ["maintenance", "society", "home loan", "housing"],
    Rent: ["rent", "landlord", "lease"],
    Shopping: ["amazon", "flipkart", "myntra", "ajio", "meesho", "store", "shopping"],
    Transport: ["uber", "ola", "rapido", "metro", "fuel", "petrol", "diesel", "parking", "fastag"],
    Travel: ["irctc", "air india", "indigo", "hotel", "booking", "makemytrip", "flight"],
    Utilities: ["electricity", "water", "gas", "utility"],
  },
  income: {
    Business: ["client", "vendor", "business", "invoice", "settlement"],
    Gifts: ["gift", "reward", "cashback", "bonus"],
    Investments: ["dividend", "mutual fund", "interest", "stock", "sip"],
    Salary: ["salary", "payroll", "wages", "pay credit"],
    Savings: ["deposit", "fd", "rd", "savings"],
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

function inferCategoryName({ message, merchant, type, availableCategories = [] }) {
  const haystack = `${message} ${merchant}`.toLowerCase();

  const directMatch = availableCategories.find((category) => {
    const name = String(category?.name || "").trim().toLowerCase();
    return name && haystack.includes(name);
  });

  if (directMatch?.name) {
    return directMatch.name;
  }

  const categoryMap = CATEGORY_KEYWORDS[type] || {};

  for (const [categoryName, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return categoryName;
    }
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
  const occurredAt = date ? new Date(Number(date)) : new Date();

  return {
    amount,
    merchant,
    title: merchant || (type === "income" ? "SMS income" : "SMS expense"),
    type,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    suggestedCategoryName,
  };
}
