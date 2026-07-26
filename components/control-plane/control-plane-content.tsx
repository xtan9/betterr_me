"use client";

import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ControlPlaneMember, ControlPlaneStatus, ControlPlaneWorkItem } from "@/lib/control-plane/types";

interface Props {
  initialMembers: ControlPlaneMember[];
  initialWorkItems: ControlPlaneWorkItem[];
}

const statusLabel: Record<ControlPlaneStatus, string> = {
  backlog: "Backlog",
  active_sprint: "Active sprint",
  done: "Done",
};

export function ControlPlaneContent({ initialMembers, initialWorkItems }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [workItems, setWorkItems] = useState(initialWorkItems);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("unassigned");
  const [saving, setSaving] = useState(false);
  const agents = members.filter((member) => member.role === "agent");

  async function refresh() {
    const response = await fetch("/api/control-plane");
    if (!response.ok) throw new Error("Unable to refresh Control Plane");
    const data = await response.json();
    setMembers(data.members);
    setWorkItems(data.workItems);
  }

  async function mutate(body: unknown) {
    setSaving(true);
    try {
      const response = await fetch("/api/control-plane", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Mutation failed");
      await refresh();
      toast.success("Control Plane updated");
    } catch {
      toast.error("The Control Plane request was not authorized or could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  async function createWorkItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await mutate({ action: "create", title, assigneeId: assigneeId === "unassigned" ? null : assigneeId });
    setTitle("");
    setAssigneeId("unassigned");
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title tracking-tight">Control Plane</h1>
          <p className="mt-1 text-body text-muted-foreground">Internal work coordination for authorized BetterR staff.</p>
        </div>
        <Button variant="outline" onClick={() => refresh().catch(() => toast.error("Unable to refresh Control Plane"))} disabled={saving}>
          <RefreshCw className="mr-2 size-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Create work item</CardTitle><CardDescription>Only Control Plane managers can create or change work.</CardDescription></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createWorkItem}>
            <div className="grid flex-1 gap-2"><Label htmlFor="work-title">Title</Label><Input id="work-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} required /></div>
            <div className="grid gap-2 sm:w-56"><Label htmlFor="work-assignee">Assignee</Label><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="work-assignee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{agents.map((agent) => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.display_name}</SelectItem>)}</SelectContent></Select></div>
            <Button type="submit" disabled={saving}><Plus className="mr-2 size-4" />Create</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(statusLabel) as ControlPlaneStatus[]).map((status) => (
          <Card key={status}><CardHeader><CardTitle className="text-section-heading">{statusLabel[status]}</CardTitle></CardHeader><CardContent className="space-y-3">
            {workItems.filter((item) => item.status === status).map((item) => (
              <div key={item.id} className="rounded-card border p-3 space-y-3"><p className="font-medium text-body">{item.title}</p><Select value={item.assignee_id ?? "unassigned"} onValueChange={(value) => mutate({ action: "assign", workItemId: item.id, assigneeId: value === "unassigned" ? null : value })} disabled={saving}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{agents.map((agent) => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.display_name}</SelectItem>)}</SelectContent></Select><Select value={item.status} onValueChange={(value) => mutate({ action: "transition", workItemId: item.id, status: value })} disabled={saving}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(statusLabel) as ControlPlaneStatus[]).map((option) => <SelectItem key={option} value={option}>{statusLabel[option]}</SelectItem>)}</SelectContent></Select></div>
            ))}
            {workItems.every((item) => item.status !== status) && <p className="text-caption text-muted-foreground">No work items.</p>}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
