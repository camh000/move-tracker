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
  const [state, setState] = React.useState<{ key: string; url: string | null; errored: boolean } | null>(null);
  const key = `${photo.id}:${photo.storage_path ?? ""}:${photo._local_blob ? "blob" : ""}`;

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void getPhotoUrl(photo).then((res) => {
      if (res?.revoke) objectUrl = res.url;
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }
      setState({ key, url: res?.url ?? null, errored: !res });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // `key` captures everything about the photo that affects its URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state?.key === key ? state : null;

  if (current?.errored) {
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }

  if (!current?.url) {
    return <div className={cn("animate-pulse bg-muted", className)} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current.url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setState({ key, url: null, errored: true })}
    />
  );
}
