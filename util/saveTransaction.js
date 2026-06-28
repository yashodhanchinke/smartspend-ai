import { supabase } from "../lib/supabase";

const pendingTransactionKeys = new Set();

function formatLocalDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAmount(amount) {
  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid amount");
  }

  return parsedAmount;
}

function normalizeTransactionText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildTransactionKey({
  userId,
  type,
  accountId,
  toAccountId,
  date,
  time,
  amount,
  title,
}) {
  return [
    String(userId || ""),
    String(type || ""),
    String(accountId || ""),
    String(toAccountId || ""),
    String(date || ""),
    String(time || ""),
    Number(amount || 0).toFixed(2),
    normalizeTransactionText(title),
  ].join("::");
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

async function broadcastTransactionRefresh(userId) {
  if (!userId) {
    return;
  }

  try {
    await supabase.channel(`user-realtime-${userId}`).send({
      type: "broadcast",
      event: "refresh",
    });
  } catch (error) {
    console.warn("Could not broadcast transaction refresh:", error.message);
  }
}

async function persistTransactionLabels({ transactionId, userId, labelIds = [] }) {
  const uniqueLabelIds = [...new Set((labelIds || []).filter(Boolean))];

  await supabase
    .from("transaction_labels")
    .delete()
    .eq("transaction_id", transactionId)
    .eq("user_id", userId);

  if (!uniqueLabelIds.length) {
    return;
  }

  const { error } = await supabase.from("transaction_labels").insert(
    uniqueLabelIds.map((labelId) => ({
      transaction_id: transactionId,
      label_id: labelId,
      user_id: userId,
    }))
  );

  if (error) {
    throw error;
  }
}

async function findExactDuplicateTransaction({
  userId,
  type,
  amount,
  date,
  time,
  accountId,
  toAccountId,
  title,
}) {
  let query = supabase
    .from("transactions")
    .select("id,user_id,account_id,to_account_id,type,title,amount,date,time")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("amount", amount)
    .eq("date", date)
    .eq("time", time)
    .eq("account_id", accountId);

  if (type === "transfer") {
    query = query.eq("to_account_id", toAccountId);
  } else {
    query = query.is("to_account_id", null);
  }

  const { data, error } = await query.limit(10);

  if (error) {
    throw error;
  }

  const normalizedTitle = normalizeTransactionText(title);

  return (data || []).find(
    (transaction) => normalizeTransactionText(transaction.title) === normalizedTitle
  ) || null;
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
  goalId = null,
  loanId = null,
  toAccountId = null,
  labelIds = [],
}) {
  const parsedAmount = normalizeAmount(amount);

  if (!userId) {
    throw new Error("Missing user");
  }

  if (!accountId) {
    throw new Error("Missing account");
  }

  const txDate = date ? formatLocalDate(date) : formatLocalDate(new Date());
  const txTime = time || new Date().toTimeString().split(" ")[0];

  if (type === "transfer" && !toAccountId) {
    throw new Error("Missing destination account");
  }

  const transactionKey = buildTransactionKey({
    userId,
    type,
    accountId,
    toAccountId,
    date: txDate,
    time: txTime,
    amount: parsedAmount,
    title,
  });

  if (pendingTransactionKeys.has(transactionKey)) {
    return {
      duplicate: true,
    };
  }

  pendingTransactionKeys.add(transactionKey);

  try {
    const [{ count: existingAccountTransactionCount, error: countError }, balanceMap] =
      await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("account_id", accountId),
        getAccountBalances([accountId, toAccountId]),
      ]);

    if (countError) {
      throw countError;
    }

    const duplicateTransaction = await findExactDuplicateTransaction({
      userId,
      type,
      amount: parsedAmount,
      date: txDate,
      time: txTime,
      accountId,
      toAccountId,
      title,
    });

    if (duplicateTransaction) {
      return { ...duplicateTransaction, duplicate: true };
    }

    const isOpeningBalanceTransaction =
      type === "income" &&
      Number(existingAccountTransactionCount || 0) === 0 &&
      Number(balanceMap.get(accountId) || 0) === parsedAmount;

    const { data: insertedTransaction, error } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: userId,
          account_id: accountId,
          to_account_id: type === "transfer" ? toAccountId : null,
          category_id: type === "transfer" ? null : categoryId,
          goal_id: type === "transfer" ? null : goalId,
          loan_id: type === "transfer" ? null : loanId,
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

    if (type !== "transfer") {
      await persistTransactionLabels({
        transactionId: insertedTransaction.id,
        userId,
        labelIds,
      });
    }

    if (type === "transfer") {
      // validated above so transfer balance updates stay aligned with the saved row
    }

    if (!isOpeningBalanceTransaction) {
      applyBalanceImpact(
        balanceMap,
        { type, amount: parsedAmount, accountId, toAccountId },
        1
      );
      await persistBalances(balanceMap);
    }
    await broadcastTransactionRefresh(userId);

    return insertedTransaction;
  } finally {
    pendingTransactionKeys.delete(transactionKey);
  }
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
  goalId = null,
  loanId = null,
  toAccountId = null,
  labelIds = [],
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

  const txDate = date ? formatLocalDate(date) : formatLocalDate(new Date());
  const txTime = time || new Date().toTimeString().split(" ")[0];
  const nextTransaction = {
    account_id: accountId,
    to_account_id: type === "transfer" ? toAccountId : null,
    category_id: type === "transfer" ? null : categoryId,
    goal_id: type === "transfer" ? null : goalId,
    loan_id: type === "transfer" ? null : loanId,
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

  if (type !== "transfer") {
    await persistTransactionLabels({
      transactionId,
      userId,
      labelIds,
    });
  }

  await persistBalances(balanceMap);
  await broadcastTransactionRefresh(userId);

  return { id: transactionId };
}

export async function deleteTransaction({ transactionId, userId }) {
  if (!transactionId) {
    throw new Error("Missing transaction");
  }

  if (!userId) {
    throw new Error("Missing user");
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

  const balanceMap = await getAccountBalances([
    existingTransaction.account_id,
    existingTransaction.to_account_id,
  ]);

  applyBalanceImpact(balanceMap, existingTransaction, -1);

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  await persistBalances(balanceMap);
  await broadcastTransactionRefresh(userId);

  return { id: transactionId };
}
