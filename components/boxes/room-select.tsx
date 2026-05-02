"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Check, ChevronDown } from "lucide-react";
import { listRooms, addRoom } from "@/lib/repo/rooms";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function RoomSelect({ value, onChange }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newRoom, setNewRoom] = React.useState("");
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => listRooms(),
  });

  const handleAdd = async () => {
    if (!newRoom.trim()) return;
    const room = await addRoom(newRoom);
    onChange(room.name);
    setNewRoom("");
    setCreating(false);
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            !value && "text-muted-foreground",
          )}
        >
          <span>{value || "Select a room"}</span>
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Destination room</SheetTitle>
        </SheetHeader>
        <ul className="mt-4 space-y-1">
          {rooms?.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-base hover:bg-accent"
              >
                <span>{r.name}</span>
                {value === r.name && <Check className="h-5 w-5 text-primary" />}
              </button>
            </li>
          ))}
        </ul>

        {creating ? (
          <div className="mt-4 flex flex-col gap-2">
            <Input
              autoFocus
              placeholder="New room name"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={handleAdd}>
                Add
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full justify-start"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4" />
            Add new room
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
