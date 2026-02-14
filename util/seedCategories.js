// util/seedCategories.js

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../data/categories";
import { supabase } from "../lib/supabase";

export const seedCategoriesForUser = async (userId) => {
  if (!userId) return;

  // Check if categories already exist
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId);

  if (error) {
    console.log("Seed check error:", error.message);
    return;
  }

  // If user already has categories, stop
  if (data && data.length > 0) return;

  // Prepare default categories
  const defaults = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map(
    (cat) => ({
      user_id: userId,
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
    })
  );

  const { error: insertError } = await supabase
    .from("categories")
    .insert(defaults);

  if (insertError) {
    console.log("Seed insert error:", insertError.message);
  }
};
