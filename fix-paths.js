const fs = require('fs');
const path = require('path');

console.log('Fixing paths for GitHub Pages deployment...');

// Check for output directory - expo export:web might use different names
let outputDir = 'dist';
if (!fs.existsSync('dist')) {
    // Check for other common expo output directories
    if (fs.existsSync('web-build')) {
        outputDir = 'web-build';
    } else if (fs.existsSync('build')) {
        outputDir = 'build';
    } else {
        console.error('Error: No build output directory found (checked: dist, web-build, build)');
        process.exit(1);
    }
}

console.log(`Using output directory: ${outputDir}`);

// If we're not using 'dist', we need to copy/rename to 'dist' for gh-pages
if (outputDir !== 'dist') {
    if (fs.existsSync('dist')) {
        console.log('Removing existing dist directory...');
        fs.rmSync('dist', { recursive: true, force: true });
    }
    console.log(`Copying ${outputDir} to dist...`);
    fs.cpSync(outputDir, 'dist', { recursive: true });
}

// Rename _expo folder to expo (GitHub Pages ignores folders starting with _)
const oldExpoPath = path.join('dist', '_expo');
const newExpoPath = path.join('dist', 'expo');
if (fs.existsSync(oldExpoPath)) {
    console.log('Renaming _expo folder to expo...');
    if (fs.existsSync(newExpoPath)) {
        console.log('Removing existing expo folder...');
        fs.rmSync(newExpoPath, { recursive: true, force: true });
    }
    fs.renameSync(oldExpoPath, newExpoPath);
    console.log('Renamed _expo to expo');
} else {
    console.log('No _expo folder found to rename');
}

// Fix index.html
const indexPath = path.join('dist', 'index.html');
if (fs.existsSync(indexPath)) {
    console.log('Fixing index.html paths...');
    let content = fs.readFileSync(indexPath, 'utf8');
    
    // Fix various path patterns - be more comprehensive
    content = content.replace(/href="\//g, 'href="./');
    content = content.replace(/src="\/_expo\//g, 'src="./expo/');
    content = content.replace(/href="\/AQEye\//g, 'href="./');
    content = content.replace(/src="\/AQEye\/_expo\//g, 'src="./expo/');
    
    // Also fix any other absolute paths that might be causing issues
    content = content.replace(/src="\/AQEye\//g, 'src="./');
    content = content.replace(/href="\/AQEye\//g, 'href="./');
    
    // Fix any remaining _expo references
    content = content.replace(/src="\/_expo\//g, 'src="./expo/');
    content = content.replace(/href="\/_expo\//g, 'href="./expo/');
    
    // Fix absolute paths without repository name
    content = content.replace(/src="\/expo\//g, 'src="./expo/');
    content = content.replace(/href="\/expo\//g, 'href="./expo/');
    
    // Find all JavaScript files in the expo/static/js/web directory
    const jsWebDir = path.join('dist', 'expo', 'static', 'js', 'web');
    if (fs.existsSync(jsWebDir)) {
        const jsFiles = fs.readdirSync(jsWebDir)
            .filter(file => file.endsWith('.js'))
            .sort(); // Sort to ensure consistent order
        
        console.log('Found JavaScript files:', jsFiles);
        
        // Remove existing script tags that might have wrong paths
        content = content.replace(/<script[^>]*src="[^"]*_expo\/static\/js\/web\/[^"]*"[^>]*><\/script>/g, '');
        content = content.replace(/<script[^>]*src="[^"]*expo\/static\/js\/web\/[^"]*"[^>]*><\/script>/g, '');
        content = content.replace(/<script[^>]*src="[^"]*\/expo\/static\/js\/web\/[^"]*"[^>]*><\/script>/g, '');
        content = content.replace(/<script[^>]*src="[^"]*\/AQEye\/_expo\/static\/js\/web\/[^"]*"[^>]*><\/script>/g, '');
        
        // Add all JavaScript files as script tags before </body>
        const scriptTags = jsFiles.map(file => 
            `  <script src="./expo/static/js/web/${file}" defer></script>`
        ).join('\n');
        
        content = content.replace('</body>', `${scriptTags}\n</body>`);
    }
    
    fs.writeFileSync(indexPath, content);
    console.log('Fixed index.html');
} else {
    console.log('Warning: dist/index.html not found');
}

// Fix JavaScript files
const jsFiles = [];
function findJSFiles(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            findJSFiles(filePath);
        } else if (file.endsWith('.js')) {
            jsFiles.push(filePath);
        }
    });
}

findJSFiles('dist');

if (jsFiles.length > 0) {
    console.log('Fixing JavaScript files...');
    jsFiles.forEach(jsFile => {
        let content = fs.readFileSync(jsFile, 'utf8');
        
        // Fix all possible absolute path patterns
        content = content.replace(/"\/AQEye\/_expo\//g, '"./expo/');
        content = content.replace(/"\/AQEye\//g, '"./');
        content = content.replace(/"\/expo\//g, '"./expo/');
        content = content.replace(/"\/assets\//g, '"./assets/');
        content = content.replace(/"_expo\//g, '"expo/');
        
        // Fix base URL references
        content = content.replace(/baseUrl:"\/AQEye\/"/g, 'baseUrl:"./"');
        content = content.replace(/baseUrl:"\/"/g, 'baseUrl:"./"');
        content = content.replace(/publicPath:"\/AQEye\/"/g, 'publicPath:"./"');
        content = content.replace(/publicPath:"\/"/g, 'publicPath:"./"');
        
        // Fix import statements
        content = content.replace(/import\("\/AQEye\//g, 'import("./');
        content = content.replace(/import\("\/_expo\//g, 'import("./expo/');
        
        fs.writeFileSync(jsFile, content);
    });
    console.log('Fixed JavaScript files');
}

// Verify the final structure
console.log('\nVerifying final structure...');
const distContents = fs.readdirSync('dist');
console.log('dist/ contents:', distContents);

if (fs.existsSync(path.join('dist', 'expo'))) {
    const expoContents = fs.readdirSync(path.join('dist', 'expo'));
    console.log('dist/expo/ contents:', expoContents);
    
    if (fs.existsSync(path.join('dist', 'expo', 'static', 'js', 'web'))) {
        const jsWebContents = fs.readdirSync(path.join('dist', 'expo', 'static', 'js', 'web'));
        console.log('dist/expo/static/js/web/ contents:', jsWebContents);
    }
}

console.log('Path fixing complete!');
