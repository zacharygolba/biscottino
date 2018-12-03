import Store from "@biscottino/store";
import { omit, size } from "lodash";
import { Collection, FilterQuery, ObjectId, MongoClient } from "mongodb";

const filterByKey = (key: string) => ({
  query: {
    _id: new ObjectId(key),
  },
});

type Document<T> = Partial<T> & { _id: ObjectId; expireAt: number };

export interface Options {
  collection: string;
  timeout: number;
}

export default class MongoStore<T> extends Store<T> {
  readonly [Store.adapter] = {
    load: (key: string) => this.load(key),
    setup: () => this.setup(),
    update: async (key: string, value: Partial<T>) => {
      await this.update(key, value);
    },
  };

  readonly options: Readonly<Options>;

  private readonly client: MongoClient;

  constructor(uri: string, options: Partial<Options> = {}) {
    super();
    this.client = new MongoClient(uri, { useNewUrlParser: true });
    this.options = { collection: "sessions", timeout: 24 * 60 * 60 * 1000 };
    Object.assign(this.options, options);
  }

  async close(force?: boolean): Promise<void> {
    await this.client.close(force);
  }

  async expire(filter: FilterQuery<T>): Promise<void> {
    await this.collection().deleteMany(filter);
  }

  private collection(): Collection<Document<T>> {
    return this.client.db().collection(this.options.collection);
  }

  private async load(key: string): Promise<Partial<T>> {
    const expireAt = new Date(Date.now() + this.options.timeout);
    const { value } = await this.collection().findOneAndUpdate(
      filterByKey(key),
      { $set: { expireAt } },
      { returnOriginal: true, upsert: true },
    );

    return omit(value || {}, "_id", "expireAt", "query");
  }

  private async setup(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    await this.client.db().createCollection(this.options.collection, { strict: false });
    await this.collection().createIndex(
      { expireAt: 1 },
      { expireAfterSeconds: 0, name: "expireAt" },
    );
  }

  private async update(key: string, value: Partial<T>): Promise<void> {
    const $set = omit(value, "_id", "expireAt", "query");

    if (size($set) > 0) {
      await this.collection().updateOne(filterByKey(key), { $set });
    }
  }
}
