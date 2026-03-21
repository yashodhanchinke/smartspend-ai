import { Platform } from "react-native";
import Constants from "expo-constants";

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

function getSmsModule() {
  if (Platform.OS !== "android" || isExpoGo()) {
    return null;
  }

  try {
    return require("react-native-sms-module");
  } catch (_error) {
    return null;
  }
}

export function isSmsModuleAvailable() {
  const smsModule = getSmsModule();
  return Boolean(smsModule?.getSMSList && smsModule?.startSmsListener && smsModule?.stopSmsListener);
}

export async function getDeviceSmsList(offset = 0, limit = 100, filters = {}) {
  const smsModule = getSmsModule();

  if (!smsModule?.getSMSList) {
    return [];
  }

  return smsModule.getSMSList(offset, limit, filters);
}

export function startDeviceSmsListener(onSms) {
  const smsModule = getSmsModule();

  if (!smsModule?.startSmsListener) {
    return () => {};
  }

  smsModule.startSmsListener(onSms);
  return () => {
    try {
      smsModule.stopSmsListener?.();
    } catch (_error) {
      // Ignore listener shutdown failures.
    }
  };
}
