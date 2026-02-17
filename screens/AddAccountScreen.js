import { useState } from "react";
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

export default function AddAccountScreen({ navigation }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [type, setType] = useState("bank");
  const [color, setColor] = useState("#1f4e79");

  const saveAccount = async () => {
    if (!name) {
      Alert.alert("Error", "Enter account name");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("accounts").insert([
      {
        user_id: user.id,
        name,
        balance: parseFloat(balance || 0),
        type,
        color,
      },
    ]);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Success 🎉", "Account created");
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={{ padding: 20 }}>
        <Text style={styles.title}>Add Account</Text>

        <TextInput
          style={styles.input}
          placeholder="Account name"
          placeholderTextColor="#aaa"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Initial balance"
          placeholderTextColor="#aaa"
          keyboardType="numeric"
          value={balance}
          onChangeText={setBalance}
        />

        <View style={styles.row}>
          {["bank", "cash"].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && styles.active]}
              onPress={() => setType(t)}
            >
              <Text style={{ color: type === t ? "#000" : "#fff" }}>
                {t.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveAccount}>
          <Text style={{ textAlign: "center", fontWeight: "700" }}>
            Add
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#1a0f0a" },
  title: { color: "#f5b38a", fontSize: 24, fontWeight: "700", marginBottom: 20 },
  input: {
    backgroundColor: "#2a1a14",
    padding: 14,
    borderRadius: 12,
    color: "#fff",
    marginBottom: 14,
  },
  row: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#333",
    alignItems: "center",
  },
  active: { backgroundColor: "#f5b38a" },
  saveBtn: {
    backgroundColor: "#f5b38a",
    padding: 16,
    borderRadius: 14,
    marginTop: 20,
  },
});
