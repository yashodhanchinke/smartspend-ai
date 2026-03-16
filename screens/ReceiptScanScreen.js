import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";
import { saveTransaction } from "../util/saveTransaction";

function normalizeDate(value) {
  if (!value) {
    return new Date().toISOString().split("T")[0];
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().split("T")[0];
  }

  return parsed.toISOString().split("T")[0];
}

export default function ReceiptScanScreen({ navigation, route }) {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [type, setType] = useState("expense");
  const [imageUri, setImageUri] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const visibleCategories = useMemo(
    () => categories.filter((item) => item.type === type),
    [categories, type]
  );

  const loadBaseData = useCallback(async () => {
    const [{ data: accountData }, { data: categoryData }] = await Promise.all([
      supabase.from("accounts").select("*").order("created_at"),
      supabase.from("categories").select("*").order("name"),
    ]);

    const nextAccounts = accountData || [];
    const nextCategories = categoryData || [];

    setAccounts(nextAccounts);
    setCategories(nextCategories);

    const preselectedAccountId = route?.params?.accountId;
    const defaultAccount =
      nextAccounts.find((item) => item.id === preselectedAccountId) || nextAccounts[0] || null;

    setSelectedAccount(defaultAccount);
  }, [route?.params?.accountId]);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  const scanAsset = async (asset) => {
    if (!asset?.base64) {
      Alert.alert("Error", "Could not read the selected image.");
      return;
    }

    if (!selectedAccount) {
      Alert.alert("Error", "Please select an account first.");
      return;
    }

    setImageUri(asset.uri || "");
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error("User session not found.");
      }

      const { data, error } = await supabase.functions.invoke("scan-receipt-ocr", {
        body: {
          userId: user.id,
          imageBase64: asset.base64,
          mimeType: asset.mimeType || "image/jpeg",
          categories: categories.map((item) => ({
            name: item.name,
            type: item.type,
          })),
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const parsedType = data?.type === "income" ? "income" : "expense";
      const parsedAmount = Number(data?.amount || 0);
      const parsedDate = normalizeDate(data?.date);
      const parsedTitle =
        data?.title?.trim() || data?.merchant?.trim() || "Receipt transaction";
      const matchedCategory =
        categories.find(
          (item) =>
            item.type === parsedType &&
            item.name.toLowerCase() === String(data?.suggestedCategoryName || "").toLowerCase()
        ) || null;

      setType(parsedType);
      setSelectedCategory(matchedCategory);
      setOcrText(data?.rawText || "");
      setTitle(parsedTitle);
      setAmount(parsedAmount ? String(parsedAmount) : "");
      setTxDate(parsedDate);

      if (!parsedAmount) {
        throw new Error("Receipt scanned, but amount could not be detected.");
      }

      await saveTransaction({
        userId: data.userId,
        type: parsedType,
        title: parsedTitle,
        amount: parsedAmount,
        description: `Receipt scan${data?.merchant ? ` - ${data.merchant}` : ""}`,
        date: parsedDate,
        accountId: selectedAccount.id,
        categoryId: matchedCategory?.id || null,
      });

      setLoading(false);
      Alert.alert("Success", "Receipt scanned and transaction saved.");
      navigation.goBack();
    } catch (error) {
      setLoading(false);
      Alert.alert("Scan Error", error.message || "Receipt scan failed.");
    }
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow photo access to scan receipts.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      scanAsset(result.assets[0]);
    }
  };

  const captureWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission needed", "Please allow camera access to scan receipts.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      scanAsset(result.assets[0]);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Receipt Scan</Text>
        <Text style={styles.subtitle}>
          Choose an account, then upload a receipt or take a photo. The app will scan it and save the transaction automatically.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Account</Text>
          <View style={styles.wrap}>
            {accounts.map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[
                  styles.choiceCard,
                  selectedAccount?.id === account.id && styles.choiceCardActive,
                ]}
                onPress={() => setSelectedAccount(account)}
              >
                <Text style={styles.choiceTitle}>{account.name}</Text>
                <Text style={styles.choiceSub}>₹{Number(account.balance || 0).toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={captureWithCamera}>
            <Ionicons name="camera-outline" size={24} color="#2b170f" />
            <Text style={styles.actionText}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={pickFromGallery}>
            <Ionicons name="image-outline" size={24} color="#2b170f" />
            <Text style={styles.actionText}>Upload Image</Text>
          </TouchableOpacity>
        </View>

        {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : null}

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Last Scan</Text>
          <DetailRow label="Type" value={type} />
          <DetailRow label="Title" value={title || "-"} />
          <DetailRow label="Amount" value={amount ? `₹${amount}` : "-"} />
          <DetailRow label="Date" value={txDate} />
          <DetailRow
            label="Category"
            value={selectedCategory?.name || "Auto category not found"}
          />
        </View>

        {ocrText ? (
          <View style={styles.rawCard}>
            <Text style={styles.sectionTitle}>Extracted Text</Text>
            <Text style={styles.rawText}>{ocrText}</Text>
          </View>
        ) : null}

        {loading ? <Text style={styles.loadingText}>Scanning receipt and saving transaction...</Text> : null}

        {visibleCategories.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detected Type Categories</Text>
            <View style={styles.wrap}>
              {visibleCategories.slice(0, 8).map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.miniChip,
                    selectedCategory?.id === item.id && styles.miniChipActive,
                  ]}
                >
                  <Text style={styles.miniChipText}>{item.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 40 },
  title: { color: colors.gold, fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#ccb2a3", marginTop: 8, lineHeight: 21 },
  section: { marginTop: 22 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choiceCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    minWidth: 120,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  choiceCardActive: {
    borderColor: colors.gold,
    backgroundColor: "#503429",
  },
  choiceTitle: { color: "#fff", fontWeight: "700" },
  choiceSub: { color: "#d2b7a8", marginTop: 4, fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 14, marginTop: 24 },
  actionCard: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 22,
    gap: 8,
  },
  actionText: { color: "#2b170f", fontWeight: "800", fontSize: 15 },
  preview: {
    width: "100%",
    height: 220,
    borderRadius: 24,
    marginTop: 22,
    backgroundColor: "#241611",
  },
  detailsCard: {
    marginTop: 22,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#3d2922",
  },
  detailLabel: { color: "#c9ada1", fontSize: 13 },
  detailValue: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  rawCard: {
    marginTop: 18,
    backgroundColor: "#241611",
    borderRadius: 20,
    padding: 16,
  },
  rawText: { color: "#f1dfd5", lineHeight: 20 },
  loadingText: {
    color: colors.gold,
    marginTop: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  miniChip: {
    backgroundColor: "#2a1b14",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#4a332d",
  },
  miniChipActive: {
    borderColor: colors.gold,
  },
  miniChipText: { color: "#f3e5dc", fontSize: 12, fontWeight: "600" },
});
