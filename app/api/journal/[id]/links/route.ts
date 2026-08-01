import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { JournalEntriesDB, JournalEntryLinksDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import {
  journalEntryIdSchema,
  journalLinkIdSchema,
  journalLinkSchema,
} from "@/lib/validations/journal";
import {
  createJournalWrites,
  toJournalLinkResponse,
  type JournalLinkOutcome,
  type JournalUnlinkOutcome,
} from "@/lib/journal/writes";
import { log } from "@/lib/logger";
import type { JournalLinkType } from "@/lib/db/types";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

function validateJournalEntryId(id: string): string | NextResponse {
  const validation = journalEntryIdSchema.safeParse(id);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: { id: ["Invalid entry ID"] } },
      { status: 400 },
    );
  }
  return validation.data;
}

function mapLinkOutcome(outcome: JournalLinkOutcome): NextResponse {
  switch (outcome.type) {
    case "linked":
      return NextResponse.json(
        { link: toJournalLinkResponse(outcome.link) },
        { status: 201 },
      );
    case "already-applied":
      return NextResponse.json({ link: toJournalLinkResponse(outcome.link) });
    case "not-found":
      return NextResponse.json(
        { error: "Journal entry or link target not found" },
        { status: 404 },
      );
    case "conflict":
      return NextResponse.json(
        { error: "Journal entry link conflict" },
        { status: 409 },
      );
    case "invalid":
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
  }
}

function mapUnlinkOutcome(outcome: JournalUnlinkOutcome): NextResponse {
  switch (outcome.type) {
    case "unlinked":
      return NextResponse.json({ success: true });
    case "not-found":
      return NextResponse.json(
        { error: "Journal entry link not found" },
        { status: 404 },
      );
    case "conflict":
      return NextResponse.json(
        { error: "Journal entry link conflict" },
        { status: 409 },
      );
    case "invalid":
      return NextResponse.json(
        { error: outcome.message, field: outcome.field },
        { status: 400 },
      );
  }
}

/**
 * GET /api/journal/[id]/links
 *
 * Returns enriched links for a journal entry with habit/task names.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    // Verify entry ownership
    const journalDB = new JournalEntriesDB(supabase);
    const ownerEntry = await journalDB.getEntry(id, userId);
    if (!ownerEntry) {
      return NextResponse.json(
        { error: "Journal entry not found" },
        { status: 404 }
      );
    }

    const linksDB = new JournalEntryLinksDB(supabase);
    const rawLinks = await linksDB.getLinksForEntry(id);

    // Collect IDs by type for batch enrichment
    const habitIds: string[] = [];
    const taskIds: string[] = [];
    const projectIds: string[] = [];

    for (const link of rawLinks) {
      if (link.link_type === "habit") habitIds.push(link.link_id);
      else if (link.link_type === "task") taskIds.push(link.link_id);
      else if (link.link_type === "project") projectIds.push(link.link_id);
    }

    // Batch-query names (no N+1)
    const nameMap = new Map<string, string>();

    if (habitIds.length > 0) {
      const { data: habits, error: habitsError } = await supabase
        .from("habits")
        .select("id, name")
        .in("id", habitIds);
      if (habitsError) log.warn("Failed to enrich habit names", { error: habitsError.message });
      for (const h of habits || []) {
        nameMap.set(h.id, h.name);
      }
    }

    if (taskIds.length > 0) {
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", taskIds);
      if (tasksError) log.warn("Failed to enrich task names", { error: tasksError.message });
      for (const t of tasks || []) {
        nameMap.set(t.id, t.title);
      }
    }

    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      if (projectsError) log.warn("Failed to enrich project names", { error: projectsError.message });
      for (const p of projects || []) {
        nameMap.set(p.id, p.name);
      }
    }

    // Enrich links with names
    const enrichedLinks = rawLinks.map((link) => ({
      id: link.id,
      link_type: link.link_type as JournalLinkType,
      link_id: link.link_id,
      name: nameMap.get(link.link_id) ?? "(deleted)",
      created_at: link.created_at,
    }));

    return NextResponse.json({ links: enrichedLinks });
  } catch (error) {
    log.error("GET /api/journal/[id]/links error", error);
    return NextResponse.json(
      { error: "Failed to fetch journal entry links" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/journal/[id]/links
 *
 * Add a link between a journal entry and a habit/task/project.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const entryId = validateJournalEntryId(id);
    if (typeof entryId !== "string") return entryId;

    const body = await request.json();
    const validation = validateRequestBody(body, journalLinkSchema);
    if (!validation.success) return validation.response;

    const { link_type, link_id } = validation.data;

    const outcome = await createJournalWrites(supabase).link({
      userId,
      entryId,
      linkType: link_type,
      targetId: link_id,
    });
    return mapLinkOutcome(outcome);
  } catch (error) {
    log.error("POST /api/journal/[id]/links error", error);
    return NextResponse.json(
      { error: "Failed to add journal entry link" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/journal/[id]/links?link_id=UUID
 *
 * Remove a link from a journal entry.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const entryId = validateJournalEntryId(id);
    if (typeof entryId !== "string") return entryId;

    const linkId = request.nextUrl.searchParams.get("link_id");
    if (!linkId) {
      return NextResponse.json(
        { error: "link_id query parameter is required" },
        { status: 400 }
      );
    }

    const linkIdValidation = journalLinkIdSchema.safeParse(linkId);
    if (!linkIdValidation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: { link_id: ["Invalid link ID"] } },
        { status: 400 },
      );
    }

    const outcome = await createJournalWrites(supabase).unlink({
      userId,
      entryId,
      linkId: linkIdValidation.data,
    });
    return mapUnlinkOutcome(outcome);
  } catch (error) {
    log.error("DELETE /api/journal/[id]/links error", error);
    return NextResponse.json(
      { error: "Failed to remove journal entry link" },
      { status: 500 }
    );
  }
}
