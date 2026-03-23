import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AuthLayout from "../components/AuthLayout";
import ThemedNoticeModal from "../components/ThemedNoticeModal";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({
    visible: false,
    title: "",
    message: "",
    tone: "error",
  });

  const openNotice = (title, message, tone = "error") => {
    setNotice({ visible: true, title, message, tone });
  };

  const handleRegister = async () => {
    if (!email.trim() || !password || !name.trim()) {
      openNotice("Missing details", "Name, email, and password are required.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      openNotice("Signup failed", error.message);
      return;
    }

    if (data?.user?.id) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        name: name.trim(),
        email: email.trim(),
      });

      if (profileError) {
        setLoading(false);
        openNotice("Profile setup failed", profileError.message);
        return;
      }
    }

    setLoading(false);
    openNotice(
      "Account created",
      "Your profile is ready. You can start tracking spending now.",
      "success"
    );
  };

  return (
    <>
      <AuthLayout
        badge="Create profile"
        title="Make onboarding feel premium, not plain."
        subtitle="Set up your account once and move straight into a richer daily, weekly, monthly, and yearly money view."
        footer={
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.footerLink}>Login</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.topRow}>
          <Text style={styles.panelTitle}>Register</Text>
          <View style={styles.sparkBadge}>
            <Feather name="star" size={16} color={colors.gold} />
            <Text style={styles.sparkText}>Fresh start</Text>
          </View>
        </View>

        <View style={styles.switchRow}>
          <TouchableOpacity
            style={styles.switchPill}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.switchText}>Login</Text>
          </TouchableOpacity>

          <View style={[styles.switchPill, styles.switchPillActive]}>
            <Text style={[styles.switchText, styles.switchTextActive]}>Register</Text>
          </View>
        </View>

        <Text style={styles.panelSubtitle}>
          Create your account and keep every transaction organized from day one.
        </Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoCorrect={false}
            textContentType="name"
            selectionColor={colors.gold}
            cursorColor={colors.gold}
            underlineColorAndroid="transparent"
            disableFullscreenUI
            placeholder="Your name"
            placeholderTextColor="#9f8578"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            selectionColor={colors.gold}
            cursorColor={colors.gold}
            underlineColorAndroid="transparent"
            disableFullscreenUI
            placeholder="you@example.com"
            placeholderTextColor="#9f8578"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              selectionColor={colors.gold}
              cursorColor={colors.gold}
              underlineColorAndroid="transparent"
              disableFullscreenUI
              placeholder="Choose a strong password"
              placeholderTextColor="#9f8578"
            />

            <Pressable
              onPress={() => setShowPassword((current) => !current)}
              hitSlop={10}
              style={styles.eyeButton}
            >
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color="#f3ddcf"
              />
            </Pressable>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating..." : "Create Account"}
          </Text>
        </TouchableOpacity>
      </AuthLayout>

      <ThemedNoticeModal
        visible={notice.visible}
        title={notice.title}
        message={notice.message}
        tone={notice.tone}
        buttonLabel={notice.tone === "success" ? "Continue" : "Close"}
        onClose={() =>
          setNotice((current) => ({
            ...current,
            visible: false,
          }))
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  panelTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
  },

  panelSubtitle: {
    color: "#d4bcae",
    lineHeight: 21,
    marginTop: 10,
    marginBottom: 18,
  },

  switchRow: {
    flexDirection: "row",
    backgroundColor: "rgba(24, 13, 10, 0.55)",
    borderRadius: 18,
    padding: 4,
    marginTop: 14,
    marginBottom: 14,
  },

  switchPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },

  switchPillActive: {
    backgroundColor: colors.gold,
  },

  switchText: {
    color: "#ccb3a5",
    fontWeight: "700",
  },

  switchTextActive: {
    color: "#24140f",
  },

  sparkBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255, 204, 153, 0.1)",
  },

  sparkText: {
    color: "#f5d6c1",
    marginLeft: 6,
    fontWeight: "700",
    fontSize: 12,
  },

  fieldWrap: {
    marginBottom: 16,
  },

  label: {
    color: "#f2ddd2",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#2f1d18",
    borderWidth: 1,
    borderColor: "rgba(255, 220, 203, 0.28)",
    borderRadius: 18,
    color: "#fff7f2",
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 22,
  },

  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2f1d18",
    borderWidth: 1,
    borderColor: "rgba(255, 220, 203, 0.28)",
    borderRadius: 18,
    paddingHorizontal: 16,
  },

  passwordInput: {
    flex: 1,
    color: "#fff7f2",
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 22,
  },

  eyeButton: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  button: {
    marginTop: 8,
    backgroundColor: colors.gold,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: "#24140f",
    fontSize: 16,
    fontWeight: "800",
  },

  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  footerText: {
    color: "#ccb2a4",
    marginRight: 6,
  },

  footerLink: {
    color: colors.gold,
    fontWeight: "800",
  },
});
