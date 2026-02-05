import { AppLayout } from "@/components/layouts/app-layout";

export default function HabitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
