import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StyleSheet, Text, View } from "react-native";

import AccountsScreen from "../screens/AccountsScreen";
import HomeScreen from "../screens/HomeScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ReportsScreen from "../screens/ReportsScreen";

const Tab = createBottomTabNavigator();

function TabIcon({ icon, label, focused }) {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={icon}
        size={22}
        color={focused ? "#ffcc99" : "#b49a8a"}
      />
      <Text
        style={[
          styles.label,
          { color: focused ? "#ffcc99" : "#b49a8a" },
        ]}
        numberOfLines={1} // 🔥 Prevent text from breaking into 2 lines
      >
        {label}
      </Text>
    </View>
  );
}

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home" label="Home" focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="wallet" label="Accounts" focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="pie-chart-outline" label="Reports" focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#2c1e1a",
    height: 72,
    borderTopColor: "#3a2722",
    paddingBottom: 6,
    paddingTop: 6,
  },

  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 80, // 🔥 Prevent label from wrapping
  },

  label: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
});
