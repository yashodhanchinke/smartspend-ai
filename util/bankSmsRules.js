const BANK_RULES = [
  {
    name: "HDFC Bank",
    aliases: ["hdfc", "hdfc bank", "hdfcbk"],
    senderHints: ["hdfcbk", "hdfc", "hdfcbank", "hdfcrd", "hdfccr"],
  },
  {
    name: "ICICI Bank",
    aliases: ["icici", "icici bank", "icicibk"],
    senderHints: ["icicib", "icicit", "icici", "icicibank", "icicic", "icicrd"],
  },
  {
    name: "State Bank of India",
    aliases: ["sbi", "state bank", "state bank of india", "sbin"],
    senderHints: ["sbiinb", "sbipsg", "cbssbi", "sbibnk", "sbi", "sbind", "sbin"],
  },
  {
    name: "Axis Bank",
    aliases: ["axis", "axis bank", "axisbk"],
    senderHints: ["axisbk", "axis", "axisbn", "axiscr"],
  },
  {
    name: "Kotak Mahindra Bank",
    aliases: ["kotak", "kotak bank", "kotak mahindra", "kmbl"],
    senderHints: ["kotakb", "kotak", "ktkbnk", "kmbl"],
  },
  {
    name: "Punjab National Bank",
    aliases: ["pnb", "punjab national bank", "punjab national"],
    senderHints: ["pnb", "pnbsms", "pnbbnk"],
  },
  {
    name: "Bank of Maharashtra",
    aliases: ["bank of maharashtra", "maharashtra bank", "mahabank", "mahabk", "bom"],
    senderHints: ["mahabk", "mahabank", "bankofmaharashtra", "bom"],
  },
  {
    name: "Bank of Baroda",
    aliases: ["bob", "bank of baroda", "baroda bank", "baroda"],
    senderHints: ["bankbd", "baroda", "bob", "bobcr"],
  },
  {
    name: "Canara Bank",
    aliases: ["canara", "canara bank", "can bank"],
    senderHints: ["canbnk", "canara", "canbnc"],
  },
  {
    name: "Union Bank",
    aliases: ["union bank", "union", "union bank of india", "ubi"],
    senderHints: ["unionb", "unionbk", "ubi"],
  },
  {
    name: "IDFC First Bank",
    aliases: ["idfc", "idfc first", "idfc first bank", "idfc bank"],
    senderHints: ["idfcbk", "idfcfb", "idfc"],
  },
  {
    name: "IndusInd Bank",
    aliases: ["indusind", "indusind bank", "indus"],
    senderHints: ["indusb", "indusind", "indus"],
  },
  {
    name: "Yes Bank",
    aliases: ["yes bank", "yesbank", "yes"],
    senderHints: ["yesbnk", "yesbank"],
  },
  {
    name: "AU Small Finance Bank",
    aliases: ["au bank", "au small finance", "au small finance bank", "au sfb"],
    senderHints: ["aubank", "ausfb"],
  },
  {
    name: "Federal Bank",
    aliases: ["federal bank", "federal"],
    senderHints: ["fedbnk", "federal"],
  },
  {
    name: "Indian Bank",
    aliases: ["indian bank", "indian"],
    senderHints: ["indbnk", "indianbank"],
  },
  {
    name: "Central Bank of India",
    aliases: ["central bank", "central bank of india", "cbi"],
    senderHints: ["cenbnk", "cbi"],
  },
  {
    name: "South Indian Bank",
    aliases: ["south indian bank", "sib"],
    senderHints: ["sibset", "sib"],
  },
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeSmsText(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function extractSenderTokens(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return [];
  }

  const pieces = raw
    .split(/[^A-Za-z0-9]+/)
    .map((item) => normalize(item))
    .filter(Boolean);

  const tokens = new Set();

  pieces.forEach((piece) => {
    tokens.add(piece);

    const compact = normalizeSmsText(piece);
    if (compact) {
      tokens.add(compact);
    }
  });

  // Indian SMS headers often contain operator/region prefixes like VM/AD/BV
  // around a 6-character bank header such as HDFCBK or ICICIB.
  const compactSender = normalizeSmsText(raw);
  const embeddedMatches = compactSender.match(/[a-z]{2}[a-z]{6}[a-z]?/g) || [];

  embeddedMatches.forEach((match) => {
    // Standard Indian headers are length 6-8, starting after 2-char prefix
    const core = match.slice(2, 8); 
    if (core) {
      tokens.add(core);
    }
    // Also try 3-5 char codes which are common (SBI, AXIS, etc.)
    const short = match.slice(2, 5);
    if (short) {
      tokens.add(short);
    }

    tokens.add(match);
  });

  return Array.from(tokens);
}

export function accountMatchesRule(account, rule) {
  const accountName = normalize(account?.name);
  if (!accountName) return false;

  // 1. Literal match or containment (e.g. "HDFC Bank" matches "hdfc")
  const primaryMatch = rule.aliases.some((alias) => accountName.includes(alias));
  if (primaryMatch) return true;

  // 2. Reverse containment (e.g. "SBI" matches "State Bank of India")
  // We check if the account name is a substring of any long alias
  const reverseMatch = rule.aliases.some((alias) => alias.includes(accountName) && accountName.length >= 2);
  if (reverseMatch) return true;

  return false;
}

export function getEnabledBankRules(accounts = []) {
  const bankAccounts = accounts.filter((account) => account?.type === "bank");

  return BANK_RULES.filter((rule) =>
    bankAccounts.some((account) => accountMatchesRule(account, rule))
  );
}

export function findMatchingBankRule({ sender, message, enabledRules = [] }) {
  const senderTokens = extractSenderTokens(sender);
  const normalizedMessage = normalize(sender) + " " + normalize(message);

  return (
    enabledRules.find((rule) => {
      const senderMatch = rule.senderHints.some((hint) => {
        const normalizedHint = normalizeSmsText(hint);
        return senderTokens.some(
          (token) => token === normalizedHint || token.includes(normalizedHint)
        );
      });
      const messageMatch = rule.aliases.some((alias) => normalizedMessage.includes(alias));
      return senderMatch || messageMatch;
    }) || null
  );
}

export function findMatchingBankAccount(accounts = [], rule) {
  if (!rule) {
    return null;
  }

  const bankAccounts = accounts.filter((account) => account?.type === "bank");
  return bankAccounts.find((account) => accountMatchesRule(account, rule)) || null;
}

const RX_BANK_CONTEXT =
  /(a\/c|account|acct|upi|imps|neft|rtgs|atm|debit card|credit card|ifsc|avail(?:able)? bal(?:ance)?|txn|utr|ref(?:erence)?\s*(?:no|num|id)?)/i;
const RX_TXN_ACTION =
  /(debited|credited|spent|paid|purchase|withdrawn|received|sent|deposit|deposited|payment)/i;
const RX_AMOUNT = /(inr|rs\.?|₹)\s*[:\-]?\s*[0-9,]+(?:\.[0-9]{1,2})?/i;
const RX_INDIAN_HEADER = /^[a-z]{2}[-\s]?[a-z0-9]{5,8}(?:[-\s]?[a-z])?$/i;

export function isLikelyBankTransactionSms({ sender, message }) {
  const normalizedSender = normalizeSmsText(sender);
  const normalizedMessage = normalize(message);

  if (!normalizedMessage) {
    return false;
  }

  const compactMessage = normalizeSmsText(normalizedMessage);
  const senderLooksLikeHeader = RX_INDIAN_HEADER.test(String(sender || "").trim());
  const hasTxnAction = RX_TXN_ACTION.test(normalizedMessage);
  const hasBankContext = RX_BANK_CONTEXT.test(normalizedMessage);
  const hasAmount = RX_AMOUNT.test(normalizedMessage);
  const hasCoreTxnTerms =
    compactMessage.includes("upi") ||
    compactMessage.includes("imps") ||
    compactMessage.includes("neft") ||
    compactMessage.includes("rtgs") ||
    compactMessage.includes("utr") ||
    compactMessage.includes("txn") ||
    compactMessage.includes("debit") ||
    compactMessage.includes("credit");

  // Generic bank-SMS detection:
  // 1) Indian sender header + transactional text + amount
  // 2) Or clearly transactional banking keywords + amount
  return (
    (senderLooksLikeHeader &&
      (hasBankContext || hasCoreTxnTerms) &&
      hasTxnAction &&
      hasAmount) ||
    ((hasBankContext || hasCoreTxnTerms) && hasTxnAction && hasAmount)
  );
}

export function isOtpLikeBankSms(message) {
  const lower = normalize(message);

  return /(otp|one time password|verification code|login code|auth code|mpin|pin|password|cvv)/i.test(
    lower
  );
}
