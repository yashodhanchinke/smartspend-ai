import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import ColorPickerTabs from "../components/ColorPickerTabs";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const LABEL_COLORS = ["#FF4B3E", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#1E88E5", "#14A3E6", "#18B4C9", "#169C92", "#4CAF50", "#8BC34A", "#D4E629", "#FFEB3B", "#FFC107", "#FF9800", "#FF5722", "#8D6656", "#6E8898", "#A5A5A5", "#F0DEE2", "#F2C2CB", "#E9969E", "#E97779", "#F2524E", "#FF4433", "#EF3B39", "#DF2F2F", "#C62828"];

export default function AddLabelScreen({ navigation }) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState("#FF4433");
  const [saving, setSaving] = useState(false);

  const saveLabel = async () => {
    if (!name.trim()) return Alert.alert("Error", "Enter label name");
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");
      const { error } = await supabase.from("labels").insert([{ user_id: user.id, name: name.trim(), color: selectedColor }]);
      if (error) throw error;
      Alert.alert("Success", "Label saved successfully.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not save label.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Add label" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <TextInput style={styles.input} placeholder="Enter label name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
        <Text style={styles.sectionTitle}>Colors</Text>
        <ColorPickerTabs palette={LABEL_COLORS} selectedColor={selectedColor} onSelectColor={setSelectedColor} />
      </ScrollView>
      <Pressable style={styles.saveButton} onPress={saveLabel} disabled={saving}>
        <MaterialCommunityIcons name="content-save-outline" size={24} color="#2f1814" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#24130f" },
  content: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 120 },
  input: { height: 76, borderRadius: 22, borderWidth: 1, borderColor: "#3d2620", backgroundColor: "#24130f", paddingHorizontal: 20, color: colors.text, fontSize: 20, fontWeight: "600", marginBottom: 24 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  saveButton: { position: "absolute", left: 24, right: 24, bottom: 22, height: 70, borderRadius: 35, backgroundColor: "#ffb49a", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  saveButtonText: { color: "#2f1814", fontSize: 20, fontWeight: "800" },
});
