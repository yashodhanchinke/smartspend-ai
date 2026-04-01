import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import colors from "../theme/colors";

export default function ProfileScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const initials = useMemo(() => {
    const source = fullName.trim() || email.trim() || "U";

    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("");
  }, [email, fullName]);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("name,email")
      .eq("id", user.id)
      .maybeSingle();

    setFullName(profile?.name || user.user_metadata?.name || "");
    setAuthEmail((user.email || "").trim());
    setEmail((user.email || profile?.email || "").trim());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSave = async () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert("Error", "Name and email are required");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      Alert.alert("Error", "User not found");
      return;
    }

    const desiredEmail = email.trim().toLowerCase();
    const currentAuthEmail = (user.email || "").trim().toLowerCase();
    let emailChangeRequested = false;

    if (desiredEmail !== currentAuthEmail) {
      const { error: authUpdateError } = await supabase.auth.updateUser({
        email: desiredEmail,
      });

      if (authUpdateError) {
        setLoading(false);
        Alert.alert("Error", authUpdateError.message);
        return;
      }

      emailChangeRequested = true;
    }

    const payload = {
      id: user.id,
      name: fullName.trim(),
      email: desiredEmail,
    };

    const { error } = await supabase.from("profiles").upsert(payload);

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    if (emailChangeRequested) {
      setAuthEmail(desiredEmail);
      Alert.alert(
        "Success",
        "Profile updated. Please confirm the email-change link sent by Supabase to complete login-email update."
      );
      return;
    }

    Alert.alert("Success", "Profile updated");
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    setLoggingOut(false);

    if (error) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "U"}</Text>
            </View>

            <TouchableOpacity style={styles.editBadge} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={16} color="#2a170f" />
              <Text style={styles.editBadgeText}>Profile</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Your Profile</Text>
          <Text style={styles.subtitle}>Manage your account details and keep your profile updated.</Text>

          <View style={styles.quickRow}>
            <View style={styles.quickCard}>
              <Text style={styles.quickLabel}>Status</Text>
              <Text style={styles.quickValue}>Active</Text>
            </View>

            <View style={styles.quickCard}>
              <Text style={styles.quickLabel}>Mode</Text>
              <Text style={styles.quickValue}>Personal</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Info</Text>

          <View style={styles.inputCard}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              placeholder="Your name"
              placeholderTextColor="#8e766c"
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.inputCard}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="you@email.com"
              placeholderTextColor="#8e766c"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {authEmail ? <Text style={styles.helperText}>Login email: {authEmail}</Text> : null}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          <Text style={styles.saveText}>{loading ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} disabled={loggingOut}>
          <Ionicons name="log-out-outline" size={18} color="#f7d9ca" />
          <Text style={styles.logoutText}>{loggingOut ? "Signing out..." : "Sign Out"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: "#2f2019",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#4a332d",
    marginBottom: 18,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: "#ffcc99",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#24150f",
    fontSize: 28,
    fontWeight: "900",
  },
  editBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f4b08d",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editBadgeText: {
    color: "#2a170f",
    fontWeight: "700",
    fontSize: 13,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: "#d0b6aa",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  quickCard: {
    flex: 1,
    backgroundColor: "#241611",
    borderRadius: 18,
    padding: 14,
  },
  quickLabel: {
    color: "#c7aaa0",
    fontSize: 12,
    marginBottom: 6,
  },
  quickValue: {
    color: "#fff3ec",
    fontSize: 17,
    fontWeight: "700",
  },
  section: {
    marginTop: 6,
  },
  sectionTitle: {
    color: "#f5e9e2",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  inputCard: {
    backgroundColor: "#2a1b14",
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#3f2b24",
  },
  label: {
    color: "#baa095",
    fontSize: 12,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    color: "#fff",
    fontSize: 16,
    paddingVertical: 2,
  },
  helperText: {
    color: "#baa095",
    fontSize: 12,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 14,
  },
  saveText: {
    color: "#20110b",
    fontWeight: "800",
    fontSize: 16,
  },
  logoutBtn: {
    marginTop: 14,
    backgroundColor: "#2a1b14",
    borderWidth: 1,
    borderColor: "#4a332d",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutText: {
    color: "#f7d9ca",
    fontWeight: "700",
    fontSize: 15,
  },
});
