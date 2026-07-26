import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
