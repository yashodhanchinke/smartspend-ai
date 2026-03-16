import { Alert } from "react-native";

export function showTransactionEntryOptions(navigation, params = {}) {
  Alert.alert("Add Transaction", "Choose how you want to add the transaction.", [
    {
      text: "Receipt Scan",
      onPress: () => navigation.navigate("ReceiptScan", params),
    },
    {
      text: "Manual Add",
      onPress: () => navigation.navigate("AddTransaction", params),
    },
    {
      text: "Cancel",
      style: "cancel",
    },
  ]);
}
