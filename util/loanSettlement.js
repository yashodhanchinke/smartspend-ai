import { supabase } from "../lib/supabase";
import { saveTransaction } from "./saveTransaction";

function formatDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPendingLoan(loan) {
  return !loan?.status || loan.status === "pending";
}

async function getPrimaryAccount(userId) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,type,is_default,created_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const accounts = data || [];
  const defaultBankAccount = accounts.find(
    (account) => account.is_default && account.type === "bank"
  );
  const bankAccount = accounts.find((account) => account.type === "bank");
  const fallbackAccount = accounts[0] || null;

  if (!defaultBankAccount && !bankAccount && !fallbackAccount) {
    throw new Error("Add an account first so loan settlement can update your main balance.");
  }

  return defaultBankAccount || bankAccount || fallbackAccount;
}

export async function getDuePendingLoans(userId) {
  const today = formatDateKey();
  const { data, error } = await supabase
    .from("loans")
    .select(
      "id,name,amount,type,start_date,end_date,description,status,settled_at,settlement_transaction_id,settlement_account_id"
    )
    .eq("user_id", userId)
    .or("status.eq.pending,status.is.null")
    .lte("end_date", today)
    .order("end_date", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).filter(isPendingLoan);
}

export async function settleLoan({ loan, userId }) {
  if (!loan?.id) {
    throw new Error("Missing loan");
  }

  if (!userId) {
    throw new Error("Missing user");
  }

  const account = await getPrimaryAccount(userId);
  const isBorrowing = loan.type === "borrowing";
  const amount = Number(loan.amount || 0);

  if (!amount || amount <= 0) {
    throw new Error("Invalid loan amount");
  }

  const transaction = await saveTransaction({
    userId,
    type: isBorrowing ? "expense" : "income",
    title: isBorrowing
      ? `Loan repayment • ${loan.name || "Borrowing"}`
      : `Loan received • ${loan.name || "Lending"}`,
    amount,
    description: loan.description?.trim()
      ? `Loan settlement: ${loan.description.trim()}`
      : "Loan settlement",
    date: formatDateKey(),
    time: new Date().toTimeString().split(" ")[0],
    accountId: account.id,
    categoryId: null,
  });

  const { error } = await supabase
    .from("loans")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
      settlement_transaction_id: transaction.id,
      settlement_account_id: account.id,
    })
    .eq("id", loan.id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return {
    account,
    transactionId: transaction.id,
    transactionType: isBorrowing ? "expense" : "income",
  };
}

