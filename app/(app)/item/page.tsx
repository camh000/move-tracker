"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ItemDetailView } from "@/components/items/item-detail-view";

function ItemDetailRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <ItemDetailView key={id} id={id} />;
}

export default function ItemDetailPage() {
  return (
    <Suspense>
      <ItemDetailRoute />
    </Suspense>
  );
}
