"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BoxDetailView } from "@/components/boxes/box-detail-view";

function BoxDetailRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <BoxDetailView key={id} id={id} />;
}

export default function BoxDetailPage() {
  return (
    <Suspense>
      <BoxDetailRoute />
    </Suspense>
  );
}
