"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Plus, Trash2, Pin, PinOff, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getBox, updateBox, deleteBox } from "@/lib/repo/boxes";
import { listItemsForBox } from "@/lib/repo/items";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RoomSelect } from "@/components/boxes/room-select";
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

export function BoxDetailView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeBoxId, setActiveBox } = useActiveBox();

  const { data: box, isLoading } = useQuery({
    queryKey: ["box", id],
    queryFn: () => getBox(id),
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

  React.useEffect(() => {
    if (box) {
      setDraftRoom(box.destination_room);
      setDraftNotes(box.notes ?? "");
    }
  }, [box]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
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
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const isActive = activeBoxId === box.id;

  const onToggleSeal = async (sealed: boolean) => {
    await updateBox(box.id, { sealed });
    if (sealed && isActive) setActiveBox(null);
    queryClient.invalidateQueries({ queryKey: ["box", box.id] });
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
    toast.success(sealed ? "Box sealed" : "Box unsealed");
  };

  const onSaveRoom = async () => {
    if (!draftRoom.trim()) return;
    await updateBox(box.id, { destination_room: draftRoom });
    setEditingRoom(false);
    queryClient.invalidateQueries({ queryKey: ["box", box.id] });
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
  };

  const onSaveNotes = async () => {
    await updateBox(box.id, { notes: draftNotes });
    setEditingNotes(false);
    queryClient.invalidateQueries({ queryKey: ["box", box.id] });
  };

  const onDelete = async () => {
    await deleteBox(box.id);
    if (isActive) setActiveBox(null);
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
    toast.success(`Box ${box.number} deleted`);
    router.replace("/");
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
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
            <span className="text-5xl font-bold tabular-nums leading-none">{box.number}</span>
          </div>
          <div className="flex items-center gap-2">
            {isActive && <Badge>Active</Badge>}
            {box.sealed && <Badge variant="secondary">Sealed</Badge>}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <FieldRow label="Room" editing={editingRoom}>
            {!editingRoom ? (
              <button
                onClick={() => setEditingRoom(true)}
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
                <Button size="icon" variant="ghost" onClick={onSaveRoom}><Check className="h-5 w-5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => { setDraftRoom(box.destination_room); setEditingRoom(false); }}><X className="h-5 w-5" /></Button>
              </div>
            )}
          </FieldRow>

          <FieldRow label="Notes" editing={editingNotes}>
            {!editingNotes ? (
              <button
                onClick={() => setEditingNotes(true)}
                className="flex w-full items-start gap-2 text-left text-base"
              >
                <span className={!box.notes ? "text-muted-foreground" : ""}>
                  {box.notes || "Add notes…"}
                </span>
                <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setDraftNotes(box.notes ?? ""); setEditingNotes(false); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onSaveNotes}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </FieldRow>

          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <div className="text-sm font-medium">Sealed</div>
              <div className="text-xs text-muted-foreground">Mark as packed and closed.</div>
            </div>
            <Switch checked={box.sealed} onCheckedChange={onToggleSeal} />
          </div>
        </div>
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Items</h2>
        <Button asChild size="sm" disabled={box.sealed}>
          <Link href={`/box/${box.id}/add-item`}>
            <Plus className="h-4 w-4" />
            Add item
          </Link>
        </Button>
      </div>

      {!items || items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No items yet. Tap "Add item" to start packing.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/item/${item.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 active:bg-accent">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.photos[0] ? (
                    <ItemPhoto photo={item.photos[0]} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.name}</div>
                  {item.description && (
                    <div className="line-clamp-1 text-sm text-muted-foreground">{item.description}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete box {box.number}?</DialogTitle>
            <DialogDescription>
              All {items?.length ?? 0} item{items?.length === 1 ? "" : "s"} and their photos will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={onDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; editing?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}
