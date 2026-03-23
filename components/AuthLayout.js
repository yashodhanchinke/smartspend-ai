import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colors from "../theme/colors";

export default function AuthLayout({ badge, title, subtitle, children, footer }) {
  const floatA = useRef(new Animated.Value(0)).current;
  const floatB = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.95)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(floatA, {
            toValue: 1,
            duration: 5200,
            useNativeDriver: true,
          }),
          Animated.timing(floatA, {
            toValue: 0,
            duration: 5200,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(floatB, {
            toValue: 1,
            duration: 4300,
            useNativeDriver: true,
          }),
          Animated.timing(floatB, {
            toValue: 0,
            duration: 4300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.05,
            duration: 3600,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.95,
            duration: 3600,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [floatA, floatB, pulse]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View style={styles.background}>
          {!keyboardVisible ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glow,
                  styles.glowOne,
                  {
                    transform: [
                      {
                        translateY: floatA.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 26],
                        }),
                      },
                      {
                        translateX: floatA.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -12],
                        }),
                      },
                      { scale: pulse },
                    ],
                  },
                ]}
              />

              <Animated.View
                pointerEvents="none"
                style={[
                  styles.glow,
                  styles.glowTwo,
                  {
                    transform: [
                      {
                        translateY: floatB.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -20],
                        }),
                      },
                      {
                        translateX: floatB.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 16],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </>
          ) : null}

          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              keyboardVisible && styles.scrollContentKeyboard,
              Platform.OS === "android" && keyboardVisible
                ? { paddingBottom: keyboardHeight + 16 }
                : null,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.hero, keyboardVisible && styles.heroCompact]}>
              {!keyboardVisible ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
              <Text style={styles.title}>{title}</Text>
              {!keyboardVisible ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <View style={styles.card}>{children}</View>

            {!keyboardVisible && footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safe: {
    flex: 1,
    backgroundColor: "#1d120f",
  },

  background: {
    flex: 1,
    backgroundColor: "#1d120f",
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
  },

  scrollContentKeyboard: {
    paddingTop: 0,
  },

  hero: {
    marginTop: 14,
    marginBottom: 18,
  },

  heroCompact: {
    marginTop: 8,
    marginBottom: 10,
  },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 204, 153, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 204, 153, 0.22)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 18,
  },

  badgeText: {
    color: colors.gold,
    fontWeight: "700",
    letterSpacing: 0.4,
  },

  title: {
    color: "#fff1e8",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
    maxWidth: "92%",
  },

  subtitle: {
    color: "#d6b8a9",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: "96%",
  },

  card: {
    backgroundColor: "rgba(63, 40, 34, 0.9)",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255, 228, 211, 0.08)",
    padding: 18,
    overflow: "hidden",
  },

  footer: {
    marginTop: 18,
  },

  glow: {
    position: "absolute",
    borderRadius: 999,
  },

  glowOne: {
    width: 240,
    height: 240,
    top: -40,
    right: -40,
    backgroundColor: "rgba(255, 170, 120, 0.16)",
  },

  glowTwo: {
    width: 220,
    height: 220,
    bottom: 60,
    left: -70,
    backgroundColor: "rgba(201, 113, 91, 0.16)",
  },
});
