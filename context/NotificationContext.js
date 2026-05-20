import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";
import { callBackendApi } from "../util/backendApi";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  loading: false,
  refreshNotifications: async () => {},
  generateNotifications: async () => {},
  markNotificationRead: async () => {},
});

function getNotificationProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    null
  );
}

function getVisibleNotifications(items) {
  const now = Date.now();
  return (items || []).filter((item) => {
    if (!item.read_at) {
      return true;
    }

    if (!item.expires_at) {
      return false;
    }

    return new Date(item.expires_at).getTime() > now;
  });
}

export function useNotifications() {
  return useContext(NotificationContext);
}

export default function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef(null);
  const generateInFlightRef = useRef(false);
  const channelRef = useRef(null);
  const txChannelRef = useRef(null);
  const lastGenTimeRef = useRef(0);

  const loadNotifications = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    sessionRef.current = session;

    if (!session?.user?.id) {
      setNotifications([]);
      return [];
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,tone,language,kind,source_module,source_entity_type,source_entity_id,created_at,read_at,expires_at,push_sent_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const visibleItems = getVisibleNotifications(data || []);
    setNotifications(visibleItems);
    return visibleItems;
  }, []);

  const attachRealtimeChannel = useCallback((userId) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (txChannelRef.current) {
      supabase.removeChannel(txChannelRef.current);
      txChannelRef.current = null;
    }

    if (!userId) {
      return;
    }

    channelRef.current = supabase
      .channel(`user-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          generateNotifications({ force: true }).catch(() => {});
        }
      )
      .on(
        "broadcast",
        { event: "refresh" },
        () => {
          console.log("[NotificationContext] Broadcast refresh captured");
          generateNotifications({ force: true }).catch(() => {});
          loadNotifications();
        }
      )
      .subscribe();
  }, [loadNotifications, generateNotifications]);

  const refreshNotifications = useCallback(async () => {
    setLoading(true);

    try {
      await loadNotifications();
    } catch (error) {
      console.warn("Could not refresh notifications:", error?.message || error);
    } finally {
      setLoading(false);
    }
  }, [loadNotifications]);

  const generateNotifications = useCallback(async ({ force = false } = {}) => {
    // Basic throttle: Don't generate more than once every 2 seconds to avoid spamming the AI
    if (generateInFlightRef.current || (!force && Date.now() - lastGenTimeRef.current < 2000)) {
      return;
    }

    generateInFlightRef.current = true;
    lastGenTimeRef.current = Date.now();

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      sessionRef.current = session;

      if (!session?.access_token) {
        return;
      }

      const { response } = await callBackendApi("/api/notifications/generate", {
        accessToken: session.access_token,
        body: { force },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not generate notifications.");
      }

      await loadNotifications();
    } catch (error) {
      console.warn("Notification generation failed:", error?.message || error);
    } finally {
      generateInFlightRef.current = false;
    }
  }, [loadNotifications]);

  const registerPushPermission = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      sessionRef.current = session;

      if (!session?.access_token) {
        return;
      }

      const existingPermissions = await Notifications.getPermissionsAsync();
      let finalStatus = existingPermissions.status;

      if (finalStatus === "undetermined") {
        const permissionResponse = await Notifications.requestPermissionsAsync();
        finalStatus = permissionResponse.status;
      }

      let expoPushToken = null;

      if (finalStatus === "granted" && Device.isDevice) {
        try {
          const projectId = getNotificationProjectId();
          
          // Only attempt push token retrieval if we have a valid projectId.
          // This prevents the native FCM/Firebase initialization warning when configured for dev-client.
          if (projectId) {
            const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
            expoPushToken = tokenResponse.data;
          }
        } catch (error) {
          // If native initialization still fails (e.g. missing google-services.json), we catch and log silently
          if (!error?.message?.includes("FirebaseApp")) {
             console.warn("Could not get Expo push token:", error?.message || error);
          }
        }
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const { response } = await callBackendApi("/api/notifications/register-device", {
        accessToken: session.access_token,
        body: {
          expo_push_token: expoPushToken,
          push_permission_status: finalStatus || "unknown",
          language_mode: "hinglish",
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not save notification preference.");
      }
    } catch (error) {
      console.warn("Push permission registration failed:", error?.message || error);
    }
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    if (!notificationId) {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 3);

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", notificationId)
      .is("read_at", null);

    if (error) {
      throw error;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              read_at: now.toISOString(),
              expires_at: expiresAt.toISOString(),
            }
          : item
      )
    );
  }, []);

  useEffect(() => {
    let subscription;
    let responseSubscription;

    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      sessionRef.current = session;
      await loadNotifications();
      attachRealtimeChannel(session?.user?.id || null);

      registerPushPermission().catch(() => {});
      generateNotifications().catch(() => {});
    };

    bootstrap();

    const authListener = supabase.auth.onAuthStateChange(async (_event, session) => {
      sessionRef.current = session;
      await loadNotifications();
      attachRealtimeChannel(session?.user?.id || null);
      if (session?.user?.id) {
        registerPushPermission().catch(() => {});
        generateNotifications().catch(() => {});
      }
    });

    subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadNotifications().catch(() => {});
        generateNotifications().catch(() => {});
      }
    });

    responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const notificationId = response.notification.request.content.data?.notificationId;
      if (notificationId) {
        markNotificationRead(notificationId).catch(() => {});
      }
    });

    return () => {
      authListener.data.subscription.unsubscribe();
      subscription?.remove();
      responseSubscription?.remove();

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (txChannelRef.current) {
        supabase.removeChannel(txChannelRef.current);
        txChannelRef.current = null;
      }
    };
  }, [attachRealtimeChannel, generateNotifications, loadNotifications, markNotificationRead, registerPushPermission]);

  const value = useMemo(() => {
    const unreadCount = notifications.filter((item) => !item.read_at).length;

    return {
      notifications,
      unreadCount,
      loading,
      refreshNotifications,
      generateNotifications,
      markNotificationRead,
    };
  }, [generateNotifications, loading, markNotificationRead, notifications, refreshNotifications]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
