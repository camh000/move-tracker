import { AddItemView } from "@/components/items/add-item-view";

export default async function AddItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AddItemView boxId={id} />;
}
