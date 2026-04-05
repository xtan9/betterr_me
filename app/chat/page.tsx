import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatContent } from "@/components/chat/chat-content";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { id } = await searchParams;

  return <ChatContent conversationId={id} />;
}
