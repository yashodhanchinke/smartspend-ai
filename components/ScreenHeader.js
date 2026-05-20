import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NotificationBell from "./NotificationBell";
import colors from "../theme/colors";

export default function ScreenHeader({
  title,
  notificationCount = 0,
  onNotificationPress,
  showNotification = true,
}) {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Feather name="arrow-left" size={26} color={colors.text} />
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {showNotification ? (
        <NotificationBell count={notificationCount} onPress={onNotificationPress} />
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    marginLeft: 14,
    flex: 1,
  },
  placeholder: {
    width: 44,
    height: 44,
  },
});
