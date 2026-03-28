const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace utility classes
  content = content.replace(/indigo/g, 'teal');

  // Replace hardcoded HEX codes introduced in the mock signin page or elsewhere
  content = content.replace(/#4F46E5/gi, '#387B8A');
  content = content.replace(/#3730A3/gi, '#275A65');
  content = content.replace(/#EEF2FF/gi, '#F0FDF4'); // close to teal-50
  content = content.replace(/#E0E7FF/gi, '#E0F8F1'); // close to teal-100

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        walkDir(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));

// Update globals.css
const globalsPath = path.join(__dirname, 'src', 'app', 'globals.css');
if (fs.existsSync(globalsPath)) {
  let cssContent = fs.readFileSync(globalsPath, 'utf8');
  
  // Update CSS custom properties
  cssContent = cssContent.replace(/--color-primary:\s*#4F46E5/i, '--color-primary: #387B8A');
  cssContent = cssContent.replace(/--color-primary-light:\s*#6366F1/i, '--color-primary-light: #4A9CAE');
  cssContent = cssContent.replace(/--color-primary-dark:\s*#3730A3/i, '--color-primary-dark: #275A65');
  
  // Update rgba values mapped to 4F46E5
  cssContent = cssContent.replace(/rgba\(\s*79\s*,\s*70\s*,\s*229/g, 'rgba(56, 123, 138');
  
  // Inject explicit teal color mapping so standard tailwind teal resolves to our dark teal
  // only if it hasn't been added yet
  if (!cssContent.includes('--color-teal-600: #387B8A')) {
    cssContent = cssContent.replace(/@theme inline\s*\{/, `@theme inline {
  --color-teal-50: #f0fdf4;
  --color-teal-100: #ccfbf1;
  --color-teal-500: #4A9CAE;
  --color-teal-600: #387B8A;
  --color-teal-700: #275A65;
  --color-teal-800: #1a424a;
  --color-teal-900: #112d33;`);
  }
  
  fs.writeFileSync(globalsPath, cssContent);
  console.log(`Updated ${globalsPath}`);
}
