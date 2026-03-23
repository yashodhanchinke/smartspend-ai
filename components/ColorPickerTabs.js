import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ColorPicker from "react-native-wheel-color-picker";
import colors from "../theme/colors";

const ACCENT_COLORS = [
  "#FFDDD2",
  "#F5C5B8",
  "#E9B09E",
  "#DB927D",
  "#CF6E53",
  "#DC3E1E",
  "#C82800",
  "#B91D00",
  "#A71A00",
  "#8C1600",
];

const formatColorValue = (value) => {
  const normalized = (value || "#FFB49A").toUpperCase();
  return normalized.replace("#", "0xFF");
};

const getSelectedPalette = (activeTab, palette) =>
  activeTab === "primary" ? palette : ACCENT_COLORS;

export default function ColorPickerTabs({ palette, selectedColor, onSelectColor }) {
  const [activeTab, setActiveTab] = useState("primary");
  const [wheelColor, setWheelColor] = useState(selectedColor || "#FFB49A");

  useEffect(() => {
    setWheelColor(selectedColor || "#FFB49A");
  }, [selectedColor]);

  const swatches = useMemo(() => {
    const source = getSelectedPalette(activeTab, palette);
    const merged = [...source];

    if (selectedColor && !merged.includes(selectedColor)) {
      merged.unshift(selectedColor);
    }

    return merged.slice(0, 10);
  }, [activeTab, palette, selectedColor]);

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

      {activeTab === "wheel" ? (
        <View style={styles.wheelPanel}>
          <View style={styles.wheelContainer}>
            <ColorPicker
              color={wheelColor}
              onColorChange={(color) => setWheelColor(color)}
              onColorChangeComplete={(color) => {
                setWheelColor(color);
                onSelectColor(color);
              }}
              thumbSize={30}
              sliderSize={28}
              noSnap
              row={false}
              gapSize={16}
              discrete={false}
            />
          </View>

          <View style={styles.palettePreview}>
            {swatches.map((colorValue) => {
              const isSelected = selectedColor?.toUpperCase() === colorValue.toUpperCase();

              return (
                <Pressable
                  key={colorValue}
                  style={[styles.colorSwatchLarge, { backgroundColor: colorValue }]}
                  onPress={() => onSelectColor(colorValue)}
                >
                  {isSelected ? <Feather name="check" size={24} color="#fff" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.palette}>
          {getSelectedPalette(activeTab, palette).map((colorValue) => {
            const isSelected = selectedColor?.toUpperCase() === colorValue.toUpperCase();

            return (
              <Pressable
                key={colorValue}
                style={[styles.colorSwatch, { backgroundColor: colorValue }]}
                onPress={() => onSelectColor(colorValue)}
              >
                {isSelected ? <Feather name="check" size={22} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.colorValuePill}>
        <Text style={styles.colorValueText}>{formatColorValue(selectedColor)}</Text>
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
    borderRadius: 22,
    padding: 6,
    marginBottom: 18,
  },

  tabSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  modeTab: {
    flex: 1,
    height: 50,
    borderRadius: 16,
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
    height: 28,
    backgroundColor: "#57413c",
  },

  wheelPanel: {
    alignItems: "center",
  },

  wheelContainer: {
    height: 360,
    width: "100%",
    paddingHorizontal: 10,
    marginTop: 4,
  },

  palettePreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
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

  colorSwatchLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  colorValuePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#3a2a27",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 18,
    width: 200,
    alignSelf: "center",
    marginTop: 22,
    borderWidth: 1,
    borderColor: "#5a4641",
  },

  colorValueText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
