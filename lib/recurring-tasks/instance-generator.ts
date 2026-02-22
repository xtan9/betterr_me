import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecurringTask, TaskInsert } from '@/lib/db/types';
import { getOccurrencesInRange } from './recurrence';
import { log } from '@/lib/logger';

/**
 * Ensure task instances exist for all active recurring tasks through the given date.
 * Called on dashboard load and task list load to generate instances on-demand.
 *
 * For each active recurring task where next_generate_date <= throughDate:
 * 1. Compute occurrence dates from next_generate_date through throughDate
 * 2. Skip dates that already have instances (recurring_task_id + original_date unique index)
 * 3. Create missing instances as regular task rows
 * 4. Update the template's next_generate_date and instances_generated
 */
export async function ensureRecurringInstances(
  supabase: SupabaseClient,
  userId: string,
  throughDate: string
): Promise<void> {
  // Find templates that need instance generation
  const { data: templates, error: fetchErr } = await supabase
    .from('recurring_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('next_generate_date', throughDate);

  if (fetchErr) {
    throw new Error(`ensureRecurringInstances: failed to fetch templates: ${fetchErr.message}`);
  }
  if (!templates || templates.length === 0) return;

  for (const template of templates as RecurringTask[]) {
    try {
      await generateInstancesForTemplate(supabase, template, userId, throughDate);
    } catch (err) {
      log.error('ensureRecurringInstances: failed for template', err, {
        templateId: template.id,
      });
    }
  }
}

async function generateInstancesForTemplate(
  supabase: SupabaseClient,
  template: RecurringTask,
  userId: string,
  throughDate: string
): Promise<void> {
  const rangeStart = template.next_generate_date ?? template.start_date;

  // Apply end_date constraint
  let rangeEnd = throughDate;
  if (template.end_type === 'on_date' && template.end_date) {
    if (template.end_date < rangeEnd) {
      rangeEnd = template.end_date;
    }
  }

  // Get occurrence dates
  const occurrences = getOccurrencesInRange(
    template.recurrence_rule,
    template.start_date,
    rangeStart,
    rangeEnd
  );

  if (occurrences.length === 0) {
    // Still advance next_generate_date even if no occurrences in this window
    await updateTemplateAfterGeneration(supabase, template, throughDate, 0);
    return;
  }

  // Check end_count constraint
  let allowedOccurrences = occurrences;
  if (template.end_type === 'after_count' && template.end_count) {
    const remaining = template.end_count - template.instances_generated;
    if (remaining <= 0) {
      // Archive the template — limit reached
      const { error: archiveErr } = await supabase
        .from('recurring_tasks')
        .update({ status: 'archived' })
        .eq('id', template.id);
      if (archiveErr) {
        log.error('Failed to archive template at count limit', archiveErr, { templateId: template.id });
      }
      return;
    }
    allowedOccurrences = occurrences.slice(0, remaining);
  }

  // Find existing instances to avoid duplicates
  const { data: existingInstances, error: existingErr } = await supabase
    .from('tasks')
    .select('original_date')
    .eq('recurring_task_id', template.id)
    .in('original_date', allowedOccurrences);

  if (existingErr) {
    throw new Error(`Failed to check existing instances: ${existingErr.message}`);
  }

  const existingDates = new Set(
    (existingInstances ?? []).map((i: { original_date: string }) => i.original_date)
  );

  // Create missing instances
  const newInstances: TaskInsert[] = allowedOccurrences
    .filter(date => !existingDates.has(date))
    .map(date => ({
      user_id: userId,
      title: template.title,
      description: template.description,
      priority: template.priority,
      category_id: template.category_id,
      due_date: date,
      due_time: template.due_time,
      is_completed: false,
      status: 'todo' as const,     // Phase 13: recurring instances start as todo
      section: 'personal',          // Phase 13: default section
      recurring_task_id: template.id,
      is_exception: false,
      original_date: date,
    }));

  if (newInstances.length > 0) {
    const { error: insertErr } = await supabase
      .from('tasks')
      .insert(newInstances);

    if (insertErr) {
      log.error('Failed to insert recurring instances', insertErr, {
        templateId: template.id,
        count: newInstances.length,
      });
      return;
    }
  }

  const totalGenerated = newInstances.length;
  await updateTemplateAfterGeneration(supabase, template, throughDate, totalGenerated);
}

async function updateTemplateAfterGeneration(
  supabase: SupabaseClient,
  template: RecurringTask,
  throughDate: string,
  newCount: number
): Promise<void> {
  // next_generate_date = day after throughDate, so we don't re-check this range
  const [y, m, d] = throughDate.split('-').map(Number);
  const nextDay = new Date(y, m - 1, d + 1);
  const nextGenDate = [
    nextDay.getFullYear(),
    String(nextDay.getMonth() + 1).padStart(2, '0'),
    String(nextDay.getDate()).padStart(2, '0'),
  ].join('-');

  const { error } = await supabase
    .from('recurring_tasks')
    .update({
      next_generate_date: nextGenDate,
      instances_generated: template.instances_generated + newCount,
    })
    .eq('id', template.id);

  if (error) {
    log.error('Failed to update template after generation', error, {
      templateId: template.id,
    });
  }
}
