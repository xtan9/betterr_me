"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
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
import type { CurrentProfileResponse } from "@/lib/current-profile";
import { useProfileDetails } from "@/lib/hooks/use-profile-preferences";

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

export function ProfileForm({
  initialData,
  initialSubject,
}: {
  initialData?: CurrentProfileResponse;
  initialSubject?: string;
}) {
  const t = useTranslations("settings.profile");
  const [isSaving, setIsSaving] = useState(false);
  const { details, currentProfile, isLoading, updateProfileDetails } =
    useProfileDetails({ initialData, initialSubject });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: "",
      avatar_url: "",
    },
  });

  // Reset form when profile data loads
  useEffect(() => {
    if (details) {
      form.reset({
        full_name: details.fullName ?? "",
        avatar_url: details.avatarUrl ?? "",
      });
    }
  }, [details, form]);

  const handleSubmit = async (data: ProfileFormValues) => {
    setIsSaving(true);
    try {
      const patch: { fullName?: string | null; avatarUrl?: string | null } = {};
      if (form.formState.dirtyFields.full_name) {
        patch.fullName = data.full_name || null;
      }
      if (form.formState.dirtyFields.avatar_url) {
        patch.avatarUrl = data.avatar_url || null;
      }
      await updateProfileDetails(patch);
      form.reset(data);
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
            value={currentProfile?.identity.email ?? ""}
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
