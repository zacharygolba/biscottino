import ObjectId from "bson-objectid";
import produce, { Draft } from "immer";
import { Context, Middleware } from "koa";

const CACHE = new WeakMap();

export type Data<T> = T extends Storage<infer V> ? V : never;

export interface Options {
  domain?: string;
  https?: boolean;
  key: string;
}

export interface State<T> {
  read(): Readonly<Partial<T>>;
  write(fn: (draft: Draft<Partial<T>>) => void): void;
}

export interface Storage<T = unknown> {
  readonly [Storage.hooks]: Storage.Hooks<T>;
}

export namespace Storage {
  export const hooks = Symbol("Storage.hooks");

  export interface Hooks<T> {
    load(id: string): Promise<Partial<T>>;
    setup(): Promise<void>;
    update(id: string, value: Partial<T>): Promise<void>;
  }
}

export default class Session<T extends Storage> {
  constructor(readonly storage: T, readonly options: Readonly<Options>) {}

  for(context: Context): State<Data<T>> {
    if (CACHE.has(context)) {
      return CACHE.get(context);
    }

    throw new Error(
      // prettier-ignore
      "It looks you tried to access the session before it was initialized. To prevent this " +
      "error from occurring in the future, place the session middleware before any other " +
      "middleware function.",
    );
  }

  middleware(): Middleware {
    const hooks = this.storage[Storage.hooks];
    let initialized = false;

    return async (context, next) => {
      if (!initialized) {
        await hooks.setup();
        initialized = true;
      }

      const id = this.identify(context);
      const data = await hooks.load(id);
      const state = this.wrap(data);

      CACHE.set(context, state);

      await next().then(() => {
        if (state.read() === data) return undefined;
        return hooks.update(id, state.read());
      });
    };
  }

  private identify({ cookies }: Context): string {
    const value = cookies.get(this.options.key, { signed: true });
    let bytes: Buffer;

    if (typeof value === "string") {
      bytes = Buffer.from(value, "base64");
    } else {
      bytes = Buffer.from(ObjectId.generate(), "hex");
      cookies.set(this.options.key, bytes.toString("base64"), {
        domain: this.options.domain,
        secure: this.options.https,
        signed: true,
      });
    }

    return bytes.toString("hex");
  }

  private wrap(data: Partial<Data<T>>): State<Data<T>> {
    let value = data;

    return {
      read: () => value,
      write: fn => {
        value = produce(value, fn);
      },
    };
  }
}
