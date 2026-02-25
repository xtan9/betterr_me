import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
