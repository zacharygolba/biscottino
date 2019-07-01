import MemoryStore from "@biscottino/memory-store";
import { createMockContext } from "@shopify/jest-koa-mocks";
import ObjectId from "bson-objectid";
import { Context, Middleware } from "koa";

import Session, { State } from "./lib";

interface Data {
  isAuthenticated?: boolean;
}

class TestStore extends MemoryStore<Data> {
  readonly spies = {
    load: jest.spyOn(this.adapter, "load"),
    setup: jest.spyOn(this.adapter, "setup"),
    update: jest.spyOn(this.adapter, "update"),
  };

  get adapter() {
    return this[MemoryStore.adapter];
  }

  mockClear(): void {
    this.clear();
    this.spies.load.mockClear();
    this.spies.setup.mockClear();
    this.spies.update.mockClear();
  }
}

describe("Session", () => {
  const next = jest.fn().mockResolvedValue(undefined);
  const session = new Session<TestStore, Data>(new TestStore(), {
    domain: "*.example.com",
    https: true,
    key: "test:session",
  });

  beforeEach(() => {
    next.mockClear();
    session.store.mockClear();
  });

  it("does not require options to be passed the the constructor", () => {
    expect(new Session(session.store)).toBeInstanceOf(Session);
  });

  describe("#for()", () => {
    let context: Context;

    beforeEach(() => {
      context = createMockContext();
    });

    it("returns the state when the given context is know", async () => {
      await session.middleware()(context, next);
      expect(session.for(context)).toBeInstanceOf(State);
    });

    it("throws when the given context is unknown", () => {
      expect(() => session.for(context)).toThrowError();
    });
  });

  describe("#middleware()", () => {
    let context: Context;
    let subject: Middleware;

    beforeEach(() => {
      context = createMockContext();
      subject = session.middleware();
    });

    it("creates a cookie if the session is new", async () => {
      const get = jest.spyOn(context.cookies, "get");
      const set = jest.spyOn(context.cookies, "set");
      const key = ObjectId.generate();

      await session.store.adapter.load(key);
      get.mockReturnValueOnce(key);

      await subject(context, next);
      await subject(context, next);

      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenLastCalledWith(session.options.key, expect.any(String), {
        domain: session.options.domain,
        path: session.options.path,
        secure: session.options.https,
        signed: true,
      });
    });

    it("only runs initialization code once", async () => {
      await subject(context, next);
      await subject(context, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(session.store.spies.setup).toHaveBeenCalledTimes(1);
    });

    it("persists the state when necessary", async () => {
      await subject(context, next);
      await subject(context, async () => {
        session.for(context).write(draft => {
          draft.isAuthenticated = true;
        });
      });

      expect(session.store.spies.update).toHaveBeenCalledTimes(1);
      expect(session.store.spies.update).toHaveBeenCalledWith(expect.any(String), {
        isAuthenticated: true,
      });
    });
  });
});
