#!/bin/bash
set -e

# 1. Build the app for the /tile-game subpath
echo "Building for /tile-game..."
NEXT_PUBLIC_BASE_PATH=/tile-game deno task build

# 2. Add .nojekyll for GitHub Pages to correctly serve _next directory
touch out/.nojekyll

# 3. Ensure the 'pages' branch exists
if ! git rev-parse --verify pages >/dev/null 2>&1; then
    echo "Creating orphan pages branch..."
    git checkout --orphan pages
    git rm -rf .
    git commit --allow-empty -m "Initial pages commit"
    git checkout -
fi

# 4. Use a temporary worktree to update the branch without affecting current state
echo "Preparing pages-deploy worktree..."
rm -rf ./pages-deploy
git worktree add -f ./pages-deploy pages

# 5. Replace contents of the branch with the new build output
rm -rf ./pages-deploy/*
cp -rp out/* ./pages-deploy/

# 6. Commit and push changes
cd ./pages-deploy
git add .
if git diff-index --quiet HEAD --; then
    echo "No changes to commit."
else
    git commit -m "Publish build for /tile-game at $(date)"
    echo "Pushing to origin pages..."
    git push origin pages --force
fi

# 7. Cleanup the temporary worktree
cd ..
git worktree remove ./pages-deploy

echo "Successfully published to pages branch."
