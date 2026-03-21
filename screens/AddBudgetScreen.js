import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ColorPickerTabs from "../components/ColorPickerTabs";
import ScreenHeader from "../components/ScreenHeader";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

const BUDGET_COLORS = [
  "#FF4433", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#1E88E5", "#14A3E6",
  "#18B4C9", "#169C92", "#4CAF50", "#8BC34A", "#D4E629", "#FFEB3B", "#FFC107",
  "#FF9800", "#FF5722", "#8D6656", "#6E8898", "#A5A5A5", "#F0DEE2", "#F2C2CB",
  "#E9969E", "#E97779", "#F2524E", "#EF3B39", "#DF2F2F", "#C62828",
];

const BUDGET_MODES = [
  {
    key: "automatic",
    title: "Automatic",
    description: "Track all expense categories automatically",
    icon: "autorenew",
  },
  {
    key: "manual",
    title: "Manual",
    description: "Choose categories manually",
    icon: "tune-variant",
  },
];

const BUDGET_TYPES = [
  {
    key: "category",
    title: "Category Budget",
    description: "Track spending across selected categories.",
    icon: "shape-outline",
  },
  {
    key: "overall",
    title: "Overall Budget",
    description: "Track one total limit across your spending.",
    icon: "wallet-outline",
  },
];

const BUDGET_PERIODS = [
  { key: "daily", title: "Daily", description: "Budget resets every day" },
  { key: "weekly", title: "Weekly", description: "Budget resets every week" },
  { key: "monthly", title: "Monthly", description: "Budget resets every month" },
  { key: "yearly", title: "Yearly", description: "Budget resets every year" },
];

function formatCount(count) {
  return `${count} categor${count === 1 ? "y" : "ies"}`;
}

function OptionRow({ icon, title, subtitle, current, onPress }) {
  return (
    <Pressable style={styles.optionRow} onPress={onPress}>
      <View style={styles.optionIcon}>
        <MaterialCommunityIcons name={icon} size={22} color="#ffb49a" />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
        <Text style={styles.optionCurrent}>Current: {current}</Text>
      </View>
      <Feather name="chevron-right" size={22} color={colors.text} />
    </Pressable>
  );
}

function SelectionModal({ visible, title, subtitle, children, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalSubtitle}>{subtitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={28} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CategorySection({
  title,
  categories,
  selectedCategoryIds,
  onToggle,
  expanded,
  onToggleExpanded,
}) {
  if (!categories.length) {
    return null;
  }

  return (
    <View style={styles.categorySection}>
      <Pressable style={styles.categorySectionHeader} onPress={onToggleExpanded}>
        <Text style={styles.categorySectionTitle}>{title}</Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={22} color={colors.text} />
      </Pressable>
      {expanded ? (
        <View style={styles.categoryWrap}>
          {categories.map((category) => {
            const isSelected = selectedCategoryIds.includes(category.id);
            return (
              <Pressable
                key={category.id}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                onPress={() => onToggle(category.id)}
              >
                <MaterialCommunityIcons
                  name={category.icon || "tag"}
                  size={20}
                  color={category.color || "#ffb49a"}
                />
                <Text style={styles.categoryChipText}>{category.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export default function AddBudgetScreen({ navigation }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [budgetMode, setBudgetMode] = useState("automatic");
  const [budgetType, setBudgetType] = useState("category");
  const [budgetPeriod, setBudgetPeriod] = useState("monthly");
  const [selectedColor, setSelectedColor] = useState("#FF4433");
  const [activeModal, setActiveModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    expense: true,
    income: false,
  });

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (mounted) {
          setCategories([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from("categories")
        .select("id,name,icon,color,type")
        .eq("user_id", user.id)
        .order("type")
        .order("name");

      if (error) {
        Alert.alert("Error", error.message || "Could not load categories.");
        return;
      }

      if (mounted) {
        setCategories(data || []);
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

  const manualCategoryCount = selectedCategoryIds.length;
  const expenseCategories = categories.filter((item) => item.type === "expense");
  const incomeCategories = categories.filter((item) => item.type === "income");
  const effectiveCategoryIds =
    budgetType === "overall"
      ? []
      : selectedCategoryIds;

  const categorySummary =
    budgetType === "overall"
      ? "All spending"
      : `${budgetMode === "automatic" ? "Automatic" : "Manual"} • ${formatCount(manualCategoryCount)}`;

  const toggleCategory = (categoryId) => {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  };

  const toggleSectionExpanded = (sectionKey) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      return Alert.alert("Error", "Enter a budget name.");
    }

    if (!amount.trim() || Number(amount) <= 0) {
      return Alert.alert("Error", "Enter a valid amount.");
    }

    if (budgetType === "category" && effectiveCategoryIds.length === 0) {
      return Alert.alert("Error", "Select at least one category.");
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("You must be signed in.");
      }

      const budgetPayload = {
        user_id: user.id,
        name: name.trim(),
        amount: Number(amount),
        period: budgetPeriod,
        spent: 0,
        category_id: effectiveCategoryIds[0] || null,
        mode: budgetMode,
        budget_type: budgetType,
        notes: notes.trim() || null,
        color: selectedColor,
      };

      const { data: insertedBudget, error: budgetError } = await supabase
        .from("budgets")
        .insert([budgetPayload])
        .select("id")
        .single();

      if (budgetError) {
        throw budgetError;
      }

      if (effectiveCategoryIds.length > 0) {
        const relationRows = effectiveCategoryIds.map((categoryId) => ({
          budget_id: insertedBudget.id,
          category_id: categoryId,
        }));

        const { error: relationError } = await supabase
          .from("budget_categories")
          .insert(relationRows);

        if (relationError) {
          throw relationError;
        }
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message || "Could not save budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Add budget" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.inlineField}>
          <View style={styles.leadingIcon}>
            <MaterialCommunityIcons name="minus-box" size={28} color="#f7ddd4" />
          </View>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            placeholder="Ex: Groceries"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Enter amount"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <OptionRow
          icon="pencil-outline"
          title="Budget Mode"
          subtitle="Choose how categories are selected"
          current={budgetMode === "automatic" ? "Automatic" : "Manual"}
          onPress={() => setActiveModal("mode")}
        />
        <OptionRow
          icon="wallet-outline"
          title="Budget Type"
          subtitle="Choose how to track your budget"
          current={budgetType === "category" ? "Category Budget" : "Overall Budget"}
          onPress={() => setActiveModal("type")}
        />
        <OptionRow
          icon="calendar-month-outline"
          title="Budget Period"
          subtitle="Select your budget timeframe"
          current={BUDGET_PERIODS.find((item) => item.key === budgetPeriod)?.title || "Monthly"}
          onPress={() => setActiveModal("period")}
        />
        <OptionRow
          icon="shape-plus-outline"
          title="Track Categories"
          subtitle="Choose which categories this budget will follow"
          current={categorySummary}
          onPress={() => setActiveModal("categories")}
        />

        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Notes"
          placeholderTextColor={colors.muted}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.sectionTitle}>Colors</Text>
        <ColorPickerTabs palette={BUDGET_COLORS} selectedColor={selectedColor} onSelectColor={setSelectedColor} />
      </ScrollView>

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <MaterialCommunityIcons name="content-save-outline" size={24} color="#2f1814" />
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Add"}</Text>
      </Pressable>

      <SelectionModal
        visible={activeModal === "mode"}
        title="Choose Budget Mode"
        subtitle="Choose how categories are selected"
        onClose={() => setActiveModal(null)}
      >
        {BUDGET_MODES.map((mode) => {
          const isSelected = budgetMode === mode.key;
          return (
            <Pressable
              key={mode.key}
              style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
              onPress={() => {
                setBudgetMode(mode.key);
              }}
            >
              <View style={styles.choiceHeader}>
                <MaterialCommunityIcons name={mode.icon} size={24} color={isSelected ? "#ffdfd3" : "#ffb49a"} />
                <Text style={styles.choiceTitle}>{mode.title}</Text>
                {isSelected ? <MaterialCommunityIcons name="check-circle" size={28} color="#ffdfd3" /> : null}
              </View>
              <Text style={styles.choiceDescription}>{mode.description}</Text>
            </Pressable>
          );
        })}
      </SelectionModal>

      <SelectionModal
        visible={activeModal === "type"}
        title="Choose Budget Type"
        subtitle="Choose how to track your budget"
        onClose={() => setActiveModal(null)}
      >
        {BUDGET_TYPES.map((type) => {
          const isSelected = budgetType === type.key;
          return (
            <Pressable
              key={type.key}
              style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
              onPress={() => {
                setBudgetType(type.key);
              }}
            >
              <View style={styles.choiceHeader}>
                <MaterialCommunityIcons name={type.icon} size={24} color={isSelected ? "#ffdfd3" : "#ffb49a"} />
                <Text style={styles.choiceTitle}>{type.title}</Text>
                {isSelected ? <MaterialCommunityIcons name="check-circle" size={28} color="#ffdfd3" /> : null}
              </View>
              <Text style={styles.choiceDescription}>{type.description}</Text>
            </Pressable>
          );
        })}
      </SelectionModal>

      <SelectionModal
        visible={activeModal === "period"}
        title="Select Budget Period"
        subtitle="Choose how often your budget resets and tracks spending"
        onClose={() => setActiveModal(null)}
      >
        {BUDGET_PERIODS.map((period) => {
          const isSelected = budgetPeriod === period.key;
          return (
            <Pressable
              key={period.key}
              style={[styles.periodCard, isSelected && styles.choiceCardActive]}
              onPress={() => {
                setBudgetPeriod(period.key);
              }}
            >
              <View>
                <Text style={styles.periodTitle}>{period.title}</Text>
                <Text style={styles.periodDescription}>{period.description}</Text>
              </View>
              {isSelected ? <MaterialCommunityIcons name="check-circle" size={28} color="#ffdfd3" /> : null}
            </Pressable>
          );
        })}
      </SelectionModal>

      <SelectionModal
        visible={activeModal === "categories"}
        title="Select Categories"
        subtitle="Choose categories that this budget will track"
        onClose={() => setActiveModal(null)}
      >
        {budgetType === "overall" ? (
          <View style={styles.emptySelectionState}>
            <Text style={styles.emptySelectionTitle}>Overall budget selected</Text>
            <Text style={styles.emptySelectionText}>
              This budget will track all spending, so category selection is not required.
            </Text>
          </View>
        ) : budgetMode === "automatic" ? (
          <>
            <View style={styles.emptySelectionState}>
              <Text style={styles.emptySelectionTitle}>Automatic mode active</Text>
              <Text style={styles.emptySelectionText}>
                Select the categories you want to auto-track for this budget.
              </Text>
            </View>
            <CategorySection
              title="Expense Categories"
              categories={expenseCategories}
              selectedCategoryIds={selectedCategoryIds}
              onToggle={toggleCategory}
              expanded={expandedSections.expense}
              onToggleExpanded={() => toggleSectionExpanded("expense")}
            />
            <CategorySection
              title="Income Categories"
              categories={incomeCategories}
              selectedCategoryIds={selectedCategoryIds}
              onToggle={toggleCategory}
              expanded={expandedSections.income}
              onToggleExpanded={() => toggleSectionExpanded("income")}
            />
            <Text style={styles.selectionCount}>
              {manualCategoryCount} of {categories.length} categories selected
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={styles.actionButton}
                onPress={() => setSelectedCategoryIds(categories.map((item) => item.id))}
              >
                <Text style={styles.actionButtonText}>Select All</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.actionButtonMuted]} onPress={() => setSelectedCategoryIds([])}>
                <Text style={styles.actionButtonText}>Clear All</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <CategorySection
              title="Expense Categories"
              categories={expenseCategories}
              selectedCategoryIds={selectedCategoryIds}
              onToggle={toggleCategory}
              expanded={expandedSections.expense}
              onToggleExpanded={() => toggleSectionExpanded("expense")}
            />
            <CategorySection
              title="Income Categories"
              categories={incomeCategories}
              selectedCategoryIds={selectedCategoryIds}
              onToggle={toggleCategory}
              expanded={expandedSections.income}
              onToggleExpanded={() => toggleSectionExpanded("income")}
            />
            <Text style={styles.selectionCount}>
              {manualCategoryCount} of {categories.length} categories selected
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={styles.actionButton}
                onPress={() => setSelectedCategoryIds(categories.map((item) => item.id))}
              >
                <Text style={styles.actionButtonText}>Select All</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.actionButtonMuted]} onPress={() => setSelectedCategoryIds([])}>
                <Text style={styles.actionButtonText}>Clear All</Text>
              </Pressable>
            </View>
          </>
        )}
      </SelectionModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#24130f" },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120 },
  inlineField: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  leadingIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#8f675c",
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
  inlineInput: { flex: 1, marginBottom: 0 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  optionIcon: {
    width: 38,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionCopy: { flex: 1, paddingRight: 16 },
  optionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 3 },
  optionSubtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  optionCurrent: { color: "#d7b3a3", fontSize: 15, fontWeight: "700", marginTop: 2 },
  notesInput: { height: 140, paddingTop: 20 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
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
  saveButtonText: { color: "#2f1814", fontSize: 20, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    maxHeight: "82%",
    backgroundColor: "#35231d",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 34,
  },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  modalHeaderCopy: { flex: 1, paddingRight: 14 },
  modalTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 6 },
  modalSubtitle: { color: colors.muted, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  choiceCard: {
    backgroundColor: "#4a3a37",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  choiceCardActive: { backgroundColor: "#8d4727" },
  choiceHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  choiceTitle: { color: colors.text, fontSize: 18, fontWeight: "800", flex: 1, marginLeft: 14 },
  choiceDescription: { color: "#f0ded7", fontSize: 16, lineHeight: 28, fontWeight: "600" },
  periodCard: {
    backgroundColor: "#4a3a37",
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  periodTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 5 },
  periodDescription: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  categorySection: { marginTop: 14 },
  categorySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  categorySectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  categoryWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4a3a37",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryChipSelected: { borderColor: "#ffb49a", backgroundColor: "#5a3d32" },
  categoryChipText: { color: colors.text, fontSize: 16, fontWeight: "700", marginLeft: 10 },
  selectionCount: {
    color: colors.text,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 22,
    marginBottom: 18,
  },
  actionRow: { flexDirection: "row", justifyContent: "space-between" },
  actionButton: {
    flex: 1,
    backgroundColor: "#7d5647",
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    marginRight: 8,
  },
  actionButtonMuted: { marginRight: 0, marginLeft: 8, backgroundColor: "#5a4a44" },
  actionButtonText: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptySelectionState: {
    backgroundColor: "#4a3a37",
    borderRadius: 22,
    padding: 22,
  },
  emptySelectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  emptySelectionText: { color: colors.muted, fontSize: 16, lineHeight: 26, fontWeight: "600" },
});
