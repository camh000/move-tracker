"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoomSelect } from "@/components/boxes/room-select";
import { createBox, nextBoxNumber } from "@/lib/repo/boxes";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useActiveBox } from "@/hooks/use-active-box";

const schema = z.object({
  destination_room: z.string().min(1, "Pick a room"),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export default function NewBoxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { setActiveBox } = useActiveBox();
  const [submitting, setSubmitting] = React.useState(false);
  const [previewNumber, setPreviewNumber] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { destination_room: "", notes: "" } });

  React.useEffect(() => {
    void nextBoxNumber().then(setPreviewNumber);
  }, []);

  const room = watch("destination_room");

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      const box = await createBox(values, user?.id ?? null);
      setActiveBox(box.id);
      queryClient.invalidateQueries({ queryKey: ["boxes"] });
      toast.success(`Box ${box.number} created`, {
        description: `Write ${box.number} on this box.`,
      });
      router.replace(`/box/${box.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not create box");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New box</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a destination room. The box number is assigned automatically.
        </p>
      </header>

      {previewNumber != null && (
        <div className="mb-6 flex flex-col items-center justify-center gap-1 rounded-2xl border bg-card p-6 text-center shadow-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Will be</span>
          <span className="flex items-baseline gap-1.5">
            <Package className="h-5 w-5 text-muted-foreground" />
            <span className="text-5xl font-bold tabular-nums">{previewNumber}</span>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Destination room</Label>
          <RoomSelect
            value={room}
            onChange={(v) => setValue("destination_room", v, { shouldValidate: true })}
          />
          <input type="hidden" {...register("destination_room")} />
          {errors.destination_room && <p className="text-xs text-destructive">{errors.destination_room.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" rows={3} placeholder="Anything fragile?" {...register("notes")} />
        </div>

        <Button type="submit" size="lg" disabled={submitting} className="mt-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create box"}
        </Button>

        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </form>
    </div>
  );
}
