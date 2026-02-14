// screens/AddCategoryScreen.js

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const COLORS = [
  "#FF4444", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#2196F3", "#03A9F4",
  "#00BCD4", "#009688", "#4CAF50", "#8BC34A", "#CDDC39", "#FFEB3B", "#FFC107",
  "#FF9800", "#FF5722", "#795548", "#607D8B", "#9E9E9E",
  "#F5E6E0", "#E6B8B7", "#D98880", "#E57373", "#EF5350",
  "#F44336", "#E53935", "#D32F2F"
];

export default function AddCategoryScreen({ navigation }) {
  const [type, setType] = useState("expense");
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState("#FF4444");

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Please enter category name");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { error } = await supabase.from("categories").insert([
      {
        user_id: user.id,
        name,
        type,
        icon: "tag",
        color: selectedColor,
      },
    ]);

    if (error) {
      Alert.alert(error.message);
    } else {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={26}
              color="#fff"
            />
          </TouchableOpacity>

          <Text style={styles.title}>Add Category</Text>

          <View style={{ width: 26 }} />
        </View>

        {/* TYPE TOGGLE */}
        <View style={styles.typeRow}>
          {["expense", "income"].map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.typeBtn,
                type === item && styles.typeActive,
              ]}
              onPress={() => setType(item)}
            >
              <Text
                style={[
                  styles.typeText,
                  type === item && styles.typeTextActive,
                ]}
              >
                {item === "expense" ? "Expense" : "Income"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CATEGORY NAME INPUT */}
        <View style={styles.inputCard}>
          <TextInput
            placeholder="Enter category name"
            placeholderTextColor="#aaa"
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
        </View>

        {/* COLORS */}
        <Text style={styles.sectionTitle}>Colors</Text>

        <View style={styles.colorGrid}>
          {COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorCircle,
                { backgroundColor: color },
                selectedColor === color && styles.selectedColor,
              ]}
              onPress={() => setSelectedColor(color)}
            >
              {selectedColor === color && (
                <MaterialCommunityIcons
                  name="check"
                  size={18}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      {/* SAVE BUTTON */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <MaterialCommunityIcons name="content-save" size={22} color="#000" />
        <Text style={styles.saveText}>Add</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#2B1A14",
  },

  container: {
    padding: 20,
    paddingBottom: 120,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  title: {
    color: "#EEDDD2",
    fontSize: 22,
    fontWeight: "700",
  },

  typeRow: {
    flexDirection: "row",
    backgroundColor: "#3A241C",
    borderRadius: 14,
    marginBottom: 20,
  },

  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 14,
  },

  typeActive: {
    backgroundColor: "#F8C7A0",
  },

  typeText: {
    color: "#C8B8AF",
    fontWeight: "600",
  },

  typeTextActive: {
    color: "#000",
    fontWeight: "700",
  },

  inputCard: {
    backgroundColor: "#3A241C",
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
  },

  input: {
    color: "#fff",
  },

  sectionTitle: {
    color: "#EEDDD2",
    fontSize: 16,
    marginBottom: 10,
  },

  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    margin: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  selectedColor: {
    borderWidth: 2,
    borderColor: "#fff",
  },

  saveBtn: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: "#F8C7A0",
    padding: 16,
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  saveText: {
    marginLeft: 8,
    fontWeight: "700",
    color: "#000",
  },
});
