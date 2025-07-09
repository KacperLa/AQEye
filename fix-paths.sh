#!/bin/bash

# Fix paths in the built files for GitHub Pages deployment
# This script converts absolute paths to relative paths

echo "Fixing paths for GitHub Pages deployment..."

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Error: dist directory not found"
    exit 1
fi

# Fix index.html
if [ -f "dist/index.html" ]; then
    echo "Fixing index.html paths..."
    sed -i 's|href="/|href="./|g' dist/index.html
    sed -i 's|src="/_expo/|src="./_expo/|g' dist/index.html
    echo "Fixed index.html"
else
    echo "Warning: dist/index.html not found"
fi

# Fix any other absolute paths in JS files (if needed)
if find dist -name "*.js" -type f | head -1 > /dev/null; then
    echo "Fixing JavaScript files..."
    find dist -name "*.js" -type f -exec sed -i 's|"/_expo/|"./_expo/|g' {} \;
    echo "Fixed JavaScript files"
fi

echo "Path fixing complete!"
