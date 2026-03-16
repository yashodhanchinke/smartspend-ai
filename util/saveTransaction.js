import { supabase } from "../lib/supabase";

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
  const parsedAmount = Number(amount);

  if (!userId) {
    throw new Error("Missing user");
  }

  if (!accountId) {
    throw new Error("Missing account");
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const txDate = date || new Date().toISOString().split("T")[0];
  const txTime = time || new Date().toTimeString().split(" ")[0];

  const { error } = await supabase.from("transactions").insert([
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
  ]);

  if (error) {
    throw error;
  }

  const { data: sourceAccount, error: sourceError } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  if (sourceError) {
    throw sourceError;
  }

  const currentBalance = Number(sourceAccount.balance || 0);

  if (type === "expense") {
    const { error: updateError } = await supabase
      .from("accounts")
      .update({
        balance: currentBalance - parsedAmount,
      })
      .eq("id", accountId);

    if (updateError) {
      throw updateError;
    }
  }

  if (type === "income") {
    const { error: updateError } = await supabase
      .from("accounts")
      .update({
        balance: currentBalance + parsedAmount,
      })
      .eq("id", accountId);

    if (updateError) {
      throw updateError;
    }
  }

  if (type === "transfer") {
    if (!toAccountId) {
      throw new Error("Missing destination account");
    }

    const { data: destinationAccount, error: destinationError } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", toAccountId)
      .single();

    if (destinationError) {
      throw destinationError;
    }

    const [{ error: debitError }, { error: creditError }] = await Promise.all([
      supabase
        .from("accounts")
        .update({
          balance: currentBalance - parsedAmount,
        })
        .eq("id", accountId),
      supabase
        .from("accounts")
        .update({
          balance: Number(destinationAccount.balance || 0) + parsedAmount,
        })
        .eq("id", toAccountId),
    ]);

    if (debitError) {
      throw debitError;
    }

    if (creditError) {
      throw creditError;
    }
  }
}
