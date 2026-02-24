import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { JournalEntriesDB, JournalEntryLinksDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import { journalLinkSchema } from "@/lib/validations/journal";
import { log } from "@/lib/logger";
import type { JournalLinkType } from "@/lib/db/types";

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      const { data: habits } = await supabase
        .from("habits")
        .select("id, name")
        .in("id", habitIds);
      for (const h of habits || []) {
        nameMap.set(h.id, h.name);
      }
    }

    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("id", taskIds);
      for (const t of tasks || []) {
        nameMap.set(t.id, t.title);
      }
    }

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, journalLinkSchema);
    if (!validation.success) return validation.response;

    const { link_type, link_id } = validation.data;

    // Verify entry ownership
    const journalDB = new JournalEntriesDB(supabase);
    const entry = await journalDB.getEntry(id, user.id);
    if (!entry) {
      return NextResponse.json(
        { error: "Journal entry not found" },
        { status: 404 }
      );
    }

    const linksDB = new JournalEntryLinksDB(supabase);
    const link = await linksDB.addLink({
      entry_id: id,
      link_type,
      link_id,
    });

    return NextResponse.json({ link }, { status: 201 });
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const linkId = request.nextUrl.searchParams.get("link_id");
    if (!linkId) {
      return NextResponse.json(
        { error: "link_id query parameter is required" },
        { status: 400 }
      );
    }

    const linksDB = new JournalEntryLinksDB(supabase);
    await linksDB.removeLink(linkId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("DELETE /api/journal/[id]/links error", error);
    return NextResponse.json(
      { error: "Failed to remove journal entry link" },
      { status: 500 }
    );
  }
}
