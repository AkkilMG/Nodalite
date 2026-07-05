// src/index.ts
function createEdgeHandler(app) {
  return {
    fetch(request, env, ctx) {
      return app.handle(request, { runtime: "edge", env, waitUntil: ctx?.waitUntil?.bind(ctx) });
    }
  };
}
export {
  createEdgeHandler
};
