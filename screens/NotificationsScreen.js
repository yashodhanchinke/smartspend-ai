import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { useNotifications } from "../context/NotificationContext";
import colors from "../theme/colors";

function getToneIcon(tone) {
  if (tone === "critical") return "alert-triangle";
  if (tone === "warning") return "alert-circle";
  if (tone === "attention") return "bell";
  return "check-circle";
}

function getToneTint(tone) {
  if (tone === "critical") return "#ff7c67";
  if (tone === "warning") return "#ffae57";
  if (tone === "attention") return "#ffd166";
  return "#7fd1ae";
}

function formatCreatedAt(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getModuleTarget(module) {
  if (module === "budget") return "Budgets";
  if (module === "loan") return "Loans";
  if (module === "goal") return "Goals";
  if (module === "recurring") return "Recurring";
  return null;
}

export default function NotificationsScreen({ navigation }) {
  const {
    notifications,
    loading,
    refreshNotifications,
    generateNotifications,
    markNotificationRead,
  } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
    }, [refreshNotifications])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await generateNotifications({ force: true });
      await refreshNotifications();
    } finally {
      setRefreshing(false);
    }
  }, [generateNotifications, refreshNotifications]);

  const handleOpenNotification = useCallback(async (notification) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
    }

    const target = getModuleTarget(notification.source_module);
    if (target) {
      navigation.navigate(target);
    }
  }, [markNotificationRead, navigation]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScreenHeader title="Notifications" />

      {loading && !notifications.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.gold}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {!notifications.length ? (
            <View style={styles.emptyCard}>
              <Feather name="bell-off" size={52} color="#d8c8c0" />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtitle}>
                Check back later.
              </Text>
            </View>
          ) : (
            notifications.map((notification) => {
              const tintColor = getToneTint(notification.tone);
              const isUnread = !notification.read_at;

              return (
                <Pressable
                  key={notification.id}
                  style={[styles.card, isUnread && styles.cardUnread]}
                  onPress={() => handleOpenNotification(notification)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: `${tintColor}22` }]}>
                    <Feather name={getToneIcon(notification.tone)} size={20} color={tintColor} />
                  </View>

                  <View style={styles.cardCopy}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{notification.title}</Text>
                      <View style={[styles.statePill, isUnread ? styles.statePillUnread : styles.statePillRead]}>
                        <Text style={styles.statePillText}>{isUnread ? "Unread" : "Read"}</Text>
                      </View>
                    </View>

                    <Text style={styles.cardMessage}>{notification.body}</Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>{formatCreatedAt(notification.created_at)}</Text>
                      <Text style={styles.metaText}>
                        {notification.source_module ? notification.source_module.toUpperCase() : "NUDGE"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },
  emptySubtitle: {
    color: "#d7cfc7",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardUnread: {
    borderColor: colors.gold,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardCopy: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  cardMessage: {
    color: "#d7cfc7",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  statePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statePillUnread: {
    backgroundColor: "#7a4d37",
  },
  statePillRead: {
    backgroundColor: "#35513c",
  },
  statePillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
});
