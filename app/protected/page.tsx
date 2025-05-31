import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InfoIcon } from "lucide-react";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="w-full">
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
          <InfoIcon size="16" strokeWidth={2} />
          Welcome to your personal dashboard
        </div>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <h2 className="font-bold text-2xl mb-4">Your Profile</h2>
        <div className="grid gap-4 w-full">
          <div className="p-4 rounded-lg border">
            <h3 className="font-semibold mb-2">Email</h3>
            <p className="text-muted-foreground">{data.user.email}</p>
          </div>
          <div className="p-4 rounded-lg border">
            <h3 className="font-semibold mb-2">Account Created</h3>
            <p className="text-muted-foreground">
              {new Date(data.user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
