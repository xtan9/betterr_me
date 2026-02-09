"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  profileFormSchema,
  type ProfileFormValues,
} from "@/lib/validations/profile";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  preferences: {
    date_format: string;
    week_start_day: number;
    theme: "system" | "light" | "dark";
  };
  created_at: string;
  updated_at: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function ProfileFormSkeleton() {
  return (
    <div className="space-y-4" data-testid="profile-form-skeleton">
      <div>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div>
        <Skeleton className="h-4 w-16 mb-2" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div>
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

export function ProfileForm() {
  const t = useTranslations("settings.profile");
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, mutate } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher
  );

  const profile = data?.profile;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: "",
      avatar_url: "",
    },
  });

  // Reset form when profile data loads
  useEffect(() => {
    if (profile) {
      form.reset({
        full_name: profile.full_name ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
  }, [profile, form]);

  const handleSubmit = async (data: ProfileFormValues) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: data.full_name || null,
          avatar_url: data.avatar_url || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      await mutate();
      toast.success(t("success"));
    } catch (error) {
      console.error("Update profile error:", error);
      toast.error(t("error"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <ProfileFormSkeleton />;
  }

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fullName")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("fullNamePlaceholder")}
                  disabled={isSaving}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <FormLabel>{t("email")}</FormLabel>
          <Input
            value={profile?.email ?? ""}
            disabled
            className="mt-2"
          />
          <FormDescription className="mt-1">
            {t("emailDescription")}
          </FormDescription>
        </div>

        <FormField
          control={form.control}
          name="avatar_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("avatarUrl")}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t("avatarUrlPlaceholder")}
                  disabled={isSaving}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={!isDirty || isSaving}
          className="gap-2"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSaving ? t("saving") : t("save")}
        </Button>
      </form>
    </Form>
  );
}
