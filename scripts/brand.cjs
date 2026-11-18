// Run with: npm run brand. Writes brand/colors.json and brand/colors.css from frontend/src/theme/tokens.ts.
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const ts = require(path.join(repo, 'frontend/node_modules/typescript'));
const src = fs.readFileSync(path.join(repo, 'frontend/src/theme/tokens.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
const t = mod.exports;
const out = { brand: t.brand, dark: t.darkColors, light: t.lightColors, fonts: { display: 'Geist 600', body: 'Geist 400/500', serif: 'Newsreader 400 (and italic)', mono: 'Geist Mono 400/500' }, radius: t.radius, spacing: t.spacing };
const dir = path.join(repo, 'brand');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'colors.json'), JSON.stringify(out, null, 2) + '\n');
const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const vars = (o, prefix) => Object.entries(o).map(([k, v]) => `  --${prefix}${kebab(k)}: ${v};`).join('\n');
const css = `/* Riffly colours. Generated from frontend/src/theme/tokens.ts by "npm run brand"; don't edit by hand. */\n\n:root {\n  /* Brand */\n${vars(t.brand, 'brand-')}\n\n  /* Dark theme (default) */\n${vars(t.darkColors, '')}\n}\n\n[data-theme='light'] {\n${vars(t.lightColors, '')}\n}\n`;
fs.writeFileSync(path.join(dir, 'colors.css'), css);
console.log('wrote', Object.keys(t.darkColors).length, 'tokens');
