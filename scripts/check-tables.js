// Quick script to check what tables exist in Supabase
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ugkhvvmjdrshuopgaaje.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVna2h2dm1qZHJzaHVvcGdhYWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTMyOTYsImV4cCI6MjA4NTIyOTI5Nn0.y-ZMT_-mgLkobRLOlw-jBKQOsTAE2Z9G38Lh0gHvvCU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking Supabase tables...\n');

  // Try to query some expected tables
  const tables = [
    'profiles',
    'categories', 
    'habits',
    'habit_logs',
    'streaks',
    'journal_entries',
    'journal_templates',
    'habit_journal_links',
    'journal_media',
    'user_stats',
    'achievements',
    'user_achievements',
    'daily_summaries',
    'habit_analytics'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(0);
      if (error) {
        console.log(`❌ ${table}: NOT FOUND (${error.message})`);
      } else {
        console.log(`✅ ${table}: EXISTS`);
      }
    } catch (err) {
      console.log(`❌ ${table}: ERROR (${err.message})`);
    }
  }
}

checkTables();
