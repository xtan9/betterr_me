import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CardHeaderWithActionsProps {
  title: string;
  href?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function CardHeaderWithActions({
  title,
  href,
  actions,
  className,
}: CardHeaderWithActionsProps) {
  const titleNode = (
    <h2 className="font-display text-section-heading">{title}</h2>
  );

  return (
    <CardHeader
      className={cn(
        "flex flex-row items-center justify-between space-y-0 pb-4",
        className
      )}
    >
      {href ? (
        <Link href={href} className="group flex items-center gap-1">
          {titleNode}
          <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none" />
        </Link>
      ) : (
        titleNode
      )}
      {actions}
    </CardHeader>
  );
}
