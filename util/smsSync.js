import { PermissionsAndroid, Platform } from "react-native";
import { supabase } from "../lib/supabase";
import {
  findMatchingBankAccount,
  findMatchingBankRule,
  getEnabledBankRules,
  isOtpLikeBankSms,
} from "./bankSmsRules";
import { saveTransaction } from "./saveTransaction";
import { getDeviceSmsList, isSmsModuleAvailable } from "./smsNative";
import { parseSmsTransaction } from "./smsParser";

const FALLBACK_CATEGORY = {
  name: "Other",
  icon: "dots-horizontal",
  color: "#8D8D8D",
};

function getMessageKey(sender, message) {
  return `${String(sender || "").trim()}::${String(message || "").trim()}`;
}

async function requestSmsPermission() {
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
  ]);

  return (
    result[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
    result[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED
  );
}

async function fetchAccountsAndCategories(userId) {
  const [{ data: accounts, error: accountError }, { data: categories, error: categoryError }] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,type,is_default")
        .eq("user_id", userId)
        .order("created_at"),
      supabase
        .from("categories")
        .select("id,name,type,icon,color")
        .eq("user_id", userId)
        .order("created_at"),
    ]);

  if (accountError) {
    throw accountError;
  }

  if (categoryError) {
    throw categoryError;
  }

  return {
    accounts: accounts || [],
    categories: categories || [],
  };
}

async function ensureFallbackCategory(userId, categories, type) {
  const existing = categories.find((category) => {
    const matchesType = category.type === type;
    const name = String(category.name || "").trim().toLowerCase();
    return matchesType && (name === "other" || name === "others");
  });

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("categories")
    .insert([
      {
        user_id: userId,
        name: FALLBACK_CATEGORY.name,
        type,
        icon: FALLBACK_CATEGORY.icon,
        color: FALLBACK_CATEGORY.color,
      },
    ])
    .select("id,name,type,icon,color")
    .single();

  if (error) {
    throw error;
  }

  categories.push(data);
  return data;
}

async function resolveCategory(userId, categories, parsed) {
  const normalizedSuggestion = String(parsed.suggestedCategoryName || "")
    .trim()
    .toLowerCase();
  const match = categories.find((category) => {
    if (category.type !== parsed.type) {
      return false;
    }

    const categoryName = String(category.name || "").trim().toLowerCase();
    return (
      categoryName === normalizedSuggestion ||
      (normalizedSuggestion === "other" && (categoryName === "other" || categoryName === "others"))
    );
  });

  if (match) {
    return match;
  }

  return ensureFallbackCategory(userId, categories, parsed.type);
}

async function fetchKnownSmsKeys(userId) {
  const { data, error } = await supabase
    .from("sms_transactions")
    .select("sender,message")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((item) => getMessageKey(item.sender, item.message)));
}

export async function syncSmsTransactionsForUser(userId) {
  if (!userId || Platform.OS !== "android") {
    return { processed: 0, skipped: 0 };
  }

  if (!isSmsModuleAvailable()) {
    return { processed: 0, skipped: 0 };
  }

  const granted = await requestSmsPermission();
  if (!granted) {
    return { processed: 0, skipped: 0 };
  }

  const [{ accounts, categories }, inboxMessages, knownSmsKeys] = await Promise.all([
    fetchAccountsAndCategories(userId),
    getDeviceSmsList(0, 100, {}),
    fetchKnownSmsKeys(userId),
  ]);

  const bankAccounts = accounts.filter((account) => account.type === "bank");
  const enabledBankRules = getEnabledBankRules(bankAccounts);
  const defaultBankAccount =
    bankAccounts.find((account) => account.is_default) || bankAccounts[0] || null;

  if (!defaultBankAccount || !enabledBankRules.length) {
    return { processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const sms of inboxMessages) {
    const sender = sms?.address || sms?.sender || "SMS";
    const message = sms?.body || sms?.message || "";
    const key = getMessageKey(sender, message);

    if (!message.trim() || knownSmsKeys.has(key)) {
      skipped += 1;
      continue;
    }

    if (isOtpLikeBankSms(message)) {
      skipped += 1;
      continue;
    }

    const matchedBankRule = findMatchingBankRule({
      sender,
      message,
      enabledRules: enabledBankRules,
    });

    if (!matchedBankRule) {
      skipped += 1;
      continue;
    }

    const parsed = parseSmsTransaction({
      sender,
      message,
      date: sms?.date,
      availableCategories: categories,
    });

    if (!parsed) {
      skipped += 1;
      continue;
    }

    const category = await resolveCategory(userId, categories, parsed);
    const targetAccount =
      findMatchingBankAccount(bankAccounts, matchedBankRule) || defaultBankAccount;

    await saveTransaction({
      userId,
      type: parsed.type,
      title: parsed.title,
      amount: parsed.amount,
      description: `Imported from SMS: ${sender}`,
      date: parsed.occurredAt.toISOString().split("T")[0],
      time: parsed.occurredAt.toTimeString().split(" ")[0],
      accountId: targetAccount.id,
      categoryId: category?.id || null,
    });

    const { error } = await supabase.from("sms_transactions").insert([
      {
        user_id: userId,
        sender,
        message,
        amount: parsed.amount,
        merchant: parsed.merchant,
        detected_category: category?.name || FALLBACK_CATEGORY.name,
      },
    ]);

    if (error) {
      throw error;
    }

    knownSmsKeys.add(key);
    processed += 1;
  }

  return { processed, skipped };
}

export async function ingestIncomingSmsForUser(userId, sms) {
  if (!userId || !sms) {
    return false;
  }

  const { accounts, categories } = await fetchAccountsAndCategories(userId);
  const bankAccounts = accounts.filter((account) => account.type === "bank");
  const enabledBankRules = getEnabledBankRules(bankAccounts);
  const defaultBankAccount =
    bankAccounts.find((account) => account.is_default) || bankAccounts[0] || null;

  if (!defaultBankAccount || !enabledBankRules.length) {
    return false;
  }

  const sender = sms?.sender || sms?.address || "SMS";
  const message = sms?.body || sms?.message || "";

  if (!message.trim() || isOtpLikeBankSms(message)) {
    return false;
  }

  const matchedBankRule = findMatchingBankRule({
    sender,
    message,
    enabledRules: enabledBankRules,
  });

  if (!matchedBankRule) {
    return false;
  }

  const knownSmsKeys = await fetchKnownSmsKeys(userId);
  const key = getMessageKey(sender, message);

  if (knownSmsKeys.has(key)) {
    return false;
  }

  const parsed = parseSmsTransaction({
    sender,
    message,
    date: sms?.timestamp || sms?.date,
    availableCategories: categories,
  });

  if (!parsed) {
    return false;
  }

  const category = await resolveCategory(userId, categories, parsed);
  const targetAccount =
    findMatchingBankAccount(bankAccounts, matchedBankRule) || defaultBankAccount;

  await saveTransaction({
    userId,
    type: parsed.type,
    title: parsed.title,
    amount: parsed.amount,
    description: `Imported from SMS: ${sender}`,
    date: parsed.occurredAt.toISOString().split("T")[0],
    time: parsed.occurredAt.toTimeString().split(" ")[0],
    accountId: targetAccount.id,
    categoryId: category?.id || null,
  });

  const { error } = await supabase.from("sms_transactions").insert([
    {
      user_id: userId,
      sender,
      message,
      amount: parsed.amount,
      merchant: parsed.merchant,
      detected_category: category?.name || FALLBACK_CATEGORY.name,
    },
  ]);

  if (error) {
    throw error;
  }

  return true;
}
