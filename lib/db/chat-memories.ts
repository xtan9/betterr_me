import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatMemory {
  id: string;
  user_id: string;
  path: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export class ChatMemoriesDB {
  constructor(private supabase: SupabaseClient) {}

  async list(userId: string): Promise<ChatMemory[]> {
    const { data, error } = await this.supabase
      .from("chat_memories")
      .select("*")
      .eq("user_id", userId)
      .order("path", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async get(userId: string, path: string): Promise<ChatMemory | null> {
    const { data, error } = await this.supabase
      .from("chat_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsert(
    userId: string,
    path: string,
    content: string,
  ): Promise<ChatMemory> {
    const { data, error } = await this.supabase
      .from("chat_memories")
      .upsert(
        { user_id: userId, path, content, updated_at: new Date().toISOString() },
        { onConflict: "user_id,path" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async delete(userId: string, path: string): Promise<void> {
    const { error } = await this.supabase
      .from("chat_memories")
      .delete()
      .eq("user_id", userId)
      .eq("path", path);
    if (error) throw error;
  }

  async rename(
    userId: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("chat_memories")
      .update({ path: newPath, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("path", oldPath);
    if (error) throw error;
  }
}
