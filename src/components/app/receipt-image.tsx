import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["receipt-url", path],
    enabled: !!path,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(path as string, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function ReceiptThumb({
  path,
  className,
  label = "صورة الإيصال",
}: {
  path: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const { data, isLoading, isError } = useSignedUrl(path);

  if (isLoading) {
    return (
      <div className={cn("flex size-14 items-center justify-center rounded-lg bg-muted", className)}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className={cn("flex size-14 items-center justify-center rounded-lg bg-muted", className)}>
        <ImageOff className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative size-14 overflow-hidden rounded-lg border border-border bg-muted",
            className,
          )}
          aria-label={label}
        >
          <img src={data} alt={label} className="size-full object-cover" loading="lazy" />
          <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="size-4 text-background" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-auto p-3">
        <DialogTitle className="px-1 text-sm">{label}</DialogTitle>
        <img src={data} alt={label} className="w-full rounded-lg" />
      </DialogContent>
    </Dialog>
  );
}

export function ReceiptFull({ path }: { path: string | null | undefined }) {
  const { data, isLoading } = useSignedUrl(path);
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-muted">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
        لا توجد صورة
      </div>
    );
  }
  return (
    <a href={data} target="_blank" rel="noreferrer">
      <img src={data} alt="صورة إيصال التوريد" className="w-full rounded-xl border border-border" />
    </a>
  );
}
