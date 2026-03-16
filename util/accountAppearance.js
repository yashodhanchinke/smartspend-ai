const ACCOUNT_COLORS = [
  "#2d5b8f",
  "#2f6f46",
  "#8a4b2f",
  "#5f3dc4",
  "#8b3d62",
  "#2f7d7a",
  "#6c4a9a",
  "#7a5c1b",
];

export function getAccountIconName(account) {
  const type = String(account?.type || "").toLowerCase();
  const name = String(account?.name || "").toLowerCase();

  if (type.includes("cash") || name.includes("cash")) {
    return "cash-outline";
  }

  if (type.includes("wallet") || name.includes("wallet")) {
    return "wallet-outline";
  }

  if (type.includes("card") || name.includes("card")) {
    return "card-outline";
  }

  if (type.includes("upi") || name.includes("upi")) {
    return "phone-portrait-outline";
  }

  return "business-outline";
}

export function getAccountColor(account, fallbackIndex = 0) {
  if (account?.color) {
    return account.color;
  }

  const seed = `${account?.name || "account"}-${account?.type || "general"}-${fallbackIndex}`;
  let hash = 0;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  return ACCOUNT_COLORS[hash % ACCOUNT_COLORS.length];
}
