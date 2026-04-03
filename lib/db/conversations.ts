import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, ConversationInsert, ConversationUpdate } from './types';

export class ConversationsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createConversation(conversation: ConversationInsert): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .insert(conversation)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateConversation(id: string, updates: ConversationUpdate): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteConversation(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('conversations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
