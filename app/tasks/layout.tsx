import { AppLayout } from "@/components/layouts/app-layout";

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
