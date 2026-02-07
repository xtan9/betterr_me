import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProfilesDB } from "@/lib/db";
import type { ProfileUpdate } from "@/lib/db/types";

/**
 * GET /api/profile
 * Get current user's profile
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(user.id);

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profilesDB = new ProfilesDB(supabase);
    const body = await request.json();

    // Build update object
    const updates: ProfileUpdate = {};

    if (body.full_name !== undefined) {
      updates.full_name = body.full_name?.trim() || null;
    }

    if (body.avatar_url !== undefined) {
      updates.avatar_url = body.avatar_url?.trim() || null;
    }

    if (body.preferences !== undefined) {
      updates.preferences = body.preferences;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const profile = await profilesDB.updateProfile(user.id, updates);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    console.error("PATCH /api/profile error:", error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
