"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import useSWR from "swr";
import { Bell, BellOff, Mail, MailX, Send, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { toast } from "sonner";

import { fetcher } from "@/lib/fetcher";
import { QuietHoursSettings } from "./quiet-hours-settings";
import { ReminderDefaultsSettings } from "./reminder-defaults-settings";

export function NotificationSettings() {
  const t = useTranslations("settings.notifications");
  const {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    subscribe,
    unsubscribe,
    sendTest,
  } = usePushNotifications();
  const [isTestSending, setIsTestSending] = useState(false);

  // Fetch device count when subscribed (D-15: "subscribed on N devices")
  const { data: subsData, mutate: mutateSubs } = useSWR(
    isSubscribed ? "/api/push/subscriptions" : null,
    fetcher
  );
  const deviceCount: number = subsData?.count ?? 0;

  // Fetch profile for email notification preference
  const { data: profileData, mutate: mutateProfile } = useSWR(
    "/api/profile",
    fetcher
  );
  const emailEnabled = profileData?.profile?.email_notifications_enabled ?? false;
  const [isEmailToggling, setIsEmailToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    try {
      if (checked) {
        await subscribe();
      } else {
        await unsubscribe();
      }
      // Refresh device count after subscribe/unsubscribe
      mutateSubs();
    } catch {
      toast.error(checked ? t("subscribeError") : t("unsubscribeError"));
    }
  };

  const handleTestNotification = async () => {
    setIsTestSending(true);
    try {
      await sendTest();
      toast.success(t("testSent"));
    } catch {
      toast.error(t("testError"));
    } finally {
      setIsTestSending(false);
    }
  };

  const handleEmailToggle = async (checked: boolean) => {
    setIsEmailToggling(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_notifications_enabled: checked }),
      });
      if (!response.ok) {
        throw new Error("Failed to update email preference");
      }
      mutateProfile();
      toast.success(checked ? t("emailEnabled") : t("emailDisabled"));
    } catch {
      toast.error(t("emailToggleError"));
    } finally {
      setIsEmailToggling(false);
    }
  };

  // Browser doesn't support push notifications — still show email section
  if (!isSupported) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellOff className="h-5 w-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("notSupported")}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {emailEnabled ? (
                <Mail className="h-5 w-5" />
              ) : (
                <MailX className="h-5 w-5" />
              )}
              {t("emailTitle")}
            </CardTitle>
            <CardDescription>{t("emailDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("emailExplainer")}
            </p>
            <div className="flex items-center justify-between">
              <Label
                htmlFor="email-notifications-toggle"
                className="text-sm font-medium"
              >
                {emailEnabled ? t("emailEnabled") : t("emailDisabled")}
              </Label>
              <Switch
                id="email-notifications-toggle"
                checked={emailEnabled}
                onCheckedChange={handleEmailToggle}
                disabled={isEmailToggling}
              />
            </div>
          </CardContent>
        </Card>

        <QuietHoursSettings />
        <ReminderDefaultsSettings />
      </div>
    );
  }

  const isDenied = permission === "denied";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Explainer text */}
          <p className="text-sm text-muted-foreground">{t("explainer")}</p>

          {/* Permission denied warning */}
          {isDenied && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("denied")}</span>
            </div>
          )}

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <Label
              htmlFor="push-notifications-toggle"
              className="text-sm font-medium"
            >
              {isSubscribed ? t("enabled") : t("disabled")}
            </Label>
            <Switch
              id="push-notifications-toggle"
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={isLoading || isDenied}
            />
          </div>

          {/* Device count -- only shown when subscribed (D-15) */}
          {isSubscribed && deviceCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("subscribedDevices", { count: deviceCount })}
            </p>
          )}

          {/* Test notification button -- only shown when subscribed */}
          {isSubscribed && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestNotification}
              disabled={isTestSending}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {t("testButton")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {emailEnabled ? (
              <Mail className="h-5 w-5" />
            ) : (
              <MailX className="h-5 w-5" />
            )}
            {t("emailTitle")}
          </CardTitle>
          <CardDescription>{t("emailDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("emailExplainer")}
          </p>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="email-notifications-toggle"
              className="text-sm font-medium"
            >
              {emailEnabled ? t("emailEnabled") : t("emailDisabled")}
            </Label>
            <Switch
              id="email-notifications-toggle"
              checked={emailEnabled}
              onCheckedChange={handleEmailToggle}
              disabled={isEmailToggling}
            />
          </div>
        </CardContent>
      </Card>

      <QuietHoursSettings />
      <ReminderDefaultsSettings />
    </div>
  );
}
