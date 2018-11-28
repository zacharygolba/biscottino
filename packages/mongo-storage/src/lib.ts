import { Storage } from "@biscottino/session";
import mongodb from "mongodb";
import omit from "lodash.omit";

const filterById = (id: string) => ({
  query: {
    _id: new mongodb.ObjectId(id),
  },
});

type Collection<T> = mongodb.Collection<Partial<T> & { expireAt: number }>;

export type Client = mongodb.MongoClient;
export type Filter<T> = mongodb.FilterQuery<Partial<T>>;

export interface Options {
  collection: string;
  database: string;
  expiry: number;
}

export default class MongoStorage<T> implements Storage<T> {
  constructor(private readonly client: Client, readonly options: Readonly<Options>) {}

  readonly [Storage.hooks]: Storage.Hooks<T> = {
    load: async id => {
      const expireAt = new Date(Date.now() + this.options.expiry);
      const result = await this.collection.findOneAndUpdate(
        filterById(id),
        { $setOnInsert: { expireAt } },
        { returnOriginal: true, upsert: true },
      );

      return result.ok === 0
        ? Promise.reject(result.lastErrorObject)
        : omit(result.value || {}, "_id", "expireAt");
    },

    setup: async () => {
      if (await this.collection.indexExists("expireAt")) return undefined;
      await this.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    },

    update: async (id, value) => {
      await this.collection.updateOne(filterById(id), {
        $set: omit(value, "_id", "expireAt"),
      });
    },
  };

  private get collection(): Collection<T> {
    const { collection, database } = this.options;
    return this.client.db(database).collection(collection);
  }

  async expire(filter: Filter<T>): Promise<void> {
    await this.collection.updateMany(filter, {
      $set: { expireAt: new Date() },
    });
  }
}
