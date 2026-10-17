"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, X, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getBox } from "@/lib/repo/boxes";
import { createItem, listAllItemNames, listItemsForBox } from "@/lib/repo/items";
import { nameHistory, parseNames, suggestNames } from "@/lib/items/suggest";
import { wordsForRoom } from "@/lib/items/vocabulary";
import { suggestFromPhoto, warmUpPhotoSuggest } from "@/lib/items/photo-suggest";
import { compressImage } from "@/lib/utils/image-compression";
import { useCurrentUser } from "@/hooks/use-current-user";
import { boxHref } from "@/lib/routes";

interface PendingPhoto {
  id: string;
  blob: Blob;
  preview: string;
}

export function AddItemView({ boxId }: { boxId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { data: box } = useQuery({ queryKey: ["box", boxId], queryFn: async () => (await getBox(boxId)) ?? null });
  const { data: boxItems } = useQuery({ queryKey: ["items", boxId], queryFn: () => listItemsForBox(boxId) });
  const { data: history } = useQuery({
    queryKey: ["item-names"],
    queryFn: async () => nameHistory(await listAllItemNames()),
  });

  const cameraRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // `names` are the items queued for this save; `draft` is what's being typed.
  const [names, setNames] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [photos, setPhotos] = React.useState<PendingPhoto[]>([]);
  const [compressing, setCompressing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showDescription, setShowDescription] = React.useState(false);
  const [autoCameraDone, setAutoCameraDone] = React.useState(false);
  // On-device guesses at what's in each photo, keyed by pending photo id.
  const [photoGuesses, setPhotoGuesses] = React.useState<Record<string, string[]>>({});
  const [analysing, setAnalysing] = React.useState(0);

  React.useEffect(() => {
    warmUpPhotoSuggest();
  }, []);

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
      setAnalysing((n) => n + 1);
      void suggestFromPhoto(blob)
        .then((guesses) => setPhotoGuesses((cur) => ({ ...cur, [id]: guesses })))
        .catch(() => {})
        .finally(() => setAnalysing((n) => n - 1));
      // After photo, focus name field
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch {
      toast.error("Could not process photo");
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const fromPhoto = React.useMemo(() => {
    const taken = new Set([...names, ...(boxItems ?? []).map((i) => i.name)].map((n) => n.toLowerCase()));
    const out: string[] = [];
    for (const p of photos) {
      for (const g of photoGuesses[p.id] ?? []) {
        if (!taken.has(g.toLowerCase())) {
          taken.add(g.toLowerCase());
          out.push(g);
        }
      }
    }
    return out;
  }, [photos, photoGuesses, names, boxItems]);

  const roomWords = React.useMemo(() => wordsForRoom(box?.destination_room), [box?.destination_room]);
  const suggestions = React.useMemo(
    () =>
      suggestNames({
        query: draft,
        history: history ?? [],
        roomWords,
        exclude: [...names, ...(boxItems ?? []).map((i) => i.name), ...(draft ? [] : fromPhoto)],
      }),
    [draft, history, roomWords, names, boxItems, fromPhoto],
  );

  const addNames = (more: string[]) => {
    if (!more.length) return;
    setNames((cur) => {
      const seen = new Set(cur.map((n) => n.toLowerCase()));
      const fresh = more.filter((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...cur, ...fresh];
    });
  };

  const commitDraft = () => {
    addNames(parseNames(draft));
    setDraft("");
  };

  const onDraftChange = (value: string) => {
    // A comma or newline (typed or pasted) closes off everything before it.
    const cut = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"), value.lastIndexOf("\n"));
    if (cut === -1) {
      setDraft(value);
      return;
    }
    addNames(parseNames(value.slice(0, cut)));
    setDraft(value.slice(cut + 1).trimStart());
  };

  const pickSuggestion = (s: string) => {
    addNames([s]);
    setDraft("");
    nameRef.current?.focus();
  };

  const removeName = (n: string) => setNames((cur) => cur.filter((x) => x !== n));

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const target = cur.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return cur.filter((p) => p.id !== id);
    });
  };

  /** The queued names plus whatever is still in the field. */
  const namesToSave = () => {
    const seen = new Set(names.map((n) => n.toLowerCase()));
    return [...names, ...parseNames(draft).filter((n) => !seen.has(n.toLowerCase()))];
  };

  const submit = async (mode: "close" | "another") => {
    const toSave = namesToSave();
    if (!toSave.length) {
      toast.error("Item name is required");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      // Each item gets its own copy of the photos, so deleting or moving one
      // item never affects the others.
      for (const itemName of toSave) {
        await createItem(
          {
            box_id: boxId,
            name: itemName,
            description: description.trim() || null,
            photoBlobs: photos.map((p) => p.blob),
          },
          user?.id ?? null,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["items", boxId] });
      queryClient.invalidateQueries({ queryKey: ["item-names"] });
      queryClient.invalidateQueries({ queryKey: ["boxes"] });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(10); } catch {}
      }
      toast.success(toSave.length === 1 ? `Added "${toSave[0]}"` : `Added ${toSave.length} items`);

      if (mode === "close") {
        router.replace(boxHref(boxId));
      } else {
        // Reset state for next item
        photos.forEach((p) => URL.revokeObjectURL(p.preview));
        setPhotos([]);
        setPhotoGuesses({});
        setNames([]);
        setDraft("");
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

  const saveCount = namesToSave().length;

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {box && (
          <Link href={boxHref(box.id)} className="text-sm text-muted-foreground">
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
          <Label htmlFor="item-name">{names.length ? "Items" : "Name"}</Label>
          {names.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {names.map((n) => (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => removeName(n)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                    aria-label={`Remove ${n}`}
                  >
                    {n}
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              id="item-name"
              ref={nameRef}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              placeholder={names.length ? "Add another…" : "e.g. Kettle"}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="enter"
            />
            {draft.trim() && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                // Keep the keyboard up: don't let the tap take focus from the input.
                onPointerDown={(e) => e.preventDefault()}
                onClick={commitDraft}
                aria-label="Add to list"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>
          {(fromPhoto.length > 0 || analysing > 0) && (
            <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-label="Suggested from photo" />
              {fromPhoto.map((s) => (
                <button
                  key={s}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary active:bg-primary/20"
                >
                  + {s}
                </button>
              ))}
              {analysing > 0 && (
                <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Looking at photo…
                </span>
              )}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="shrink-0 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm active:bg-muted"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {names.length > 0 && photos.length > 0
              ? "Each item gets a copy of the photos."
              : "Press Enter or use commas to add several at once."}
          </p>
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
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saveCount > 1 ? (
              `Save ${saveCount} items & add more`
            ) : (
              "Save & add another"
            )}
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => submit("close")}>
            Save & close
          </Button>
        </div>
      </div>
    </div>
  );
}
