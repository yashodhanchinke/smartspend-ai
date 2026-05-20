import AsyncStorage from "@react-native-async-storage/async-storage";

function getStorageKey(userId) {
  return `smartspend:nudges:read:${userId}`;
}

export async function getReadNotificationIds(userId) {
  if (!userId) {
    return [];
  }

  try {
    const rawValue = await AsyncStorage.getItem(getStorageKey(userId));
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.warn("Could not load nudge read state:", error?.message || error);
    return [];
  }
}

export async function markNotificationsRead(userId, notificationIds) {
  if (!userId || !notificationIds?.length) {
    return [];
  }

  try {
    const existingIds = await getReadNotificationIds(userId);
    const nextIds = [...new Set([...existingIds, ...notificationIds])];
    await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(nextIds));
    return nextIds;
  } catch (error) {
    console.warn("Could not persist nudge read state:", error?.message || error);
    return [];
  }
}

export function getUnreadNotifications(notifications, readNotificationIds) {
  const readSet = new Set(readNotificationIds || []);
  return (notifications || []).filter((notification) => !readSet.has(notification.id));
}
