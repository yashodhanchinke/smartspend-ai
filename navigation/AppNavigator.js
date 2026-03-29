// navigation/AppNavigator.js

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { seedCategoriesForUser } from "../util/seedCategories";
import { startDeviceSmsListener } from "../util/smsNative";
import { ingestIncomingSmsForUser, syncSmsTransactionsForUser } from "../util/smsSync";

// Screens
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import BottomTabs from "./BottomTabs";

import AddAccountScreen from "../screens/AddAccountScreen";
import AddBudgetScreen from "../screens/AddBudgetScreen";
import AddCategoryScreen from "../screens/AddCategoryScreen";
import AddGoalScreen from "../screens/AddGoalScreen";
import AddLabelScreen from "../screens/AddLabelScreen";
import AddLoanScreen from "../screens/AddLoanScreen";
import AddRecurringScreen from "../screens/AddRecurringScreen";
import AddTransactionScreen from "../screens/AddTransactionScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import BudgetsScreen from "../screens/BudgetsScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import CalendarHeatmapScreen from "../screens/CalendarHeatmapScreen";
import CategoryDetailsScreen from "../screens/CategoryDetailsScreen";
import GoalsScreen from "../screens/GoalsScreen";
import LabelsScreen from "../screens/LabelsScreen";
import LoansScreen from "../screens/LoansScreen";
import RecurringScreen from "../screens/RecurringScreen";
import ReceiptScanScreen from "../screens/ReceiptScanScreen";
import TransactionsScreen from "../screens/TransactionsScreen";


const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const syncState = useRef({ inFlight: false, lastRunAt: 0 });
  const listenerCleanupRef = useRef(null);

  const runAutomaticSmsSync = async (userId, { force = false } = {}) => {
    if (!userId || syncState.current.inFlight) {
      return;
    }

    const now = Date.now();
    if (!force && now - syncState.current.lastRunAt < 60000) {
      return;
    }

    syncState.current.inFlight = true;

    try {
      await syncSmsTransactionsForUser(userId);
      syncState.current.lastRunAt = Date.now();
    } catch (error) {
      console.warn("Automatic SMS sync failed:", error?.message || error);
    } finally {
      syncState.current.inFlight = false;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);

      if (data.session?.user?.id) {
        await seedCategoriesForUser(data.session.user.id);
        await runAutomaticSmsSync(data.session.user.id, { force: true });
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user) {
        await seedCategoriesForUser(session.user.id);
        await runAutomaticSmsSync(session.user.id, { force: true });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      return undefined;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runAutomaticSmsSync(session.user.id);
      }
    });

    return () => subscription.remove();
  }, [session?.user?.id]);

  useEffect(() => {
    listenerCleanupRef.current?.();
    listenerCleanupRef.current = null;

    if (!session?.user?.id) {
      return undefined;
    }

    listenerCleanupRef.current = startDeviceSmsListener(async (sms) => {
      try {
        await ingestIncomingSmsForUser(session.user.id, sms);
      } catch (error) {
        console.warn("Incoming SMS processing failed:", error?.message || error);
      }
    });

    return () => {
      listenerCleanupRef.current?.();
      listenerCleanupRef.current = null;
    };
  }, [session?.user?.id]);

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
            <Stack.Screen name="UpdateTransaction" component={AddTransactionScreen} />
            <Stack.Screen name="Categories" component={CategoriesScreen} />
            <Stack.Screen name="Calendar Heatmap" component={CalendarHeatmapScreen} />
            <Stack.Screen name="CategoryDetails" component={CategoryDetailsScreen} />

            <Stack.Screen name="Budgets" component={BudgetsScreen} />
            <Stack.Screen name="AddBudget" component={AddBudgetScreen} />
            <Stack.Screen name="UpdateBudget" component={AddBudgetScreen} />
            <Stack.Screen name="Goals" component={GoalsScreen} />
            <Stack.Screen name="Labels" component={LabelsScreen} />
            <Stack.Screen name="Loans" component={LoansScreen} />
            <Stack.Screen name="Recurring" component={RecurringScreen} />
            <Stack.Screen name="AddGoal" component={AddGoalScreen} />
            <Stack.Screen name="UpdateGoal" component={AddGoalScreen} />
            <Stack.Screen name="AddLabel" component={AddLabelScreen} />
            <Stack.Screen name="UpdateLabel" component={AddLabelScreen} />
            <Stack.Screen name="AddLoan" component={AddLoanScreen} />
            <Stack.Screen name="UpdateLoan" component={AddLoanScreen} />
            <Stack.Screen name="AddRecurring" component={AddRecurringScreen} />
            <Stack.Screen name="UpdateRecurring" component={AddRecurringScreen} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
            <Stack.Screen name="Weekly Summary" component={TransactionsScreen} />
            <Stack.Screen name="AddCategory" component={AddCategoryScreen} />
            <Stack.Screen name="UpdateCategory" component={AddCategoryScreen} />
            <Stack.Screen name="AddAccount" component={AddAccountScreen} />
            <Stack.Screen name="UpdateAccount" component={AddAccountScreen} />
            <Stack.Screen name="ReceiptScan" component={ReceiptScanScreen} />

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
