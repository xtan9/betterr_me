import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function HabitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
