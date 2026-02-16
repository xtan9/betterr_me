import { cookies } from "next/headers";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";

export async function SidebarShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const pinnedCookie = cookieStore.get("sidebar_pinned")?.value;
  const defaultPinned = pinnedCookie !== "false"; // Default to pinned for first-time visitors

  return (
    <SidebarLayout defaultPinned={defaultPinned}>{children}</SidebarLayout>
  );
}
