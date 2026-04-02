import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatMessageInsert } from './types';

export class ChatMessagesDB {
  constructor(private supabase: SupabaseClient) {}

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async createMessage(message: ChatMessageInsert): Promise<ChatMessage> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert(message)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createMessages(messages: ChatMessageInsert[]): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .insert(messages)
      .select();
    if (error) throw error;
    return data || [];
  }

  async deleteMessagesByConversation(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('chat_messages')
      .delete()
      .eq('conversation_id', conversationId);
    if (error) throw error;
  }
}
