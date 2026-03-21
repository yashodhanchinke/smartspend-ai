import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import colors from "../theme/colors";

function getPrimaryColors(palette) {
  return palette.slice(0, Math.ceil(palette.length / 2));
}

function getAccentColors(palette) {
  return palette.slice(Math.ceil(palette.length / 2));
}

export default function ColorPickerTabs({ palette, selectedColor, onSelectColor }) {
  const primaryColors = useMemo(() => getPrimaryColors(palette), [palette]);
  const accentColors = useMemo(() => getAccentColors(palette), [palette]);
  const [activeTab, setActiveTab] = useState(
    accentColors.includes(selectedColor) ? "accent" : "primary"
  );

  useEffect(() => {
    if (activeTab === "wheel") {
      return;
    }

    if (primaryColors.includes(selectedColor)) {
      setActiveTab("primary");
      return;
    }

    if (accentColors.includes(selectedColor)) {
      setActiveTab("accent");
    }
  }, [selectedColor, primaryColors, accentColors, activeTab]);

  const visibleColors =
    activeTab === "primary"
      ? primaryColors
      : activeTab === "accent"
        ? accentColors
        : palette;

  return (
    <>
      <View style={styles.modeTabs}>
        {[
          { key: "primary", label: "Primary" },
          { key: "accent", label: "Accent" },
          { key: "wheel", label: "Wheel" },
        ].map((tab, index) => {
          const isActive = activeTab === tab.key;

          return (
            <View key={tab.key} style={styles.tabSegment}>
              <Pressable
                style={[styles.modeTab, isActive && styles.modeTabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.modeTabText, isActive && styles.modeTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
              {index < 2 ? <View style={styles.modeDivider} /> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.palette}>
        {visibleColors.map((colorValue) => (
          <Pressable
            key={colorValue}
            style={[styles.colorSwatch, { backgroundColor: colorValue }]}
            onPress={() => onSelectColor(colorValue)}
          >
            {selectedColor === colorValue ? <Feather name="check" size={24} color="#fff" /> : null}
          </Pressable>
        ))}
      </View>

      <View style={styles.colorValuePill}>
        <Text style={styles.colorValueText}>{selectedColor.replace("#", "0x")}</Text>
        <MaterialCommunityIcons name="content-copy" size={22} color={colors.text} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  modeTabs: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3a2a27",
    borderRadius: 18,
    padding: 4,
    marginBottom: 16,
  },
  tabSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  modeTab: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modeTabActive: {
    backgroundColor: "#ffb49a",
  },
  modeTabText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  modeTabTextActive: {
    color: "#2f1814",
  },
  modeDivider: {
    width: 1,
    height: 26,
    backgroundColor: "#57413c",
  },
  palette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  colorValuePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#3a2a27",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: 180,
    alignSelf: "center",
    marginTop: 22,
  },
  colorValueText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
