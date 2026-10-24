import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FocusHistoryPage } from './focus-history-page';

export default async function FocusPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/auth/login');
  return <FocusHistoryPage ownerId={user.id} />;
}
