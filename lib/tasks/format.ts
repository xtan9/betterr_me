export function getPriorityColor(priority: number): string {
  switch (priority) {
    case 1:
      return "text-priority-low";
    case 2:
      return "text-priority-medium";
    case 3:
      return "text-priority-high";
    default:
      return "text-priority-none";
  }
}
