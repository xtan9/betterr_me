"use client";

import { useState } from "react";
import { AlertTriangle, ClipboardList, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layouts/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ControlPlaneMember, ControlPlaneStatus, ControlPlaneWorkItem } from "@/lib/control-plane/types";

interface Props { canManage: boolean; initialMembers: ControlPlaneMember[]; initialWorkItems: ControlPlaneWorkItem[]; }
const statuses: ControlPlaneStatus[] = ["backlog", "active_sprint", "done"];
const statusLabel: Record<ControlPlaneStatus, string> = { backlog: "Backlog", active_sprint: "In progress", done: "Done" };

export function ControlPlaneContent({ canManage, initialMembers, initialWorkItems }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [workItems, setWorkItems] = useState(initialWorkItems);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("unassigned");
  const [selected, setSelected] = useState<ControlPlaneWorkItem | null>(null);
  const [editAssignee, setEditAssignee] = useState("unassigned");
  const [editStatus, setEditStatus] = useState<ControlPlaneStatus>("backlog");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const agents = members.filter((member) => member.role === "agent");

  async function refresh() {
    setRefreshing(true); setError("");
    try { const response = await fetch("/api/control-plane"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to refresh Control Plane"); setMembers(data.members); setWorkItems(data.workItems); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh Control Plane"); }
    finally { setRefreshing(false); }
  }
  async function mutate(body: unknown) {
    const response = await fetch("/api/control-plane", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Control Plane mutation denied"); await refresh();
  }
  async function createWorkItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!title.trim()) return; setSaving(true); setError("");
    try { await mutate({ action: "create", title, assigneeId: assigneeId === "unassigned" ? null : assigneeId }); setTitle(""); setAssigneeId("unassigned"); toast.success("Work item created"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t update Control Plane"); }
    finally { setSaving(false); }
  }
  function openItem(item: ControlPlaneWorkItem) { setSelected(item); setEditAssignee(item.assignee_id ?? "unassigned"); setEditStatus(item.status); }
  async function saveItem() {
    if (!selected) return; setSaving(true); setError("");
    try { if (editAssignee !== (selected.assignee_id ?? "unassigned")) await mutate({ action: "assign", workItemId: selected.id, assigneeId: editAssignee === "unassigned" ? null : editAssignee }); if (editStatus !== selected.status) await mutate({ action: "transition", workItemId: selected.id, status: editStatus }); setSelected(null); toast.success("Control Plane updated"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn’t update Control Plane"); }
    finally { setSaving(false); }
  }
  const allowedStatuses: ControlPlaneStatus[] = selected?.status === "backlog" ? ["backlog", "active_sprint"] : selected?.status === "active_sprint" ? ["active_sprint", "done"] : ["done"];

  return <main className="mx-auto max-w-content space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <PageHeader title="Control Plane" subtitle="Internal work coordination" actions={<Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw className={`mr-2 size-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing…" : "Refresh"}</Button>} />
    {canManage && <Card><CardHeader><CardTitle>Create work item</CardTitle><CardDescription>Only Control Plane managers can create or change work.</CardDescription></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_224px_104px] md:items-end" onSubmit={createWorkItem}><div className="grid gap-2"><Label htmlFor="work-title">Title</Label><Input id="work-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} required /></div><div className="grid gap-2"><Label htmlFor="work-assignee">Assignee</Label><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger id="work-assignee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{agents.map((agent) => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.display_name}</SelectItem>)}</SelectContent></Select></div><Button type="submit" disabled={saving} className="w-full"><Plus className="mr-2 size-4" />{saving ? "Creating…" : "Create"}</Button></form></CardContent></Card>}
    {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Couldn’t update Control Plane</AlertTitle><AlertDescription><p>{error}</p><Button variant="outline" size="sm" className="mt-2" onClick={refresh}>Try again</Button></AlertDescription></Alert>}
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Work items by status">{statuses.map((status) => <section className="rounded-card border bg-muted/30 p-3" key={status}><header className="flex items-center justify-between"><h2 className="text-section-heading">{statusLabel[status]}</h2><span className="text-caption text-muted-foreground">{workItems.filter((item) => item.status === status).length}</span></header><div className="mt-4 space-y-4">{workItems.filter((item) => item.status === status).map((item) => <button className="w-full rounded-card border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" key={item.id} onClick={() => openItem(item)}><span className="line-clamp-2 text-body font-medium">{item.title}</span><span className="mt-2 block text-caption text-muted-foreground">{members.find((member) => member.user_id === item.assignee_id)?.display_name ?? "Unassigned"}</span></button>)}{workItems.every((item) => item.status !== status) && <EmptyState className="py-7" icon={ClipboardList} title="No work items" description="Create a work item or move one here." iconBgClass="size-10 mb-2 bg-muted" iconColorClass="size-5" />}</div></section>)}</section>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Manage assignment and status. Changes are recorded through the existing Control Plane workflow.</DialogDescription></DialogHeader>{selected && <div className="grid gap-4"><div className="grid gap-2"><Label htmlFor="detail-assignee">Assignee</Label><Select value={editAssignee} onValueChange={setEditAssignee} disabled={!canManage || saving}><SelectTrigger id="detail-assignee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{agents.map((agent) => <SelectItem key={agent.user_id} value={agent.user_id}>{agent.display_name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="detail-status">Status</Label><Select value={editStatus} onValueChange={(value) => setEditStatus(value as ControlPlaneStatus)} disabled={!canManage || saving}><SelectTrigger id="detail-status"><SelectValue /></SelectTrigger><SelectContent>{allowedStatuses.map((status) => <SelectItem key={status} value={status}>{statusLabel[status]}</SelectItem>)}</SelectContent></Select></div><section className="border-t pt-4"><h3 className="text-body font-medium">Activity</h3><p className="mt-2 text-caption text-muted-foreground">Created {new Date(selected.created_at).toLocaleString()} · Last updated {new Date(selected.updated_at).toLocaleString()}</p></section></div>}<DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>Cancel</Button>{canManage && <Button onClick={saveItem} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}</DialogFooter></DialogContent></Dialog>
  </main>;
}
