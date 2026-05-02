"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getBox } from "@/lib/repo/boxes";
import { createItem } from "@/lib/repo/items";
import { compressImage } from "@/lib/utils/image-compression";
import { useCurrentUser } from "@/hooks/use-current-user";

interface PendingPhoto {
  id: string;
  blob: Blob;
  preview: string;
}

export function AddItemView({ boxId }: { boxId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: box } = useQuery({ queryKey: ["box", boxId], queryFn: () => getBox(boxId) });

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [photos, setPhotos] = React.useState<PendingPhoto[]>([]);
  const [compressing, setCompressing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showDescription, setShowDescription] = React.useState(false);
  const [autoCameraDone, setAutoCameraDone] = React.useState(false);

  // Auto-open camera on mount (mobile only — file inputs with capture do the right thing)
  React.useEffect(() => {
    if (!autoCameraDone && cameraRef.current && photos.length === 0) {
      setAutoCameraDone(true);
      // Defer slightly so the layout settles first
      const t = setTimeout(() => cameraRef.current?.click(), 200);
      return () => clearTimeout(t);
    }
  }, [autoCameraDone, photos.length]);

  React.useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, [photos]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    try {
      const blob = await compressImage(file);
      const id = uuidv4();
      const preview = URL.createObjectURL(blob);
      setPhotos((cur) => [...cur, { id, blob, preview }]);
      // After photo, focus name field
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch {
      toast.error("Could not process photo");
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const target = cur.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return cur.filter((p) => p.id !== id);
    });
  };

  const submit = async (mode: "close" | "another") => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Item name is required");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      await createItem(
        {
          box_id: boxId,
          name: trimmed,
          description: description.trim() || null,
          photoBlobs: photos.map((p) => p.blob),
        },
        user?.id ?? null,
      );
      queryClient.invalidateQueries({ queryKey: ["items", boxId] });
      queryClient.invalidateQueries({ queryKey: ["boxes"] });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(10); } catch {}
      }
      toast.success(`Added "${trimmed}"`);

      if (mode === "close") {
        router.replace(`/box/${boxId}`);
      } else {
        // Reset state for next item
        photos.forEach((p) => URL.revokeObjectURL(p.preview));
        setPhotos([]);
        setName("");
        setDescription("");
        setShowDescription(false);
        setAutoCameraDone(false);
        setSaving(false);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not save item");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {box && (
          <Link href={`/box/${box.id}`} className="text-sm text-muted-foreground">
            Box <span className="font-bold tabular-nums text-foreground">{box.number}</span> · {box.destination_room}
          </Link>
        )}
      </div>

      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Add item</h1>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={compressing}
          className="mb-5 flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition active:bg-muted"
        >
          {compressing ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <>
              <Camera className="h-10 w-10" />
              <span className="text-base font-medium">Take a photo</span>
              <span className="text-xs">Tap to open camera (optional)</span>
            </>
          )}
        </button>
      ) : (
        <div className="mb-5 space-y-3">
          <ul className="grid grid-cols-2 gap-2">
            {photos.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl border">
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => cameraRef.current?.click()}
            disabled={compressing}
          >
            {compressing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add another photo
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-name">Name</Label>
          <Input
            id="item-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kettle"
            autoComplete="off"
          />
        </div>

        {showDescription ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-desc">Description</Label>
            <Textarea
              id="item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Notes for this item"
            />
          </div>
        ) : (
          <button
            type="button"
            className="self-start text-sm text-primary"
            onClick={() => setShowDescription(true)}
          >
            + Add description
          </button>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Button
            size="lg"
            disabled={saving}
            onClick={() => submit("another")}
            className="bg-primary"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & add another"}
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => submit("close")}>
            Save & close
          </Button>
        </div>
      </div>
    </div>
  );
}
