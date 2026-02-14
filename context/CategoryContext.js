import { createContext, useContext, useEffect, useState } from "react";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../data/categories";

const CategoryContext = createContext();
export const useCategories = () => useContext(CategoryContext);

export default function CategoryProvider({ children }) {
  const [expenseCategories, setExpense] = useState(EXPENSE_CATEGORIES);
  const [incomeCategories, setIncome] = useState(INCOME_CATEGORIES);

  const [transactions, setTransactions] = useState([]); // backend data later

  // Auto-update totals whenever transactions change
  useEffect(() => {
    updateCategoryTotals();
  }, [transactions]);

  const updateCategoryTotals = () => {
    const expenseCopy = EXPENSE_CATEGORIES.map(cat => {
      const total = transactions
        .filter(t => t.type === "expense" && t.category === cat.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...cat, total };
    });

    const incomeCopy = INCOME_CATEGORIES.map(cat => {
      const total = transactions
        .filter(t => t.type === "income" && t.category === cat.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...cat, total };
    });

    setExpense(expenseCopy);
    setIncome(incomeCopy);
  };

  return (
    <CategoryContext.Provider
      value={{
        expenseCategories,
        incomeCategories,

        transactions,
        setTransactions,
      }}
    >
      {children}
    </CategoryContext.Provider>
  );
}
