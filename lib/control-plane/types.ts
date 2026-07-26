export type ControlPlaneRole = "manager" | "agent" | "reviewer";
export type ControlPlaneStatus = "backlog" | "active_sprint" | "done";

export interface ControlPlaneMember {
  user_id: string;
  display_name: string;
  role: ControlPlaneRole;
}

export interface ControlPlaneWorkItem {
  id: string;
  title: string;
  assignee_id: string | null;
  status: ControlPlaneStatus;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}
