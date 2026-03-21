import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ColorPickerTabs from "../components/ColorPickerTabs";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { getAccountColor, getAccountIconName } from "../util/accountAppearance";

const ACCOUNT_TYPES = [
  { key: "bank", label: "Bank" },
  { key: "cash", label: "Cash" },
];

const ACCOUNT_COLORS = [
  "#FF4B3E",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#1E88E5",
  "#14A3E6",
  "#18B4C9",
  "#169C92",
  "#4CAF50",
  "#8BC34A",
  "#D4E629",
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#8D6656",
  "#6E8898",
  "#A5A5A5",
  "#F0DEE2",
  "#F2C2CB",
  "#E9969E",
  "#E97779",
  "#F2524E",
  "#FF4433",
  "#EF3B39",
  "#DF2F2F",
  "#C62828",
];

export default function AddAccountScreen({ navigation }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [type, setType] = useState("bank");
  const [color, setColor] = useState("");
  const [icon, setIcon] = useState("business-outline");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setColor((current) => current || getAccountColor({ name, type }));
    setIcon(getAccountIconName({ name, type }));
  }, [name, type]);

  const saveAccount = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Enter account name");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      const payload = {
        user_id: user.id,
        name: name.trim(),
        type,
        balance: parseFloat(balance || 0),
        color: color || getAccountColor({ name, type }),
        icon,
        is_default: isDefault,
      };

      const { error } = await supabase.from("accounts").insert([payload]);

      if (error) {
        throw error;
      }

      Alert.alert("Success", "Account created");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not create account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Add Account" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.inlineField}>
          <View style={[styles.leadingIcon, { backgroundColor: color || "#8f675c" }]}>
            <Ionicons name={icon} size={24} color="#f7ddd4" />
          </View>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            placeholder="Enter account name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account Type</Text>
          <View style={styles.typeWrap}>
            {ACCOUNT_TYPES.map((item) => {
              const isActive = type === item.key;

              return (
                <Pressable
                  key={item.key}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                  onPress={() => setType(item.key)}
                >
                  <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Initial amount"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          value={balance}
          onChangeText={setBalance}
        />

        <View style={styles.defaultRow}>
          <View>
            <Text style={styles.defaultTitle}>Set as default account</Text>
            <Text style={styles.defaultSubtitle}>Saves future transactions to this account faster.</Text>
          </View>
          <Switch
            value={isDefault}
            onValueChange={setIsDefault}
            thumbColor={isDefault ? "#ffb49a" : "#d8c3ba"}
            trackColor={{ false: "#4a342e", true: "#6b681c" }}
          />
        </View>

        <Text style={styles.sectionTitle}>Colors</Text>
        <ColorPickerTabs
          palette={ACCOUNT_COLORS}
          selectedColor={color || getAccountColor({ name, type })}
          onSelectColor={setColor}
        />
      </ScrollView>

      <Pressable style={styles.saveButton} onPress={saveAccount} disabled={saving}>
        <Feather name="save" size={22} color="#2f1814" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Add"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#24130f",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 120,
  },
  inlineField: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  leadingIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 18,
  },
  input: {
    height: 76,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3d2620",
    backgroundColor: "#24130f",
    paddingHorizontal: 20,
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 18,
  },
  inlineInput: {
    flex: 1,
    marginBottom: 0,
  },
  sectionCard: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  typeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  typeChip: {
    minWidth: "30%",
    backgroundColor: "#6b681c",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  typeChipActive: {
    backgroundColor: "#ffb49a",
  },
  typeChipText: {
    color: "#f8e8d7",
    fontSize: 16,
    fontWeight: "700",
  },
  typeChipTextActive: {
    color: "#2f1814",
  },
  defaultRow: {
    backgroundColor: "#33211d",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4f3831",
    padding: 18,
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  defaultTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  defaultSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 230,
  },
  saveButton: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 22,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#ffb49a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  saveButtonText: {
    color: "#2f1814",
    fontSize: 20,
    fontWeight: "800",
  },
});
