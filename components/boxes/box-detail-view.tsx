"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  Check,
  X,
  Printer,
  Truck,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { getBox, updateBox, deleteBox, type BoxPatch } from "@/lib/repo/boxes";
import { listItemsForBox, setItemUnpacked } from "@/lib/repo/items";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RoomSelect } from "@/components/boxes/room-select";
import { BoxTagToggles } from "@/components/boxes/box-tags";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ItemPhoto } from "@/components/items/item-photo";
import { useActiveBox } from "@/hooks/use-active-box";
import { addItemHref, itemHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function BoxDetailView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeBoxId, setActiveBox } = useActiveBox();

  const { data: box, isLoading } = useQuery({
    queryKey: ["box", id],
    queryFn: async () => (await getBox(id)) ?? null,
  });
  const { data: items } = useQuery({
    queryKey: ["items", id],
    queryFn: () => listItemsForBox(id),
  });

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState(false);
  const [editingNotes, setEditingNotes] = React.useState(false);
  const [draftRoom, setDraftRoom] = React.useState("");
  const [draftNotes, setDraftNotes] = React.useState("");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!box) {
    return (
      <div className="mx-auto max-w-md px-4 pt-12 text-center">
        <p className="text-muted-foreground">Box not found.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          If it was just created on the other phone, it will appear after the next sync.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const isActive = activeBoxId === box.id;
  const itemCount = items?.length ?? 0;
  const unpackedCount = items?.filter((i) => i.unpacked).length ?? 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["box", box.id] });
    void queryClient.invalidateQueries({ queryKey: ["items", box.id] });
    void queryClient.invalidateQueries({ queryKey: ["boxes"] });
  };

  const patchBox = async (patch: BoxPatch) => {
    await updateBox(box.id, patch);
    refresh();
  };

  const onToggleSeal = async (sealed: boolean) => {
    await patchBox({ sealed });
    if (sealed && isActive) setActiveBox(null);
    toast.success(sealed ? "Box sealed" : "Box unsealed");
  };

  const onToggleArrived = async (arrived: boolean) => {
    await patchBox(arrived ? { arrived } : { arrived, unpacked: false });
    toast.success(arrived ? `Box ${box.number} marked as arrived` : "Marked as not arrived");
  };

  const onToggleUnpacked = async (unpacked: boolean) => {
    await patchBox(unpacked ? { unpacked, arrived: true } : { unpacked });
    toast.success(unpacked ? `Box ${box.number} unpacked` : "Marked as not unpacked");
  };

  const onToggleItem = async (itemId: string, unpacked: boolean) => {
    await setItemUnpacked(itemId, unpacked);
    const nowUnpacked = unpackedCount + (unpacked ? 1 : -1);
    if (unpacked && nowUnpacked === itemCount && !box.unpacked) {
      await updateBox(box.id, { unpacked: true, arrived: true });
      toast.success(`Everything in box ${box.number} is unpacked`);
    } else if (!unpacked && box.unpacked) {
      await updateBox(box.id, { unpacked: false });
    }
    refresh();
  };

  const onSaveRoom = async () => {
    if (!draftRoom.trim()) return;
    await patchBox({ destination_room: draftRoom });
    setEditingRoom(false);
  };

  const onSaveNotes = async () => {
    await patchBox({ notes: draftNotes });
    setEditingNotes(false);
  };

  const onDelete = async () => {
    await deleteBox(box.id);
    if (isActive) setActiveBox(null);
    void queryClient.invalidateQueries({ queryKey: ["boxes"] });
    toast.success(`Box ${box.number} deleted`);
    router.replace("/");
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More options">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isActive ? (
              <DropdownMenuItem onClick={() => setActiveBox(null)}>
                <PinOff className="h-4 w-4" />
                Clear active box
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setActiveBox(box.id)} disabled={box.sealed}>
                <Pin className="h-4 w-4" />
                Set as active box
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => router.push(`/labels?ids=${encodeURIComponent(box.id)}`)}>
              <Printer className="h-4 w-4" />
              Print label
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete box
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Box</span>
            <span className="text-5xl font-bold leading-none tabular-nums">{box.number}</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isActive && <Badge>Active</Badge>}
            {box.unpacked ? (
              <Badge variant="success">Unpacked</Badge>
            ) : box.arrived ? (
              <Badge variant="outline">Arrived</Badge>
            ) : box.sealed ? (
              <Badge variant="secondary">Sealed</Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <FieldRow label="Room">
            {!editingRoom ? (
              <button
                onClick={() => {
                  setDraftRoom(box.destination_room);
                  setEditingRoom(true);
                }}
                className="flex items-center gap-2 text-base"
              >
                <span>{box.destination_room}</span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <RoomSelect value={draftRoom} onChange={setDraftRoom} />
                </div>
                <Button size="icon" variant="ghost" onClick={onSaveRoom} aria-label="Save room">
                  <Check className="h-5 w-5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingRoom(false)} aria-label="Cancel">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
          </FieldRow>

          <FieldRow label="Tags">
            <BoxTagToggles value={box} onToggle={(key, on) => void patchBox({ [key]: on })} />
          </FieldRow>

          <FieldRow label="Notes">
            {!editingNotes ? (
              <button
                onClick={() => {
                  setDraftNotes(box.notes ?? "");
                  setEditingNotes(true);
                }}
                className="flex w-full items-start gap-2 text-left text-base"
              >
                <span className={!box.notes ? "text-muted-foreground" : ""}>{box.notes || "Add notes…"}</span>
                <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} rows={3} autoFocus />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingNotes(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSaveNotes}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </FieldRow>

          <div className="space-y-4 border-t pt-4">
            <ToggleRow
              title="Sealed"
              hint="Packed and taped up."
              checked={box.sealed}
              onChange={onToggleSeal}
            />
            <ToggleRow
              icon={<Truck className="h-4 w-4" />}
              title="Arrived"
              hint="Off the van at the new place."
              checked={!!box.arrived}
              onChange={onToggleArrived}
            />
            <ToggleRow
              icon={<PackageCheck className="h-4 w-4" />}
              title="Unpacked"
              hint={itemCount ? `${unpackedCount} of ${itemCount} items unpacked.` : "Emptied and put away."}
              checked={!!box.unpacked}
              onChange={onToggleUnpacked}
            />
          </div>
        </div>
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Items
          {itemCount > 0 && box.arrived && (
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {unpackedCount}/{itemCount} unpacked
            </span>
          )}
        </h2>
        <Button asChild size="sm" disabled={box.sealed}>
          <Link href={addItemHref(box.id)} aria-disabled={box.sealed} className={cn(box.sealed && "pointer-events-none opacity-50")}>
            <Plus className="h-4 w-4" />
            Add item
          </Link>
        </Button>
      </div>

      {itemCount > 0 && box.arrived && (
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${Math.round((unpackedCount / itemCount) * 100)}%` }}
          />
        </div>
      )}

      {!items || items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No items yet. Tap &quot;Add item&quot; to start packing.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-xl border bg-card p-2 pr-3">
              <Link href={itemHref(item.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 active:bg-accent">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.photos[0] ? <ItemPhoto photo={item.photos[0]} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", item.unpacked && "text-muted-foreground line-through")}>
                    {item.name}
                  </div>
                  {item.description && (
                    <div className="line-clamp-1 text-sm text-muted-foreground">{item.description}</div>
                  )}
                </div>
              </Link>
              <label className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-[var(--success)]"
                  checked={!!item.unpacked}
                  onChange={(e) => void onToggleItem(item.id, e.target.checked)}
                  aria-label={`Unpacked ${item.name}`}
                />
                Unpacked
              </label>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete box {box.number}?</DialogTitle>
            <DialogDescription>
              All {itemCount} item{itemCount === 1 ? "" : "s"} and their photos will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}
