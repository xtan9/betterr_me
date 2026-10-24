import { SidebarShell } from '@/components/layouts/sidebar-shell';

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <SidebarShell>{children}</SidebarShell>;
}
