import { PermissionsAndroid, Platform } from "react-native";
import { supabase } from "../lib/supabase";
import {
  accountMatchesRule,
  findMatchingBankAccount,
  findMatchingBankRule,
  getEnabledBankRules,
  isOtpLikeBankSms,
  isLikelyBankTransactionSms,
} from "./bankSmsRules";
import { saveTransaction } from "./saveTransaction";
import { getDeviceSmsList, isSmsModuleAvailable } from "./smsNative";
import { callBackendApi } from "./backendApi";
import { parseSmsTransaction } from "./smsParser";

const FALLBACK_CATEGORY = {
  name: "Others",
  icon: "dots-horizontal",
  color: "#8D8D8D",
};

function getMessageKey(sender, message) {
  return `${String(sender || "").trim()}::${String(message || "").trim()}`;
}

function parseSmsTimestamp(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  let numeric = Number(value);
  if (Number.isFinite(numeric)) {
    // Smart detection: Most SMS timestamps on Android/Expo are in milliseconds.
    // If the number is too small (e.g. < 2,000,000,000), it's likely seconds.
    // 1713912000 (seconds) -> 1970 vs 1713912000000 (ms) -> 2024.
    if (numeric < 2000000000) {
      numeric = numeric * 1000;
    }

    const parsed = new Date(numeric);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSmsRecent(value, maxDays = 7) {
  const parsed = parseSmsTimestamp(value);
  if (!parsed) {
    return false;
  }

  const now = new Date();
  const diffTime = now.getTime() - parsed.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  // Accept anything from the last X days to catch up on missed transactions.
  return diffDays <= maxDays;
}

function formatLocalDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getFallbackCategory(categories, type) {
  return (
    categories.find((category) => {
      const matchesType = category.type === type;
      const name = String(category.name || "").trim().toLowerCase();
      return matchesType && (name === "other" || name === "others");
    }) || null
  );
}

function isOthersCategory(category) {
  if (!category?.name) {
    return false;
  }

  const normalized = String(category.name).trim().toLowerCase();
  return normalized === "other" || normalized === "others";
}

function shouldTryAiCategory(category) {
  return !category || isOthersCategory(category);
}

function buildAiCacheKey({ sender, message, type, amount }) {
  const normalizedSender = String(sender || "").trim().toLowerCase();
  const normalizedMessage = String(message || "")
    .trim()
    .toLowerCase();
  const normalizedType = String(type || "").trim().toLowerCase();
  const normalizedAmount = Number(amount || 0).toFixed(2);
  return `${normalizedSender}::${normalizedType}::${normalizedAmount}::${normalizedMessage}`;
}

function matchSuggestedCategory(categories, type, suggestedCategoryName) {
  const normalizedSuggestion = String(suggestedCategoryName || "")
    .trim()
    .toLowerCase();

  if (!normalizedSuggestion) {
    return null;
  }

  return (
    categories.find((category) => {
      if (category.type !== type) {
        return false;
      }

      return String(category.name || "").trim().toLowerCase() === normalizedSuggestion;
    }) || null
  );
}

async function suggestCategoryWithAi({
  userId,
  sender,
  message,
  parsed,
  categories,
  cache,
}) {
  const availableCategories = categories
    .filter((category) => category.type === parsed.type)
    .map((category) => ({ name: category.name, type: category.type }));

  if (!availableCategories.length) {
    return null;
  }

  const cacheKey = buildAiCacheKey({
    sender,
    message,
    type: parsed.type,
    amount: parsed.amount,
  });

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const { data, error } = await supabase.functions.invoke("classify-sms-transaction", {
      body: {
        userId,
        sender,
        message,
        parsed: {
          amount: parsed.amount,
          merchant: parsed.merchant,
          type: parsed.type,
          occurredAt: parsed.occurredAt?.toISOString?.() || null,
        },
        categories: availableCategories,
      },
    });

    if (error || data?.error) {
      cache.set(cacheKey, null);
      return null;
    }

    const confidence = Number(data?.confidence || 0);
    if (!Number.isFinite(confidence) || confidence < 0.55) {
      cache.set(cacheKey, null);
      return null;
    }

    const matched = matchSuggestedCategory(
      categories,
      parsed.type,
      data?.suggestedCategoryName
    );

    cache.set(cacheKey, matched || null);
    return matched || null;
  } catch (_error) {
    cache.set(cacheKey, null);
    return null;
  }
}

function buildTransactionFingerprint({ type, amount, occurredAt }) {
  const parsedDate = parseSmsTimestamp(occurredAt);
  const numericAmount = Number(amount);

  if (!parsedDate || !Number.isFinite(numericAmount)) {
    return null;
  }

  const dateKey = formatLocalDate(parsedDate);
  const hour = String(parsedDate.getHours()).padStart(2, "0");
  const minute = String(parsedDate.getMinutes()).padStart(2, "0");
  const amountKey = numericAmount.toFixed(2);
  return `${String(type || "").trim().toLowerCase()}::${amountKey}::${dateKey}::${hour}:${minute}`;
}

async function fetchKnownTransactionFingerprints(userId) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { data, error } = await supabase
    .from("transactions")
    .select("type,amount,date,time")
    .eq("user_id", userId)
    .gte("date", formatLocalDate(startDate))
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  const fingerprints = new Set();

  (data || []).forEach((transaction) => {
    const dateValue = String(transaction.date || "");
    if (!dateValue) {
      return;
    }

    const timeValue = String(transaction.time || "00:00:00");
    const occurredAt = new Date(`${dateValue}T${timeValue}`);
    const fingerprint = buildTransactionFingerprint({
      type: transaction.type,
      amount: transaction.amount,
      occurredAt,
    });

    if (fingerprint) {
      fingerprints.add(fingerprint);
    }
  });

  return fingerprints;
}

function hasFingerprintConflict(fingerprintSet, parsed) {
  const fingerprint = buildTransactionFingerprint({
    type: parsed.type,
    amount: parsed.amount,
    occurredAt: parsed.occurredAt,
  });

  if (!fingerprint) {
    return false;
  }

  return fingerprintSet.has(fingerprint);
}

function rememberFingerprint(fingerprintSet, parsed) {
  const fingerprint = buildTransactionFingerprint({
    type: parsed.type,
    amount: parsed.amount,
    occurredAt: parsed.occurredAt,
  });

  if (fingerprint) {
    fingerprintSet.add(fingerprint);
  }
}

function resolveCategory(categories, parsed) {
  const fallbackCategory = getFallbackCategory(categories, parsed.type);
  const normalizedSuggestion = String(parsed.suggestedCategoryName || "")
    .trim()
    .toLowerCase();
  const match = categories.find((category) => {
    const matchesType = category.type === parsed.type;
    if (!matchesType) {
      return false;
    }

    const categoryName = String(category.name || "").trim().toLowerCase();
    return (
      categoryName === normalizedSuggestion ||
      (normalizedSuggestion === "other" && (categoryName === "other" || categoryName === "others")) ||
      (normalizedSuggestion === "others" && (categoryName === "other" || categoryName === "others"))
    );
  });

  if (match) {
    return match;
  }

  return fallbackCategory;
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

  const [{ accounts, categories }, inboxMessages, knownSmsKeys, knownFingerprints] = await Promise.all([
    fetchAccountsAndCategories(userId),
    getDeviceSmsList(0, 100, {}),
    fetchKnownSmsKeys(userId),
    fetchKnownTransactionFingerprints(userId),
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
  const aiCategoryCache = new Map();

  for (const sms of inboxMessages) {
    const sender = sms?.address || sms?.sender || "SMS";
    const message = sms?.body || sms?.message || "";
    const smsTimestamp = sms?.date ?? sms?.timestamp;
    const key = getMessageKey(sender, message);

    if (!message.trim() || knownSmsKeys.has(key) || !isSmsRecent(smsTimestamp)) {
      skipped += 1;
      continue;
    }

    if (isOtpLikeBankSms(message)) {
      skipped += 1;
      continue;
    }

    const parsed = parseSmsTransaction({
      sender,
      message,
      date: smsTimestamp,
      availableCategories: categories,
    });

    if (!parsed) {
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

    if (hasFingerprintConflict(knownFingerprints, parsed)) {
      skipped += 1;
      continue;
    }

    let category = resolveCategory(categories, parsed);
    if (shouldTryAiCategory(category)) {
      const aiCategory = await suggestCategoryWithAi({
        userId,
        sender,
        message,
        parsed,
        categories,
        cache: aiCategoryCache,
      });

      if (aiCategory) {
        category = aiCategory;
      }
    }
    const targetAccount =
      findMatchingBankAccount(bankAccounts, matchedBankRule) || defaultBankAccount;

    const savedTransaction = await saveTransaction({
      userId,
      type: parsed.type,
      title: parsed.title,
      amount: parsed.amount,
      description: `Imported from SMS: ${sender}`,
      date: formatLocalDate(parsed.occurredAt),
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
    rememberFingerprint(knownFingerprints, parsed);

    if (savedTransaction?.duplicate) {
      skipped += 1;
    } else {
      processed += 1;
    }
  }

  return { processed, skipped };
}

export async function ingestIncomingSmsForUser(userId, sms) {
  if (!userId || !sms) {
    return false;
  }

  const sender = sms?.sender || sms?.address || "SMS";
  const { accounts, categories } = await fetchAccountsAndCategories(userId);
  const bankAccounts = accounts.filter((account) => account.type === "bank");
  const enabledBankRules = getEnabledBankRules(bankAccounts);

  if (!enabledBankRules.length) {
    return false;
  }

  // PRIVACY GATE: Check the Sender against your bank list first
  let matchedRule = findMatchingBankRule({
    sender,
    message: "",
    enabledRules: enabledBankRules,
  });

  let targetAccount = null;
  let aiParsed = null;

  if (matchedRule) {
    targetAccount = bankAccounts.find((a) => accountMatchesRule(a, matchedRule));
  } else {
    // If local rules fail, check if it's a likely bank SMS and ask Gemini AI
    if (isLikelyBankTransactionSms({ sender, message: sms?.body || "" })) {
      console.log(`[SMS Detection] Local rule mismatch, asking Gemini AI to identify...`);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        
        if (session?.access_token) {
          const { response } = await callBackendApi("/api/sms/analyze", {
            accessToken: session.access_token,
            body: { sender, message: sms?.body || "" },
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.isTransaction && result.bankName) {
              aiParsed = result;
              console.log(`[SMS Detection] Gemini identified: ${result.bankName}`);
              
              // Try to find a matching account for this AI-detected bank
              targetAccount = bankAccounts.find((a) => {
                const name = a.name.toLowerCase();
                const aiName = result.bankName.toLowerCase();
                return name.includes(aiName) || aiName.includes(name);
              });
            }
          }
        }
      } catch (error) {
        console.warn("[SMS Detection] AI analysis failed:", error.message);
      }
    }
  }

  if (!targetAccount) {
    // Still no match, drop it.
    return false;
  }

  const message = sms?.body || sms?.message || "";
  const smsTimestamp = sms?.timestamp || sms?.date;

  if (!message.trim() || isOtpLikeBankSms(message) || !isSmsRecent(smsTimestamp)) {
    return false;
  }

  console.log(`[SMS Detection] SUCCESS: Processing message from ${aiParsed?.bankName || matchedRule?.name} for account ${targetAccount.name}`);

  const knownSmsKeys = await fetchKnownSmsKeys(userId);
  const knownFingerprints = await fetchKnownTransactionFingerprints(userId);
  const key = getMessageKey(sender, message);

  if (knownSmsKeys.has(key)) {
    return false;
  }

  const parsed = parseSmsTransaction({
    sender,
    message,
    date: smsTimestamp,
    availableCategories: categories,
  });

  if (!parsed) {
    return false;
  }

  if (hasFingerprintConflict(knownFingerprints, parsed)) {
    return false;
  }

  const aiCategoryCache = new Map();
  let category = resolveCategory(categories, parsed);
  if (shouldTryAiCategory(category)) {
    const aiCategory = await suggestCategoryWithAi({
      userId,
      sender,
      message,
      parsed,
      categories,
      cache: aiCategoryCache,
    });

    if (aiCategory) {
      category = aiCategory;
    }
  }
  // targetAccount is already resolved above via strict matching logic

  const savedTransaction = await saveTransaction({
    userId,
    type: aiParsed?.type || parsed.type,
    title: aiParsed?.merchant || parsed.title,
    amount: aiParsed?.amount || parsed.amount,
    description: `Imported from SMS (${aiParsed ? "AI" : "Auto"}): ${sender}`,
    date: formatLocalDate(parsed.occurredAt),
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

  if (savedTransaction?.duplicate) {
    return true;
  }

  // FORCE REFRESH: Send a broadcast event so the UI refreshes immediately
  // This ensures that even if Supabase replication is slow, the app pops the data.
  await supabase.channel(`user-realtime-${userId}`).send({
    type: 'broadcast',
    event: 'refresh',
    payload: { transactionId: parsed.id },
  });

  return true;
}
