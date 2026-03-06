"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import useSWR from "swr";
import {
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMoneyCategories as useCategories } from "@/lib/hooks/use-money-categories";
import { fetcher } from "@/lib/fetcher";
import type { MerchantCategoryRule } from "@/lib/db/types";

interface MerchantRuleWithCategory extends MerchantCategoryRule {
  category: { name: string; icon: string | null; display_name: string | null };
}

export function CategoryManager() {
  const t = useTranslations("money");
  const { categories, mutate: mutateCategories } = useCategories();
  const {
    data: rulesData,
    mutate: mutateRules,
  } = useSWR<{ rules: MerchantRuleWithCategory[] }>(
    "/api/money/merchant-rules",
    fetcher,
    { revalidateOnFocus: false }
  );

  const rules = rulesData?.rules ?? [];

  // New category form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newColor, setNewColor] = useState("#6B7280");
  const [isCreating, setIsCreating] = useState(false);

  // Hidden categories tracking
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleCreateCategory = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/money/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          icon: newIcon.trim() || null,
          color: newColor || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to create category");

      setNewName("");
      setNewIcon("");
      setNewColor("#6B7280");
      setShowNewForm(false);
      mutateCategories();
    } catch {
      toast.error("Failed to create category");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleHidden = async (categoryId: string, isHidden: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(categoryId));
    try {
      if (isHidden) {
        // Unhide
        await fetch("/api/money/categories/hidden", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_id: categoryId }),
        });
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(categoryId);
          return next;
        });
      } else {
        // Hide
        await fetch("/api/money/categories/hidden", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_id: categoryId }),
        });
        setHiddenIds((prev) => new Set(prev).add(categoryId));
      }
      mutateCategories();
    } catch {
      toast.error("Failed to update category visibility");
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setDeletingIds((prev) => new Set(prev).add(categoryId));
    try {
      const res = await fetch(`/api/money/categories/${categoryId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete category");
      mutateCategories();
    } catch {
      toast.error("Failed to delete category");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/money/merchant-rules/${ruleId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete rule");
      mutateRules();
    } catch {
      toast.error("Failed to delete merchant rule");
    }
  };

  return (
    <div className="space-y-8">
      {/* Categories Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("categories.title")}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewForm(!showNewForm)}
          >
            <Plus className="mr-1 size-3.5" />
            {t("categories.newCategory")}
          </Button>
        </div>

        {/* New category form */}
        {showNewForm && (
          <div className="mb-4 space-y-3 rounded-lg border border-money-border bg-money-surface p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("categories.name")}
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("categories.name")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("categories.icon")}
                </label>
                <Input
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  placeholder={t("categories.icon")}
                  maxLength={4}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("categories.color")}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer p-1"
                  />
                  <Input
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="#6B7280"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNewForm(false)}
              >
                {t("transactions.cancelSplits")}
              </Button>
              <Button
                size="sm"
                disabled={!newName.trim() || isCreating}
                onClick={handleCreateCategory}
              >
                {isCreating && (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                )}
                {t("categories.newCategory")}
              </Button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="divide-y divide-money-border rounded-lg border border-money-border">
          {categories.map((cat) => {
            const isHidden = hiddenIds.has(cat.id);
            const isToggling = togglingIds.has(cat.id);
            const isDeleting = deletingIds.has(cat.id);

            return (
              <div
                key={cat.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  {cat.icon && (
                    <span className="text-sm" aria-hidden="true">
                      {cat.icon}
                    </span>
                  )}
                  {cat.color && (
                    <span
                      className="inline-block size-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-sm font-medium">
                    {cat.display_name || cat.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal"
                  >
                    {cat.is_system
                      ? t("categories.systemCategory")
                      : t("categories.customCategory")}
                  </Badge>
                </div>

                <div className="flex items-center gap-1">
                  {cat.is_system ? (
                    // System categories: show/hide toggle
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0"
                      disabled={isToggling}
                      onClick={() => handleToggleHidden(cat.id, isHidden)}
                      title={
                        isHidden
                          ? t("categories.showCategory")
                          : t("categories.hideCategory")
                      }
                    >
                      {isHidden ? (
                        <EyeOff className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                  ) : (
                    // Custom categories: edit and delete
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        title={t("categories.editCategory")}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-destructive hover:text-destructive"
                        disabled={isDeleting}
                        onClick={() => handleDeleteCategory(cat.id)}
                        title={t("categories.deleteCategory")}
                      >
                        {isDeleting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Merchant Rules Section */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">
          {t("merchantRules.title")}
        </h2>

        {rules.length === 0 ? (
          <div className="rounded-lg border border-money-border bg-money-surface px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("merchantRules.noRules")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-money-border rounded-lg border border-money-border">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{rule.merchant_name}</span>
                  <span className="text-muted-foreground">&rarr;</span>
                  <Badge variant="outline" className="gap-1">
                    {rule.category?.icon && (
                      <span aria-hidden="true">{rule.category.icon}</span>
                    )}
                    {rule.category?.display_name || rule.category?.name}
                  </Badge>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteRule(rule.id)}
                  title={t("merchantRules.deleteRule")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
