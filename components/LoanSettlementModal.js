import Feather from "@expo/vector-icons/Feather";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../theme/colors";

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export default function LoanSettlementModal({
  visible,
  loan,
  loading = false,
  onClose,
  onConfirm,
}) {
  if (!loan) {
    return null;
  }

  const isBorrowing = loan.type === "borrowing";
  const title = isBorrowing ? "Borrowing due today" : "Lending due today";
  const actionLabel = loading
    ? "Updating..."
    : isBorrowing
    ? "Confirm repayment"
    : "Confirm received";
  const helperText = isBorrowing
    ? "Confirm this repayment to deduct it from your main account and include it in expense totals."
    : "Confirm this receipt to add it to your main account and include it in income totals.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, isBorrowing ? styles.borrowIconWrap : styles.lendIconWrap]}>
            <Feather
              name={isBorrowing ? "arrow-up-right" : "arrow-down-left"}
              size={22}
              color={isBorrowing ? "#ffb19f" : "#92f3a0"}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.loanName}>{loan.name || "Loan"}</Text>
          <Text style={styles.amount}>{formatCurrency(loan.amount)}</Text>
          <Text style={styles.meta}>End date: {loan.end_date || "-"}</Text>
          <Text style={styles.message}>{helperText}</Text>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Later</Text>
            </Pressable>

            <Pressable
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>{actionLabel}</Text>
            </Pressable>
          </View>
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
    maxWidth: 380,
    backgroundColor: "#33211c",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 221, 203, 0.08)",
    padding: 24,
  },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  lendIconWrap: {
    backgroundColor: "rgba(111, 224, 136, 0.12)",
  },

  borrowIconWrap: {
    backgroundColor: "rgba(255, 145, 120, 0.12)",
  },

  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
  },

  loanName: {
    color: "#f6ded3",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 12,
  },

  amount: {
    color: colors.gold,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6,
  },

  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
  },

  message: {
    color: "#d9c0b4",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
  },

  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 188, 0.12)",
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#2a1b16",
  },

  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  primaryButton: {
    flex: 1.3,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.gold,
  },

  primaryButtonDisabled: {
    opacity: 0.7,
  },

  primaryButtonText: {
    color: "#24140f",
    fontSize: 15,
    fontWeight: "800",
  },
});

