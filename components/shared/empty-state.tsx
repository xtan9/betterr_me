import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColorClass?: string;
  iconBgClass?: string;
  variant?: "default" | "celebration";
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  iconColorClass,
  iconBgClass,
  variant = "default",
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        variant === "celebration" &&
          "bg-gradient-to-b from-empty-state-celebration-bg/50 to-transparent rounded-card",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center size-16 rounded-pill mb-4",
          iconBgClass ?? "bg-muted"
        )}
      >
        <Icon className={cn("size-8", iconColorClass ?? "text-muted-foreground")} />
      </div>

      <h3 className="text-section-heading text-foreground mb-2">{title}</h3>

      <p className="text-body text-muted-foreground max-w-xs">{description}</p>

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
