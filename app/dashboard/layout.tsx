import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
