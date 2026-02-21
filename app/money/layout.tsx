import { SidebarShell } from "@/components/layouts/sidebar-shell";

export default async function MoneyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarShell>{children}</SidebarShell>;
}
