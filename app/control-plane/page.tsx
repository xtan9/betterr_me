import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ControlPlaneContent } from "@/components/control-plane/control-plane-content";
import { ControlPlaneAccessDenied } from "@/components/control-plane/control-plane-access-denied";
import { SidebarShell } from "@/components/layouts/sidebar-shell";
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
  // turn an authorization failure into an empty, misleading dashboard.
  if (membersResult.error?.code === "42501" || workItemsResult.error?.code === "42501") {
    return <ControlPlaneAccessDenied />;
  }
  if (membersResult.error || workItemsResult.error) throw new Error("Unable to load Control Plane data");

  const members = membersResult.data as ControlPlaneMember[];
  const canManage = members.some((member) => member.user_id === user.id && member.role === "manager");

  return (
    <SidebarShell>
      <ControlPlaneContent
        canManage={canManage}
        initialMembers={members}
        initialWorkItems={workItemsResult.data as ControlPlaneWorkItem[]}
      />
    </SidebarShell>
  );
}
