import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/dexie";
import { addRoom, deleteRoom, listRooms } from "@/lib/repo/rooms";

describe("rooms repo > addRoom", () => {
  it("trims and persists a new room, enqueues an insert", async () => {
    const room = await addRoom("  Loft  ");
    expect(room.name).toBe("Loft");
    expect(room._dirty).toBe(1);

    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "rooms", op: "insert", row_id: room.id });
  });

  it("throws on an empty name", async () => {
    await expect(addRoom("   ")).rejects.toThrow(/required/i);
    expect(await db().outbox.count()).toBe(0);
  });

  it("returns the existing room and does not enqueue when the name already exists (case-insensitive)", async () => {
    const first = await addRoom("Loft");
    await db().outbox.clear();

    const second = await addRoom("loft");

    expect(second.id).toBe(first.id);
    expect(await db().outbox.count()).toBe(0);
  });
});

describe("rooms repo > deleteRoom", () => {
  it("removes the row locally and enqueues a delete", async () => {
    const room = await addRoom("Loft");
    await db().outbox.clear();

    await deleteRoom(room.id);

    expect(await db().rooms.get(room.id)).toBeUndefined();
    const outbox = await db().outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: "rooms", op: "delete", row_id: room.id });
  });

  it("is a no-op when the room does not exist", async () => {
    await deleteRoom("nope");
    expect(await db().outbox.count()).toBe(0);
  });
});

describe("rooms repo > listRooms", () => {
  it("returns rooms sorted alphabetically by name", async () => {
    await addRoom("Office");
    await addRoom("Kitchen");
    await addRoom("Bathroom");

    const list = await listRooms();
    expect(list.map((r) => r.name)).toEqual(["Bathroom", "Kitchen", "Office"]);
  });
});
