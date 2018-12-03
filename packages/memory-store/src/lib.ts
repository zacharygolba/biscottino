import Store, { Adapter } from "@biscottino/store";

export interface Entries<T> {
  [key: string]: Partial<T> | void;
}

export default class MemoryStore<T> extends Store<T> {
  private readonly entries: Entries<T> = Object.create(null);

  readonly [Store.adapter]: Adapter<T> = {
    load: async key => this.entries[key] || (this.entries[key] = {}),
    setup: async () => {},
    update: async (key, value) => {
      this.entries[key] = value;
    },
  };

  clear(): void {
    for (const key in this.entries) {
      delete this.entries[key];
    }
  }
}
