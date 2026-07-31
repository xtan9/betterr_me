import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatMessageInsert } from './types';

export interface CompletedTurn {
  conversationId: string;
  turnId: string;
  userContent: string;
  assistantContent: string;
  assistantModel: string;
}

export interface SavedTurnResult {
  outcome: 'saved' | 'already_saved';
  messages: ChatMessage[];
}

export class ChatMessagesDB {
  constructor(private supabase: SupabaseClient) {}

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('turn_position', { ascending: true, nullsFirst: true });
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

  async saveCompletedTurn(turn: CompletedTurn): Promise<SavedTurnResult> {
    const { data, error } = await this.supabase.rpc('save_completed_chat_turn', {
      p_conversation_id: turn.conversationId,
      p_turn_id: turn.turnId,
      p_user_content: turn.userContent,
      p_assistant_content: turn.assistantContent,
      p_assistant_model: turn.assistantModel,
    });
    if (error) throw error;
    return data as SavedTurnResult;
  }

  async deleteMessagesByConversation(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('chat_messages')
      .delete()
      .eq('conversation_id', conversationId);
    if (error) throw error;
  }
}
