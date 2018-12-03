const ADAPTER = Symbol("Store.adapter");

export interface Adapter<T> {
  load(key: string): Promise<Partial<T>>;
  setup(): Promise<void>;
  update(key: string, value: Partial<T>): Promise<void>;
}

export default abstract class Store<T> {
  static readonly adapter: typeof ADAPTER;
  abstract readonly [ADAPTER]: Adapter<T>;
}

Object.defineProperty(Store, "adapter", {
  value: ADAPTER,
});
