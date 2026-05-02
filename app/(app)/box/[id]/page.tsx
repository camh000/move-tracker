import { BoxDetailView } from "@/components/boxes/box-detail-view";

export default async function BoxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoxDetailView id={id} />;
}
