import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ControlPlaneContent } from "@/components/control-plane/control-plane-content";
import type { ControlPlaneMember, ControlPlaneWorkItem } from "@/lib/control-plane/types";

export default async function ControlPlanePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  const [membersResult, workItemsResult] = await Promise.all([
    supabase.rpc("control_plane_list_members"),
    supabase.rpc("control_plane_list_work_items"),
  ]);

  // The RPC independently requires an enabled control-plane member. Do not
  // turn an authorization failure into an empty, misleading dashboard or a
  // server error. The segment's forbidden page is deliberately non-enumerating.
  if (membersResult.error || workItemsResult.error) {
    forbidden();
  }

  return (
    <ControlPlaneContent
      initialMembers={membersResult.data as ControlPlaneMember[]}
      initialWorkItems={workItemsResult.data as ControlPlaneWorkItem[]}
    />
  );
}
