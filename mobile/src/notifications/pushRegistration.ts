import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken } from "../api/reminders";

/**
 * Exam Guide spec §8 "Reminder System" — the mobile half. Requests notification
 * permission and registers this device's Expo push token with the backend for a
 * signed-in user.
 *
 * Best-effort by design: a denied permission or a failed registration must not block
 * sign-in — reminders are an optional feature, not a requirement to use the app. Every
 * failure path here is swallowed to a console warning, matching the same tolerance
 * `writeTopicIntelligence` already applies to an optional, non-blocking sync step.
 *
 * <h2>Known infrastructure prerequisite, not a code bug</h2>
 * {@code Notifications.getExpoPushTokenAsync()} needs an EAS project id to mint a real
 * token — this app has no {@code eas.json} and no {@code extra.eas.projectId} configured
 * anywhere (checked before writing this). Without one, this call throws and the whole
 * function degrades to a no-op (permission may still be granted, but no token is ever
 * sent to the backend). Provisioning an EAS project (`eas init`) is one-time setup this
 * session cannot do, the same category as the backend's Cloud Scheduler wiring for
 * dispatch — see `ReminderService`'s own comment for that half.
 */
export async function registerForPushNotifications(authToken: string): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await registerPushToken(expoToken, Platform.OS === "ios" ? "IOS" : "ANDROID", authToken);
  } catch (err) {
    console.warn("Push registration failed (non-fatal — reminders will not be delivered on this device)", err);
  }
}
