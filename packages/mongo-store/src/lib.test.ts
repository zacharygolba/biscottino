/// <reference types="jest-environment-mongo" />

import Store, { Adapter } from "@biscottino/store";
import { Collection, ObjectId, MongoClient } from "mongodb";

import MongoStore from "./lib";

interface Document {
  currentUserId?: ObjectId | null;
}

describe("MongoStore", () => {
  let client: MongoClient;
  let subject: MongoStore<Document>;

  afterAll(async () => {
    await client.close();
    await subject.close();
  });

  beforeAll(async () => {
    const uri = await mongoServer.getUri();

    client = new MongoClient(uri, { useNewUrlParser: true });
    subject = new MongoStore(uri);

    await client.connect();
    await subject[Store.adapter].setup();
  });

  describe("#[@@adapter]", () => {
    let adapter: Adapter<Document>;

    beforeAll(() => {
      adapter = subject[Store.adapter];
    });

    describe(".load()", () => {
      let key: string;

      beforeAll(async () => {
        await adapter.load((key = new ObjectId().toHexString()));
        await adapter.update(key, { currentUserId: null });
      });

      it("inserts the document if it does not exists", async () => {
        expect(await adapter.load(new ObjectId().toHexString())).toEqual({});
      });

      it("returns the document if it does exist", async () => {
        expect(await adapter.load(key)).toEqual({ currentUserId: null });
      });
    });

    describe(".setup()", () => {
      let collection: Collection<Document>;

      beforeAll(() => {
        collection = client.db().collection("sessions");
      });

      it("can safely be called multiple times", async () => {
        expect(await adapter.setup()).toBeUndefined();
        expect(await adapter.setup()).toBeUndefined();
        expect(await adapter.setup()).toBeUndefined();
      });

      it("creates the necessary ttl index", async () => {
        expect(await collection.indexExists("expireAt")).toBe(true);
      });
    });

    describe(".update()", () => {
      let key: string;

      beforeAll(async () => {
        await adapter.load((key = new ObjectId().toHexString()));
      });

      it("does nothing if the given value is empty", async () => {
        expect(await adapter.update(key, {})).toBeUndefined();
        expect(await adapter.load(key)).toEqual({});
      });

      it("persists changes provided by the given value", async () => {
        const value = { currentUserId: new ObjectId() };

        expect(await adapter.update(key, value)).toBeUndefined();
        expect(await adapter.load(key)).toEqual(value);
      });
    });
  });

  describe("#close()", () => {
    let spy: jest.SpyInstance;

    afterAll(() => {
      spy.mockRestore();
    });

    beforeAll(() => {
      spy = jest.spyOn(Reflect.get(subject, "client"), "close");
      spy.mockResolvedValue(undefined);
    });

    it("closes the underlying database connection", async () => {
      expect(await subject.close()).toBeUndefined();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("#expire()", () => {
    let collection: Collection<Document>;
    let currentUserId: ObjectId;

    beforeAll(async () => {
      collection = client.db().collection("sessions");
      currentUserId = new ObjectId();
      await collection.insertOne({ currentUserId });
    });

    it("does not effect documents that do not match the given query", async () => {
      expect(await subject.expire({ currentUserId: null })).toBeUndefined();
      expect(await collection.find({ currentUserId }).count()).toBe(1);
    });

    it("removes the documents matching the given query", async () => {
      expect(await subject.expire({ currentUserId })).toBeUndefined();
      expect(await collection.find({ currentUserId }).count()).toBe(0);
    });
  });
});
