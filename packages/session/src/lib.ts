import Store from "@biscottino/store";
import ObjectId from "bson-objectid";
import produce, { Draft } from "immer";
import { Context, Middleware } from "koa";

const CACHE = new WeakMap();

export interface Options {
  /**
   * Indicates the domain of the session cookie. If blank, the session cookie will be visible to
   * any domain. It is strongly recommended that this value is set in production.
   */
  domain?: string;

  /**
   * Determines whether or not the `Secure` parameter passed in the `Set-Cookie` header. If blank,
   * `true` will be used as a default value. It is strongly recommended that this value is set to
   * `true` in production.
   */
  https: boolean;

  /**
   * Indicates the path of the session cookie. If blank, `/` will be used as a default value.
   */
  path: string;

  /**
   * The name of the session cookie. If blank, `biscottino:session` will be used as a default
   * value.
   */
  key: string;
}

/**
 * Used to read and write data into a session.
 */
export class State<T> {
  constructor(private value: T) {}

  /**
   * Returns the state object for the current session.
   */
  read(): Readonly<T> {
    return this.value;
  }

  /**
   * Runs the given function against the state object for the current session. If a change is made
   * to the state object or a new state object is returned, the difference will be applied to a
   * copy of the original state object and the reference to the state object for the current
   * session will be update to reflect the given changes.
   */
  write(recipe: (value: Draft<T>) => T | void): void {
    this.value = produce(this.value, recipe) as T;
  }
}

export default class Session<S extends Store<T>, T> {
  /**
   * Configures the value passed in the `Set-Cookie` header for new sessions.
   */
  readonly options: Readonly<Options>;

  /**
   * The store in which session state is persisted.
   */
  readonly store: S;

  /**
   * Constructs a new `Session` instance bound to the provided store and options.
   */
  constructor(store: S, options: Partial<Options> = {}) {
    this.options = { https: true, path: "/", key: "biscottino:session", ...options };
    this.store = store;
  }

  /**
   * Gets the session state for the given context object from cache. This function **MUST** only be
   * called in middleware functions occuring after the session has been initialized.
   */
  for(context: Context): State<Partial<T>> {
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

  /**
   * Identifies the session based on the given context and returns a hex-encoded `ObjectId` string.
   */
  identify(context: Context): string {
    const { https, key, ...options } = this.options;
    const value = context.cookies.get(key, { signed: true });
    let bytes: Buffer;

    if (value) {
      bytes = Buffer.from(value, "base64");
    } else {
      bytes = Buffer.from(ObjectId.generate(), "hex");
    }

    context.cookies.set(key, bytes.toString("base64"), {
      ...options,
      secure: https,
      signed: true,
    });

    return bytes.toString("hex");
  }

  /**
   * Creates a middleware function that manages the initialization and persistence of session
   * state throught the lifecycle of a request.
   */
  middleware(): Middleware {
    const adapter = this.store[Store.adapter];
    let initialized = false;

    return async (context, next) => {
      if (!initialized) {
        await adapter.setup();
        initialized = true;
      }

      const key = this.identify(context);
      const prev = await adapter.load(key);
      const state = new State(prev);
      let hasError = false;
      let errorValue: any;

      CACHE.set(context, state);
      await next().catch(error => {
        errorValue = error;
        hasError = true;
      });

      const current = state.read();

      if (current !== prev) {
        await adapter.update(key, current);
      }

      if (hasError) {
        throw errorValue;
      }
    };
  }
}
