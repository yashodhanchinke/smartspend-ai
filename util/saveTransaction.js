import { supabase } from "../lib/supabase";

function normalizeAmount(amount) {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid amount");
  }

  return parsedAmount;
}

async function getAccountBalances(accountIds) {
  const uniqueIds = [...new Set((accountIds || []).filter(Boolean))];

  if (!uniqueIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id,balance")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((account) => [account.id, Number(account.balance || 0)]));
}

function applyBalanceImpact(balanceMap, transaction, direction = 1) {
  const amount = Number(transaction.amount || 0);

  if (!amount) {
    return;
  }

  const adjust = (accountId, delta) => {
    if (!accountId) {
      return;
    }

    balanceMap.set(accountId, Number(balanceMap.get(accountId) || 0) + delta);
  };

  if (transaction.type === "expense") {
    adjust(transaction.account_id || transaction.accountId, -amount * direction);
    return;
  }

  if (transaction.type === "income") {
    adjust(transaction.account_id || transaction.accountId, amount * direction);
    return;
  }

  if (transaction.type === "transfer") {
    adjust(transaction.account_id || transaction.accountId, -amount * direction);
    adjust(transaction.to_account_id || transaction.toAccountId, amount * direction);
  }
}

async function persistBalances(balanceMap) {
  const updates = [...balanceMap.entries()].map(([id, balance]) =>
    supabase.from("accounts").update({ balance }).eq("id", id)
  );

  const results = await Promise.all(updates);
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw failedResult.error;
  }
}

export async function saveTransaction({
  userId,
  type,
  title,
  amount,
  description = "",
  date,
  time,
  accountId,
  categoryId = null,
  toAccountId = null,
}) {
  const parsedAmount = normalizeAmount(amount);

  if (!userId) {
    throw new Error("Missing user");
  }

  if (!accountId) {
    throw new Error("Missing account");
  }

  const txDate = date || new Date().toISOString().split("T")[0];
  const txTime = time || new Date().toTimeString().split(" ")[0];

  const { data: insertedTransaction, error } = await supabase
    .from("transactions")
    .insert([
      {
        user_id: userId,
        account_id: accountId,
        to_account_id: type === "transfer" ? toAccountId : null,
        category_id: type === "transfer" ? null : categoryId,
        type,
        title: title?.trim() || "",
        amount: parsedAmount,
        description,
        date: txDate,
        time: txTime,
      },
    ])
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (type === "transfer") {
    if (!toAccountId) {
      throw new Error("Missing destination account");
    }
  }

  const balanceMap = await getAccountBalances([accountId, toAccountId]);
  applyBalanceImpact(
    balanceMap,
    { type, amount: parsedAmount, accountId, toAccountId },
    1
  );
  await persistBalances(balanceMap);

  return insertedTransaction;
}

export async function updateTransaction({
  transactionId,
  userId,
  type,
  title,
  amount,
  description = "",
  date,
  time,
  accountId,
  categoryId = null,
  toAccountId = null,
}) {
  const parsedAmount = normalizeAmount(amount);

  if (!transactionId) {
    throw new Error("Missing transaction");
  }

  if (!userId) {
    throw new Error("Missing user");
  }

  if (!accountId) {
    throw new Error("Missing account");
  }

  if (type === "transfer" && !toAccountId) {
    throw new Error("Missing destination account");
  }

  const { data: existingTransaction, error: existingError } = await supabase
    .from("transactions")
    .select("id,account_id,to_account_id,type,amount,user_id")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .single();

  if (existingError) {
    throw existingError;
  }

  const txDate = date || new Date().toISOString().split("T")[0];
  const txTime = time || new Date().toTimeString().split(" ")[0];
  const nextTransaction = {
    account_id: accountId,
    to_account_id: type === "transfer" ? toAccountId : null,
    category_id: type === "transfer" ? null : categoryId,
    type,
    title: title?.trim() || "",
    amount: parsedAmount,
    description,
    date: txDate,
    time: txTime,
  };

  const balanceMap = await getAccountBalances([
    existingTransaction.account_id,
    existingTransaction.to_account_id,
    accountId,
    toAccountId,
  ]);

  applyBalanceImpact(balanceMap, existingTransaction, -1);
  applyBalanceImpact(
    balanceMap,
    { type, amount: parsedAmount, accountId, toAccountId },
    1
  );

  const { error: updateError } = await supabase
    .from("transactions")
    .update(nextTransaction)
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (updateError) {
    throw updateError;
  }

  await persistBalances(balanceMap);

  return { id: transactionId };
}
