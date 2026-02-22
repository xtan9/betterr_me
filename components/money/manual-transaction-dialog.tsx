"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  manualTransactionSchema,
  type ManualTransactionInput,
} from "@/lib/validations/plaid";
import { getLocalDateString } from "@/lib/utils";
import type { MoneyAccount } from "@/lib/db/types";

interface ManualTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: MoneyAccount[];
  onSuccess?: () => void;
}

export function ManualTransactionDialog({
  open,
  onOpenChange,
  accounts,
  onSuccess,
}: ManualTransactionDialogProps) {
  const t = useTranslations("money");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ManualTransactionInput>({
    resolver: zodResolver(manualTransactionSchema),
    defaultValues: {
      amount: undefined,
      description: "",
      transaction_date: getLocalDateString(),
      category: "",
      account_id: accounts.length > 0 ? accounts[0].id : "cash",
    },
  });

  const onSubmit = async (data: ManualTransactionInput) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/money/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to create transaction");
      }

      toast.success(t("transactions.manual.success"));
      form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Manual transaction error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create transaction"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-money-surface border-money-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("transactions.manual.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("transactions.manual.title")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("transactions.manual.amount")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === "" ? undefined : parseFloat(val));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("transactions.manual.description")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("transactions.manual.description")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transaction_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("transactions.manual.date")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("transactions.manual.category")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("transactions.manual.category")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("transactions.manual.account")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t("transactions.manual.account")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">
                        {t("transactions.manual.cashAccount")}
                      </SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                          {account.mask ? ` (${account.mask})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting || !form.formState.isValid}
              >
                {isSubmitting && (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                )}
                {t("transactions.manual.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
