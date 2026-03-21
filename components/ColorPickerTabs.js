import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ColorPicker from "react-native-wheel-color-picker";
import colors from "../theme/colors";

const ACCENT_COLORS = [
  "#FF8A80", "#FF5252", "#FF1744", "#D50000",
  "#FF80AB", "#FF4081", "#F50057", "#C51162",
  "#EA80FC", "#E040FB", "#D500F9", "#AA00FF",
  "#B388FF", "#7C4DFF", "#651FFF", "#6200EA",
  "#8C9EFF", "#536DFE", "#3D5AFE", "#304FFE",
  "#82B1FF", "#448AFF", "#2979FF", "#2962FF",
  "#84FFFF", "#18FFFF", "#00E5FF",
];

export default function ColorPickerTabs({ palette, selectedColor, onSelectColor }) {
  const [activeTab, setActiveTab] = useState("primary");
  const [wheelColor, setWheelColor] = useState(selectedColor);

  useEffect(() => {
    setWheelColor(selectedColor);
  }, [selectedColor]);

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
        <View style={styles.wheelContainer}>
          <ColorPicker
            color={wheelColor}
            onColorChangeComplete={(color) => {
              setWheelColor(color);
              onSelectColor(color);
            }}
            thumbSize={30}
            sliderSize={30}
            noSnap={true}
            row={false}
          />
        </View>
      ) : (
        <View style={styles.palette}>
          {(activeTab === "primary" ? palette : ACCENT_COLORS).map((colorValue) => (
            <Pressable
              key={colorValue}
              style={[styles.colorSwatch, { backgroundColor: colorValue }]}
              onPress={() => onSelectColor(colorValue)}
            >
              {selectedColor === colorValue ? <Feather name="check" size={24} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.colorValuePill}>
        <Text style={styles.colorValueText}>{selectedColor.replace("#", "0x")}</Text>
        <MaterialCommunityIcons name="content-copy" size={22} color={colors.text} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wheelContainer: {
    height: 300,
    width: "100%",
    paddingHorizontal: 20,
    marginVertical: 10,
  },
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
