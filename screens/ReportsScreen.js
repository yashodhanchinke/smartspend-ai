import { Ionicons } from "@expo/vector-icons";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReportsScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>

          <TouchableOpacity style={styles.filterBtn}>
            <Ionicons name="filter-outline" size={20} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Empty State */}
        <View style={styles.empty}>
          <Ionicons
            name="pie-chart-outline"
            size={64}
            color="#999"
          />

          <Text style={styles.emptyTitle}>
            No reports data
          </Text>

          <Text style={styles.emptySub}>
            Add transactions to generate reports
          </Text>

          <TouchableOpacity style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color="#000" />
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#1a0f0a",
  },
  container: {
    flex: 1,
    padding: 16,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  filterBtn: {
    backgroundColor: "#f5b38a",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Empty State */
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -40,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
  },
  emptySub: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 30,
  },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5b38a",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  refreshText: {
    color: "#000",
    fontWeight: "700",
    marginLeft: 6,
  },
});
