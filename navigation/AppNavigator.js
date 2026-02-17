// navigation/AppNavigator.js

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { seedCategoriesForUser } from "../util/seedCategories";

// Screens
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import BottomTabs from "./BottomTabs";

import AddAccountScreen from "../screens/AddAccountScreen";
import AddCategoryScreen from "../screens/AddCategoryScreen";
import AddTransactionScreen from "../screens/AddTransactionScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import BudgetsScreen from "../screens/BudgetsScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import CategoryDetailsScreen from "../screens/CategoryDetailsScreen";
import GoalsScreen from "../screens/GoalsScreen";
import LabelsScreen from "../screens/LabelsScreen";
import LoansScreen from "../screens/LoansScreen";
import RecurringScreen from "../screens/RecurringScreen";
import TransactionsScreen from "../screens/TransactionsScreen";


const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
  setSession(session);

  if (session?.user) {
    await seedCategoriesForUser(session.user.id);
  }
});

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={BottomTabs} />

            <Stack.Screen name="AddTransaction" component={AddTransactionScreen} />
            <Stack.Screen name="Categories" component={CategoriesScreen} />
            <Stack.Screen name="CategoryDetails" component={CategoryDetailsScreen} />

            <Stack.Screen name="Budgets" component={BudgetsScreen} />
            <Stack.Screen name="Goals" component={GoalsScreen} />
            <Stack.Screen name="Labels" component={LabelsScreen} />
            <Stack.Screen name="Loans" component={LoansScreen} />
            <Stack.Screen name="Recurring" component={RecurringScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="Weekly Summary" component={TransactionsScreen} />
            <Stack.Screen name="AddCategory" component={AddCategoryScreen} />
            <Stack.Screen name="AddAccount" component={AddAccountScreen} />

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
