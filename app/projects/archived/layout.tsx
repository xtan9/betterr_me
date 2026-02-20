import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function ArchivedProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
