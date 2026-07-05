function r(n){return{fetch(t,i,e){return n.handle(t,{runtime:"edge",env:i,waitUntil:e?.waitUntil?.bind(e)})}}}export{r as createEdgeHandler};
