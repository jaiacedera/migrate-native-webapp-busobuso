const fs = require('fs');
const path = require('path');

const packageDir = path.join(__dirname, '..', 'node_modules', 'expo-module-scripts');
const sourcePath = path.join(packageDir, 'tsconfig.base.json');
const targetPath = path.join(packageDir, 'tsconfig.base');
const expoCameraTsconfigPath = path.join(__dirname, '..', 'node_modules', 'expo-camera', 'tsconfig.json');

try {
  if (!fs.existsSync(sourcePath)) {
    process.exit(0);
  }

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }

  if (fs.existsSync(expoCameraTsconfigPath)) {
    const cameraTsconfigRaw = fs.readFileSync(expoCameraTsconfigPath, 'utf8');
    const fixedTsconfigRaw = cameraTsconfigRaw
      .replace('"extends": "expo-module-scripts/tsconfig.base"', '"extends": "../expo-module-scripts/tsconfig.base"')
      .replace('"extends": "../expo-module-scripts/tsconfig.base.json"', '"extends": "../expo-module-scripts/tsconfig.base"');

    if (fixedTsconfigRaw !== cameraTsconfigRaw) {
      fs.writeFileSync(expoCameraTsconfigPath, fixedTsconfigRaw);
    }
  }
} catch (error) {
  console.warn('Could not create expo-module-scripts tsconfig.base shim:', error?.message || error);
}
