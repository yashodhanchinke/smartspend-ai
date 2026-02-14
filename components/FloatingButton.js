// components/FloatingButton.js
import Feather from "@expo/vector-icons/Feather";
import { StyleSheet, TouchableOpacity } from "react-native";

export default function FloatingButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress}>
      <Feather name="plus" size={26} color="#000" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 30,
    right: 30,
    backgroundColor: "#f8c7a0",
    padding: 18,
    borderRadius: 40,
    elevation: 10,
  },
});
