import { describe, expect, it } from "vitest";
import * as nodalite from "./index.js";
import * as core from "@nodalite/core";

describe("nodalite re-exports", () => {
  it("re-exports all public symbols from @nodalite/core", () => {
    const coreKeys = Object.keys(core);
    for (const key of coreKeys) {
      expect(nodalite).toHaveProperty(key);
    }
  });

  it("exports App class that creates working instances", () => {
    const app = new nodalite.App();
    expect(app).toBeInstanceOf(nodalite.App);
  });

  it("exports HttpError class", () => {
    const err = nodalite.HttpError.forbidden("denied");
    expect(err).toBeInstanceOf(nodalite.HttpError);
    expect(err.status).toBe(403);
  });

  it("exports Context class", () => {
    expect(nodalite.Context).toBeDefined();
    expect(typeof nodalite.Context).toBe("function");
  });

  it("exports Router class", () => {
    const router = new nodalite.Router();
    expect(router).toBeInstanceOf(nodalite.Router);
  });

  it("exports compose function", () => {
    expect(typeof nodalite.compose).toBe("function");
  });

  it("exports validate function", () => {
    expect(typeof nodalite.validate).toBe("function");
  });

  it("re-exports match count equals core exports", () => {
    expect(Object.keys(nodalite).length).toBe(Object.keys(core).length);
  });
});
