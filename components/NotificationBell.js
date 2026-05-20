import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNotifications } from "../context/NotificationContext";
import colors from "../theme/colors";

export default function NotificationBell({ count = 0, onPress, style }) {
  const navigation = useNavigation();
  const { unreadCount } = useNotifications();
  const visibleCount = typeof count === "number" && count > 0 ? count : unreadCount;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    navigation.navigate("Notifications");
  };

  return (
    <TouchableOpacity style={[styles.button, style]} onPress={handlePress} activeOpacity={0.85}>
      <Feather name="bell" size={20} color={colors.text} />
      {visibleCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{visibleCount > 9 ? "9+" : visibleCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff7c67",
    borderWidth: 1,
    borderColor: colors.background,
  },
  badgeText: {
    color: "#fff7f4",
    fontSize: 10,
    fontWeight: "800",
  },
});
