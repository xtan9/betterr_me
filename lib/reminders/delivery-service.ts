import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReminderDelivery,
  type ReminderDeliveryOptions,
} from "./delivery";
import { SupabaseReminderDeliveryPersistence } from "./delivery-persistence";

/** Construct the shared Reminder Delivery authority for an application adapter. */
export function createReminderDelivery(
  supabase: SupabaseClient,
  options: ReminderDeliveryOptions = {},
) {
  return new ReminderDelivery(
    new SupabaseReminderDeliveryPersistence(supabase),
    options,
  );
}
