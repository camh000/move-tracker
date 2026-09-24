"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AddItemView } from "@/components/items/add-item-view";

function AddItemRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <AddItemView key={id} boxId={id} />;
}

export default function AddItemPage() {
  return (
    <Suspense>
      <AddItemRoute />
    </Suspense>
  );
}
