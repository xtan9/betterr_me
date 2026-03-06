import type { SupabaseClient } from "@supabase/supabase-js";
import type { MerchantCategoryRule, MerchantCategoryRuleInsert } from "./types";

/**
 * Database access class for the merchant_category_rules table.
 * Provides household-scoped merchant-to-category mapping rules.
 */
export class MerchantRulesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * List all rules for a household, joined with categories for display.
   * Ordered by merchant_name ASC.
   */
  async getByHousehold(
    householdId: string
  ): Promise<(MerchantCategoryRule & { category: { name: string; icon: string | null; display_name: string | null } })[]> {
    const { data, error } = await this.supabase
      .from("merchant_category_rules")
      .select("*, category:categories(name, icon, display_name)")
      .eq("household_id", householdId)
      .order("merchant_name", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Look up a rule by merchant name (case-insensitive exact match).
   */
  async findByMerchant(
    householdId: string,
    merchantName: string
  ): Promise<MerchantCategoryRule | null> {
    const { data, error } = await this.supabase
      .from("merchant_category_rules")
      .select("*")
      .eq("household_id", householdId)
      .eq("merchant_name_lower", merchantName.toLowerCase())
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }
    return data;
  }

  /**
   * Create a new merchant category rule.
   * Auto-computes merchant_name_lower from merchant_name.
   */
  async create(data: MerchantCategoryRuleInsert): Promise<MerchantCategoryRule> {
    const { data: result, error } = await this.supabase
      .from("merchant_category_rules")
      .insert({
        ...data,
        merchant_name_lower: data.merchant_name.toLowerCase(),
      })
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Delete a merchant category rule.
   */
  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("merchant_category_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  /**
   * Look up rules for multiple merchants at once (for sync pipeline).
   * Returns a Map keyed by lowercase merchant name.
   */
  async findBulk(
    householdId: string,
    merchantNames: string[]
  ): Promise<Map<string, MerchantCategoryRule>> {
    if (merchantNames.length === 0) return new Map();

    const lowerNames = merchantNames.map((n) => n.toLowerCase());

    const { data, error } = await this.supabase
      .from("merchant_category_rules")
      .select("*")
      .eq("household_id", householdId)
      .in("merchant_name_lower", lowerNames);

    if (error) throw error;

    const map = new Map<string, MerchantCategoryRule>();
    for (const rule of data || []) {
      map.set(rule.merchant_name_lower, rule);
    }
    return map;
  }
}
