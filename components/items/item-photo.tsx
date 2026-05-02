"use client";

import * as React from "react";
import type { ItemPhotoRow } from "@/lib/db/dexie";
import { getPhotoUrl } from "@/lib/utils/photo-url";
import { cn } from "@/lib/utils";
import { ImageOff } from "lucide-react";

interface Props {
  photo: ItemPhotoRow;
  className?: string;
  alt?: string;
}

export function ItemPhoto({ photo, className, alt = "" }: Props) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [errored, setErrored] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    (async () => {
      const next = await getPhotoUrl(photo);
      if (cancelled) return;
      if (photo._local_blob && next) createdObjectUrl = next;
      setUrl(next);
    })();
    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [photo]);

  if (errored || (!url && !photo._local_blob && !photo.storage_path)) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  if (!url) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }

  return <img src={url} alt={alt} loading="lazy" className={className} onError={() => setErrored(true)} />;
}
