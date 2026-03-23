import Feather from "@expo/vector-icons/Feather";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../theme/colors";

export default function ThemedNoticeModal({
  visible,
  title,
  message,
  tone = "error",
  buttonLabel = "Close",
  onClose,
}) {
  const iconName = tone === "success" ? "check-circle" : "alert-circle";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View
            style={[
              styles.iconWrap,
              tone === "success" ? styles.successIconWrap : styles.errorIconWrap,
            ]}
          >
            <Feather
              name={iconName}
              size={22}
              color={tone === "success" ? "#92f3a0" : "#ffb19f"}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(20, 11, 8, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#33211c",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 221, 203, 0.08)",
    padding: 24,
  },

  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  errorIconWrap: {
    backgroundColor: "rgba(255, 145, 120, 0.12)",
  },

  successIconWrap: {
    backgroundColor: "rgba(111, 224, 136, 0.12)",
  },

  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },

  message: {
    color: "#d9c0b4",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },

  button: {
    marginTop: 20,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
  },

  buttonText: {
    color: "#24140f",
    fontSize: 15,
    fontWeight: "800",
  },
});
