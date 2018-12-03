import Store from "@biscottino/store";

import MemoryStore from "./lib";

interface Document {
  currentUserId?: string | null;
}

describe("MemoryStore", () => {
  const subject = new MemoryStore<Document>();
  const adapter = subject[Store.adapter];

  afterEach(() => {
    subject.clear();
  });

  describe("#[@@adapter]", () => {
    const key = "5c046abc3568db75b74554ed";

    describe(".load()", () => {
      beforeEach(async () => {
        await adapter.update(key, { currentUserId: null });
      });

      it("inserts the document if it does not exists", async () => {
        expect(await adapter.load("5c046bee3f0b907609571386")).toEqual({});
      });

      it("returns the document if it does exist", async () => {
        expect(await adapter.load(key)).toEqual({ currentUserId: null });
      });
    });

    describe(".setup()", () => {
      it("can safely be called multiple times", async () => {
        expect(await adapter.setup()).toBeUndefined();
        expect(await adapter.setup()).toBeUndefined();
        expect(await adapter.setup()).toBeUndefined();
      });
    });

    describe(".update()", () => {
      beforeEach(async () => {
        await adapter.load(key);
      });

      it("persists changes provided by the given value", async () => {
        const value = { currentUserId: "5c046ab396bd5a75ad6f5d1b" };

        expect(await adapter.update(key, value)).toBeUndefined();
        expect(await adapter.load(key)).toEqual(value);
      });
    });
  });

  describe("#clear()", () => {
    const empty = Object.create(null);

    it("removes all values from the store", () => {
      expect(subject.clear()).toBeUndefined();
      expect(subject).toHaveProperty("entries", empty);
    });
  });
});
