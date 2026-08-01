import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

const createWorkItemSchema = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(1).max(500),
  assigneeId: z.string().uuid().nullable().optional(),
  blockers: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
  evidenceUrls: z.array(z.string().url().max(2000)).max(50).default([]),
});

const assignWorkItemSchema = z.object({
  action: z.literal("assign"),
  workItemId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});

const transitionWorkItemSchema = z.object({
  action: z.literal("transition"),
  workItemId: z.string().uuid(),
  status: z.enum(["backlog", "active_sprint", "done"]),
});

const requestSchema = z.discriminatedUnion("action", [
  createWorkItemSchema,
  assignWorkItemSchema,
  transitionWorkItemSchema,
]);

export async function GET(request: Request = new Request("http://localhost")) {
  const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
  // Keep the control plane fail-closed: do not reveal whether auth or access checks failed.
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { client: supabase } = auth;
  try {
    const [members, workItems] = await Promise.all([
      supabase.rpc("control_plane_list_members"),
      supabase.rpc("control_plane_list_work_items"),
    ]);
    if (members.error || workItems.error) {
      return NextResponse.json({ error: "Control Plane access denied" }, { status: 403 });
    }
    return NextResponse.json({ members: members.data, workItems: workItems.data });
  } catch {
    return NextResponse.json({ error: "Control Plane access denied" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
  // Keep the control plane fail-closed: do not reveal whether auth or access checks failed.
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { client: supabase } = auth;

  let parsed: ReturnType<typeof requestSchema.safeParse>;
  try {
    parsed = requestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await supabase.rpc("control_plane_create_work_item", {
          p_title: input.title,
          p_assignee_id: input.assigneeId ?? null,
          p_lease_expires_at: null,
          p_blockers: input.blockers,
          p_evidence_urls: input.evidenceUrls,
        })
      : input.action === "assign"
        ? await supabase.rpc("control_plane_assign_work_item", {
            p_work_item_id: input.workItemId,
            p_assignee_id: input.assigneeId,
            p_lease_expires_at: null,
          })
        : await supabase.rpc("control_plane_transition_work_item", {
            p_work_item_id: input.workItemId,
            p_to_status: input.status,
          });

    if (result.error) {
      return NextResponse.json({ error: "Control Plane mutation denied" }, { status: 403 });
    }
    return NextResponse.json({ workItem: result.data });
  } catch {
    return NextResponse.json({ error: "Control Plane mutation denied" }, { status: 403 });
  }
}
