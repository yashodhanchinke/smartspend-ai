import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import colors from "../theme/colors";

const formatTimeLabel = (timeValue) => {
  if (!timeValue) return "--:--";

  return new Date(`2000-01-01T${timeValue}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

function TransactionListItem({
  accountLabel,
  amountPrefix = "",
  categoryColor,
  categoryIcon,
  dateLabel,
  onPress,
  title,
  transactionType,
  amount,
  time,
  showDivider = false,
}) {
  const amountColor =
    transactionType === "expense"
      ? styles.expenseAmount
      : transactionType === "income"
      ? styles.incomeAmount
      : styles.neutralAmount;

  const content = (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={styles.left}>
        <View style={[styles.iconWrap, { backgroundColor: categoryColor || "#5a4138" }]}>
          <MaterialCommunityIcons
            name={categoryIcon || "credit-card-outline"}
            size={18}
            color="#fff3ea"
          />
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title || "Transaction"}
          </Text>
          <View style={styles.metaRow}>
            <Text
              style={styles.accountMeta}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {accountLabel || "Account"}
              <Text style={styles.dateMeta}>
                {" • "}
                {dateLabel || "--"}
              </Text>
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.amountWrap}>
        <Text style={[styles.amountText, amountColor]} numberOfLines={1}>
          {amountPrefix}₹{Number(amount || 0).toFixed(2)}
        </Text>
        <Text style={styles.timeText}>{formatTimeLabel(time)}</Text>
      </View>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  }

  return content;
}

export default memo(TransactionListItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },

  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 233, 220, 0.08)",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  textWrap: {
    flex: 1,
  },

  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    width: "100%",
  },

  accountMeta: {
    color: "#cdb8ae",
    fontSize: 11,
  },

  dateMeta: {
    color: "#cdb8ae",
    fontSize: 11,
  },

  amountWrap: {
    alignItems: "flex-end",
    minWidth: 78,
  },

  amountText: {
    fontSize: 15,
    fontWeight: "800",
  },

  timeText: {
    color: "#cdb8ae",
    fontSize: 11,
    marginTop: 4,
  },

  expenseAmount: {
    color: "#ff7f76",
  },

  incomeAmount: {
    color: "#7be68c",
  },

  neutralAmount: {
    color: "#e9d8cf",
  },
});
