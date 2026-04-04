import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
