import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
