import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, ConversationInsert, ConversationUpdate } from './types';
import type { ChatMessage } from './types';

export interface InitialTurn {
  userId: string;
  turnId: string;
  userContent: string;
  assistantContent: string;
  assistantModel: string;
  title: string;
}

export interface InitialTurnResult {
  outcome: 'saved' | 'already_saved';
  conversationId: string;
  title: string;
  messages: ChatMessage[];
}

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

  async createInitialTurn(turn: InitialTurn): Promise<InitialTurnResult> {
    const { data, error } = await this.supabase.rpc('save_initial_chat_turn', {
      p_user_id: turn.userId,
      p_turn_id: turn.turnId,
      p_user_content: turn.userContent,
      p_assistant_content: turn.assistantContent,
      p_assistant_model: turn.assistantModel,
      p_title: turn.title,
    });
    if (error) throw error;
    return data as InitialTurnResult;
  }

  async updateConversation(id: string, userId: string, updates: ConversationUpdate): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteConversation(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  }
}
