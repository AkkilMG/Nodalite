$dist = "docs/.vitepress/dist"
$branch = git branch --show-current

# Set custom domain so VitePress uses base "/" instead of "/Nodalite/"
$env:CUSTOM_DOMAIN = "true"

# Build docs site
npm run build -w docs

# Deploy using orphan branch (only dist files go to gh-pages)
git checkout --orphan gh-pages-temp
git --work-tree $dist add --all
git commit -m "Deploy to GitHub Pages"
git push -f origin gh-pages-temp:gh-pages

# Clean up and return to main
git checkout -f main
git branch -D gh-pages-temp
