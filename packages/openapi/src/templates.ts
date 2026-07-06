export function swaggerUIHTML(specURL: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHTML(title)}</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
<style>
  html { box-sizing: border-box; overflow-y: scroll; }
  *, *:before, *:after { box-sizing: inherit; }
  body { margin: 0; background: #fafafa; }
</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js" crossorigin></script>
<script>
SwaggerUIBundle({
  url: ${JSON.stringify(specURL)},
  dom_id: "#swagger-ui",
  presets: [SwaggerUIBundle.presets.apis],
  layout: "BaseLayout",
  deepLinking: true,
  showExtensions: true,
  showCommonExtensions: true,
});
<\/script>
</body>
</html>`;
}

export function redocHTML(specURL: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHTML(title)}</title>
<style>
  body { margin: 0; padding: 0; }
</style>
</head>
<body>
<div id="redoc-container"></div>
<script src="https://unpkg.com/redoc@latest/bundles/redoc.standalone.js" crossorigin></script>
<script>
Redoc.init(${JSON.stringify(specURL)}, { scrollYOffset: 0 }, document.getElementById("redoc-container"));
<\/script>
</body>
</html>`;
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
