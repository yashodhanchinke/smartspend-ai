import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");

export default function AccountsScreen({ navigation }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [transactions, setTransactions] = useState([]);

  const flatRef = useRef();

  /* ================= REFRESH ON SCREEN FOCUS ================= */
  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [])
  );

  /* ================= FETCH ACCOUNTS ================= */
  const fetchAccounts = async () => {
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at");

    if (!data || data.length === 0) {
      setAccounts([
        {
          id: "bank-default",
          name: "Bank",
          balance: 0,
          color: "#1f4e79",
        },
        {
          id: "cash-default",
          name: "Cash",
          balance: 0,
          color: "#295f2d",
        },
      ]);
    } else {
      setAccounts(data);
    }

    setSelectedIndex(0);
    if (data?.length) fetchTransactions(data[0].id);
  };

  /* ================= FETCH TRANSACTIONS ================= */
  const fetchTransactions = async (accountId) => {
    const { data } = await supabase
      .from("transactions")
      .select("*, categories(name,color)")
      .eq("account_id", accountId)
      .order("date", { ascending: false });

    setTransactions(data || []);
  };

  /* ================= HANDLE SLIDE ================= */
  const handleScrollEnd = (e) => {
    const index = Math.round(
      e.nativeEvent.contentOffset.x / width
    );
    setSelectedIndex(index);

    const accountId = accounts[index]?.id;
    if (accountId) fetchTransactions(accountId);
  };

  /* ================= CARD ================= */
  const renderCard = ({ item }) => (
    <View
      style={[
        styles.accountCard,
        { backgroundColor: item.color || "#333" },
      ]}
    >
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.accountTitle}>{item.name}</Text>
          <Text style={styles.accountUser}>Yash</Text>
        </View>
        <Ionicons
          name={
            item.name === "Cash"
              ? "cash-outline"
              : "business-outline"
          }
          size={24}
          color="#fff"
        />
      </View>

      <Text style={styles.balanceLabel}>Total balance</Text>
      <Text style={styles.balanceValue}>
        ₹{item.balance?.toFixed(2) || "0.00"}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ===== ACCOUNT SLIDER ===== */}
      <FlatList
        ref={flatRef}
        data={accounts}
        renderItem={renderCard}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={handleScrollEnd}
      />

      {/* ===== DOT INDICATOR ===== */}
      <View style={styles.dots}>
        {accounts.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              selectedIndex === i && styles.activeDot,
            ]}
          />
        ))}
      </View>

      {/* ===== SUMMARY ===== */}
      <View style={styles.compareRow}>
        <View>
          <Text style={styles.compareLabel}>Income</Text>
          <Text style={styles.income}>₹0.00 ↑0.00%</Text>
          <Text style={styles.compareSub}>
            Compared to last month
          </Text>
        </View>

        <View>
          <Text style={styles.compareLabel}>Expense</Text>
          <Text style={styles.expense}>₹0.00 ↑0.00%</Text>
          <Text style={styles.compareSub}>
            Compared to last month
          </Text>
        </View>
      </View>

      {/* ===== TRANSACTIONS ===== */}
      <ScrollView style={{ marginTop: 20 }}>
        {transactions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="wallet-outline"
              size={48}
              color="#aaa"
            />
            <Text style={styles.emptyTitle}>
              No transactions found for Yash
            </Text>
            <Text style={styles.emptySub}>
              Please add transactions to this account
            </Text>
          </View>
        ) : (
          transactions.map((t) => (
            <View key={t.id} style={styles.txRow}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View
                  style={[
                    styles.catIcon,
                    {
                      backgroundColor:
                        t.categories?.color || "#444",
                    },
                  ]}
                />
                <View>
                  <Text style={styles.txTitle}>
                    {t.title}
                  </Text>
                  <Text style={styles.txSub}>
                    {t.categories?.name}
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  color:
                    t.type === "expense"
                      ? "#ff8b8b"
                      : "#6ddf9c",
                  fontWeight: "700",
                }}
              >
                {t.type === "expense" ? "-" : "+"}₹
                {t.amount}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* ===== ADD ACCOUNT BUTTON ===== */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddAccount")}
      >
        <Ionicons name="add" size={26} color="#000" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#1a0f0a" },

  accountCard: {
    width: width - 40,
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 20,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  accountTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  accountUser: { color: "#ddd", fontSize: 13 },

  balanceLabel: { color: "#ddd", fontSize: 13 },
  balanceValue: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    marginTop: 6,
  },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 5,
    backgroundColor: "#555",
    marginHorizontal: 4,
  },

  activeDot: { backgroundColor: "#f5b38a", width: 16 },

  compareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 10,
  },

  compareLabel: { color: "#ccc", fontSize: 13 },
  income: { color: "#6ddf9c", fontWeight: "700", marginTop: 4 },
  expense: { color: "#ff8b8b", fontWeight: "700", marginTop: 4 },
  compareSub: { color: "#aaa", fontSize: 11 },

  empty: {
    alignItems: "center",
    marginTop: 60,
  },

  emptyTitle: { color: "#fff", marginTop: 12, fontWeight: "700" },
  emptySub: { color: "#aaa", marginTop: 6, fontSize: 12 },

  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },

  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },

  txTitle: { color: "#fff", fontWeight: "600" },
  txSub: { color: "#aaa", fontSize: 12 },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    backgroundColor: "#f5b38a",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
