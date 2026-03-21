const BANK_RULES = [
  {
    name: "HDFC Bank",
    aliases: ["hdfc", "hdfc bank"],
    senderHints: ["hdfcbk", "hdfc", "hdfcbank"],
  },
  {
    name: "ICICI Bank",
    aliases: ["icici", "icici bank"],
    senderHints: ["icicib", "icicit", "icici", "icicibank"],
  },
  {
    name: "State Bank of India",
    aliases: ["sbi", "state bank", "state bank of india"],
    senderHints: ["sbiinb", "sbipsg", "cbssbi", "sbibnk", "sbi", "sbind"],
  },
  {
    name: "Axis Bank",
    aliases: ["axis", "axis bank"],
    senderHints: ["axisbk", "axis", "axisbn"],
  },
  {
    name: "Kotak Mahindra Bank",
    aliases: ["kotak", "kotak bank", "kotak mahindra"],
    senderHints: ["kotakb", "kotak", "ktkbnk"],
  },
  {
    name: "Punjab National Bank",
    aliases: ["pnb", "punjab national bank"],
    senderHints: ["pnb", "pnbsms"],
  },
  {
    name: "Bank of Baroda",
    aliases: ["bob", "bank of baroda"],
    senderHints: ["bankbd", "baroda", "bob"],
  },
  {
    name: "Canara Bank",
    aliases: ["canara", "canara bank"],
    senderHints: ["canbnk", "canara"],
  },
  {
    name: "Union Bank",
    aliases: ["union bank", "union"],
    senderHints: ["unionb", "unionbk"],
  },
  {
    name: "IDFC First Bank",
    aliases: ["idfc", "idfc first", "idfc first bank"],
    senderHints: ["idfcbk", "idfcfb"],
  },
  {
    name: "IndusInd Bank",
    aliases: ["indusind", "indusind bank"],
    senderHints: ["indusb", "indusind"],
  },
  {
    name: "Yes Bank",
    aliases: ["yes bank", "yesbank"],
    senderHints: ["yesbnk", "yesbank"],
  },
  {
    name: "AU Small Finance Bank",
    aliases: ["au bank", "au small finance", "au small finance bank"],
    senderHints: ["aubank", "ausfb"],
  },
  {
    name: "Federal Bank",
    aliases: ["federal bank", "federal"],
    senderHints: ["fedbnk", "federal"],
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
    const core = match.slice(2, 8);
    if (core) {
      tokens.add(core);
    }

    tokens.add(match);
  });

  return Array.from(tokens);
}

function accountMatchesRule(account, rule) {
  const accountName = normalize(account?.name);
  return rule.aliases.some((alias) => accountName.includes(alias));
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

export function isOtpLikeBankSms(message) {
  const lower = normalize(message);

  return /(otp|one time password|verification code|login code|auth code|mpin|pin|password|cvv)/i.test(
    lower
  );
}
