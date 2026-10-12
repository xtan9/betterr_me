"use client";

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ReviewedDeleteDialog } from '@/components/tasks/reviewed-delete-dialog';

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  onSuccess?: () => void;
}
export function ProjectDeleteDialog({ open, onOpenChange, projectName, projectId, onSuccess }: ProjectDeleteDialogProps) {
  const t = useTranslations('projects');
  return <ReviewedDeleteDialog open={open} onOpenChange={onOpenChange} kind="project" id={projectId} title={projectName}
    onSuccess={() => { toast.success(t('deleteSuccess')); onSuccess?.(); }} />;
}
