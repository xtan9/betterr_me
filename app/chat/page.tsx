import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatContent } from "@/components/chat/chat-content";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <ChatContent />;
}
