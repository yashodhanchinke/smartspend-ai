import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>

        {/* Header */}
        <Text style={styles.title}>Profile</Text>

        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color="#000" />
          </View>
          <Text style={styles.changePhoto}>Change Photo</Text>
        </View>

        {/* Name */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            placeholder="Your name"
            placeholderTextColor="#999"
            style={styles.input}
            defaultValue="Yash"
          />
        </View>

        {/* Email */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            placeholder="you@email.com"
            placeholderTextColor="#999"
            style={styles.input}
            defaultValue="user@example.com"
            keyboardType="email-address"
          />
        </View>

        {/* Phone */}
        <View style={styles.inputCard}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            placeholder="Optional"
            placeholderTextColor="#999"
            style={styles.input}
            keyboardType="phone-pad"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn}>
          <Text style={styles.saveText}>Save Changes</Text>
        </TouchableOpacity>

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

  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
  },

  avatarWrapper: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    backgroundColor: "#f5b38a",
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  changePhoto: {
    color: "#f5b38a",
    fontSize: 12,
    marginTop: 6,
  },

  inputCard: {
    backgroundColor: "#2a1b14",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  label: {
    color: "#ccc",
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    color: "#fff",
    fontSize: 15,
  },

  saveBtn: {
    backgroundColor: "#f5b38a",
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
    marginTop: 20,
  },
  saveText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
});
