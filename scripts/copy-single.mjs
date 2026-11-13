import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist-single', { recursive: true });
copyFileSync('dist-single/index.html', 'dist-single/GENOME-M2.html');
console.log('Single-file build: dist-single/GENOME-M2.html');
