"use client";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InfoIcon } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

export default function ProtectedPage() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkUser() {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      
      if (error || !data?.user) {
        redirect("/auth/login");
      } else {
        setUser(data.user);
        setLoading(false);
      }
    }
    
    checkUser();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="w-full">
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
          <InfoIcon size="16" strokeWidth={2} />
          {t("dashboard.welcome")}
        </div>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <h2 className="font-bold text-2xl mb-4">{t("dashboard.profile")}</h2>
        <div className="grid gap-4 w-full">
          <div className="p-4 rounded-lg border">
            <h3 className="font-semibold mb-2">{t("dashboard.email")}</h3>
            <p className="text-muted-foreground">{user?.email}</p>
          </div>
          <div className="p-4 rounded-lg border">
            <h3 className="font-semibold mb-2">{t("dashboard.accountCreated")}</h3>
            <p className="text-muted-foreground">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
