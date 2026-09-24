"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MoreVertical, Trash2, Plus, Loader2, Camera, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/dropdown-menu";
import { ItemPhoto } from "@/components/items/item-photo";
import { getItem, updateItem, deleteItem, addPhotoToItem, deletePhoto, moveItem, setItemUnpacked } from "@/lib/repo/items";
import { getBox } from "@/lib/repo/boxes";
import { compressImage } from "@/lib/utils/image-compression";
import { Switch } from "@/components/ui/switch";
import { MoveItemDialog } from "@/components/items/move-item-dialog";
import { boxHref } from "@/lib/routes";

export function ItemDetailView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cameraRef = React.useRef<HTMLInputElement>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ["item", id],
    queryFn: async () => (await getItem(id)) ?? null,
  });
  const { data: box } = useQuery({
    enabled: !!item,
    queryKey: ["box", item?.box_id],
    queryFn: async () => (item ? ((await getBox(item.box_id)) ?? null) : null),
  });

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const loadedFor = React.useRef<string | null>(null);

  // Fill the form once per item — not on every background sync, which would
  // wipe out an edit in progress.
  React.useEffect(() => {
    if (item && loadedFor.current !== item.id) {
      loadedFor.current = item.id;
      setName(item.name);
      setDescription(item.description ?? "");
    }
  }, [item]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
        <Skeleton className="aspect-square w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md px-4 pt-12 text-center">
        <p className="text-muted-foreground">Item not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    await updateItem(item.id, { name, description });
    queryClient.invalidateQueries({ queryKey: ["item", id] });
    queryClient.invalidateQueries({ queryKey: ["items", item.box_id] });
    toast.success("Item updated");
  };

  const onDelete = async () => {
    await deleteItem(item.id);
    queryClient.invalidateQueries({ queryKey: ["items", item.box_id] });
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
    toast.success("Item deleted");
    router.replace(boxHref(item.box_id));
  };

  const onMove = async (toBoxId: string, toNumber: number) => {
    const fromBoxId = item.box_id;
    await moveItem(item.id, toBoxId);
    setMoving(false);
    queryClient.invalidateQueries({ queryKey: ["item", id] });
    queryClient.invalidateQueries({ queryKey: ["items", fromBoxId] });
    queryClient.invalidateQueries({ queryKey: ["items", toBoxId] });
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
    toast.success(`Moved to box ${toNumber}`);
  };

  const onToggleUnpacked = async (unpacked: boolean) => {
    await setItemUnpacked(item.id, unpacked);
    queryClient.invalidateQueries({ queryKey: ["item", id] });
    queryClient.invalidateQueries({ queryKey: ["items", item.box_id] });
    queryClient.invalidateQueries({ queryKey: ["boxes"] });
  };

  const onAddPhoto = async (file: File | undefined) => {
    if (!file) return;
    setAdding(true);
    try {
      const blob = await compressImage(file);
      await addPhotoToItem(item.id, blob);
      queryClient.invalidateQueries({ queryKey: ["item", id] });
    } catch {
      toast.error("Could not add photo");
    } finally {
      setAdding(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const onDeletePhoto = async (photoId: string) => {
    await deletePhoto(photoId);
    queryClient.invalidateQueries({ queryKey: ["item", id] });
    setConfirmDeletePhotoId(null);
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      <div className="mb-2 flex items-center justify-between">
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
            <DropdownMenuItem onClick={() => setMoving(true)}>
              <ArrowRightLeft className="h-4 w-4" />
              Move to another box
            </DropdownMenuItem>
            <DropdownMenuItem destructive onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {box && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={boxHref(box.id)} className="text-sm text-muted-foreground hover:text-foreground">
            Box <span className="font-bold tabular-nums text-foreground">{box.number}</span> · {box.destination_room}
          </Link>
          <Button variant="outline" size="sm" onClick={() => setMoving(true)}>
            <ArrowRightLeft className="h-4 w-4" />
            Move
          </Button>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onAddPhoto(e.target.files?.[0])}
      />

      {item.photos.length > 0 ? (
        <ul className="mb-5 grid grid-cols-2 gap-2">
          {item.photos.map((photo) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border">
              <ItemPhoto photo={photo} className="h-full w-full object-cover" alt={item.name} />
              <button
                onClick={() => setConfirmDeletePhotoId(photo.id)}
                className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                aria-label="Delete photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-5 flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed text-muted-foreground">
          <Camera className="h-8 w-8" />
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="mb-6 w-full"
        onClick={() => cameraRef.current?.click()}
        disabled={adding}
      >
        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add photo
      </Button>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-name">Name</Label>
          <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-desc">Description</Label>
          <Textarea
            id="item-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Notes for this item"
          />
        </div>

        <Button size="lg" onClick={onSave}>
          Save changes
        </Button>

        <div className="flex items-center justify-between rounded-xl border p-4">
          <div>
            <div className="text-sm font-medium">Unpacked</div>
            <div className="text-xs text-muted-foreground">Out of the box and put away.</div>
          </div>
          <Switch checked={!!item.unpacked} onCheckedChange={onToggleUnpacked} aria-label="Unpacked" />
        </div>
      </div>

      <MoveItemDialog open={moving} onOpenChange={setMoving} currentBoxId={item.box_id} onPick={onMove} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this item?</DialogTitle>
            <DialogDescription>
              All photos for this item will be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={onDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeletePhotoId} onOpenChange={(o) => !o && setConfirmDeletePhotoId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeletePhotoId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeletePhotoId && onDeletePhoto(confirmDeletePhotoId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
