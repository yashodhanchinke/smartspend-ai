// screens/CategoriesScreen.js

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

export default function CategoriesScreen({ navigation }) {
  const [tab, setTab] = useState("expense");
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // 🔁 Fetch data every time screen opens
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const fetchData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) return;

    const { data: catData } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id);

    const { data: txData } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id);

    setCategories(catData || []);
    setTransactions(txData || []);
  };

  // Filter by tab
  const filteredCategories = categories.filter(
    (cat) => cat.type === tab
  );

  const getCategoryStats = (categoryId) => {
    const related = transactions.filter(
      (t) => t.category_id === categoryId
    );

    const total = related.reduce((sum, t) => sum + Number(t.amount), 0);

    return {
      count: related.length,
      total,
    };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" color="#fff" size={26} />
        </TouchableOpacity>

        <Text style={styles.title}>Categories</Text>

        <MaterialCommunityIcons name="filter-variant" color="#fff" size={26} />
      </View>

      {/* LIST */}
      <FlatList
        data={filteredCategories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item }) => {
          const stats = getCategoryStats(item.id);

          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("CategoryDetails", { category: item })
              }
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: item.color + "33" },
                ]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  color={item.color}
                  size={26}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.catTitle}>{item.name}</Text>

                <Text style={styles.subtitle}>
                  {stats.count}{" "}
                  {stats.count === 1
                    ? "transaction"
                    : "transactions"}
                </Text>
              </View>

              <Text style={styles.amount}>
                ₹ {stats.total.toFixed(2)}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Bottom Tabs */}
      <View style={styles.bottomTabs}>
        {["expense", "income"].map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setTab(type)}
            style={[
              styles.tabBtn,
              tab === type && styles.tabBtnActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                tab === type && styles.tabTextActive,
              ]}
            >
              {type === "expense" ? "Expense" : "Income"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddCategory")}
      >
        <MaterialCommunityIcons name="plus" color="#000" size={28} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#2B1A14" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    justifyContent: "space-between",
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#EEDDD2",
  },

  row: {
    flexDirection: "row",
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: "#3A241C",
    alignItems: "center",
  },

  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },

  catTitle: {
    color: "#F8EDE3",
    fontWeight: "700",
    fontSize: 16,
  },

  subtitle: {
    color: "#C8B8AF",
    fontSize: 13,
  },

  amount: {
    color: "#EEDDD2",
    fontWeight: "700",
  },

  bottomTabs: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#23150F",
    padding: 10,
    justifyContent: "space-around",
  },

  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },

  tabBtnActive: {
    backgroundColor: "#F8C7A0",
  },

  tabText: { color: "#C8B8AF", fontWeight: "600", fontSize: 14 },
  tabTextActive: { color: "#000", fontWeight: "700" },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 80,
    backgroundColor: "#F8C7A0",
    width: 58,
    height: 58,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
});
