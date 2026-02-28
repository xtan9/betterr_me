/**
 * Bundle size analysis script
 * QA-005: Performance audit - Bundle analysis
 *
 * Usage: tsx scripts/analyze-bundle.ts
 *
 * Targets:
 * - Total JS < 750KB gzipped (increased from 600KB for Tiptap rich-text editor in journal)
 * - No single chunk > 130KB gzipped (increased from 100KB; Tiptap lazy chunk is ~119KB)
 */

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { gzipSync } from 'zlib';

const BUILD_DIR = join(process.cwd(), '.next');
const STATIC_DIR = join(BUILD_DIR, 'static');

interface BundleInfo {
  name: string;
  size: number;
  gzipSize: number;
}

function getGzipSize(filePath: string): number {
  try {
    const buf = readFileSync(filePath);
    return gzipSync(buf).length;
  } catch {
    return 0;
  }
}

function walkDir(dir: string, ext: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, ext));
      } else if (entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function analyze() {
  console.log('🔍 Bundle Size Analysis\n');
  console.log('='.repeat(70));

  // Analyze JS bundles
  const jsFiles = walkDir(STATIC_DIR, '.js');
  const bundles: BundleInfo[] = jsFiles.map(file => ({
    name: basename(file),
    size: statSync(file).size,
    gzipSize: getGzipSize(file),
  }));

  bundles.sort((a, b) => b.gzipSize - a.gzipSize);

  console.log('\n📦 JavaScript Bundles (sorted by gzip size):\n');
  console.log(
    'Name'.padEnd(50) +
    'Size'.padStart(12) +
    'Gzip'.padStart(12)
  );
  console.log('-'.repeat(74));

  let totalSize = 0;
  let totalGzip = 0;
  const oversizedChunks: BundleInfo[] = [];

  for (const bundle of bundles) {
    totalSize += bundle.size;
    totalGzip += bundle.gzipSize;

    const isLarge = bundle.gzipSize > 130 * 1024;
    if (isLarge) oversizedChunks.push(bundle);

    const marker = isLarge ? ' ⚠️' : '';
    console.log(
      bundle.name.substring(0, 48).padEnd(50) +
      formatBytes(bundle.size).padStart(12) +
      formatBytes(bundle.gzipSize).padStart(12) +
      marker
    );
  }

  console.log('-'.repeat(74));
  console.log(
    'Total'.padEnd(50) +
    formatBytes(totalSize).padStart(12) +
    formatBytes(totalGzip).padStart(12)
  );

  // Analyze CSS
  const cssFiles = walkDir(STATIC_DIR, '.css');
  if (cssFiles.length > 0) {
    console.log('\n🎨 CSS Bundles:\n');
    let cssTotal = 0;
    let cssGzipTotal = 0;
    for (const file of cssFiles) {
      const size = statSync(file).size;
      const gzip = getGzipSize(file);
      cssTotal += size;
      cssGzipTotal += gzip;
      console.log(
        basename(file).substring(0, 48).padEnd(50) +
        formatBytes(size).padStart(12) +
        formatBytes(gzip).padStart(12)
      );
    }
    console.log(
      'CSS Total'.padEnd(50) +
      formatBytes(cssTotal).padStart(12) +
      formatBytes(cssGzipTotal).padStart(12)
    );
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Summary:\n');
  console.log(`  JS Bundles: ${bundles.length} files`);
  console.log(`  Total JS Size: ${formatBytes(totalSize)} (${formatBytes(totalGzip)} gzipped)`);
  console.log(`  Total JS target: < 750KB gzipped`);
  console.log(`  Per-chunk target: < 130KB gzipped`);

  // Check thresholds
  let hasIssues = false;

  if (totalGzip > 750 * 1024) {
    console.log(`\n  ⚠️  Total JS gzipped (${formatBytes(totalGzip)}) exceeds 750KB target`);
    hasIssues = true;
  } else {
    console.log(`\n  ✅ Total JS gzipped within 750KB target`);
  }

  if (oversizedChunks.length > 0) {
    console.log(`  ⚠️  ${oversizedChunks.length} chunk(s) exceed 130KB gzipped:`);
    for (const chunk of oversizedChunks) {
      console.log(`     - ${chunk.name}: ${formatBytes(chunk.gzipSize)}`);
    }
    hasIssues = true;
  } else {
    console.log(`  ✅ All chunks within 130KB gzipped target`);
  }

  console.log('');

  // Write report to .next/analyze/ for CI artifact upload
  const analyzeDir = join(BUILD_DIR, 'analyze');
  mkdirSync(analyzeDir, { recursive: true });
  writeFileSync(
    join(analyzeDir, 'bundle-report.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      bundles,
      totalSize,
      totalGzip,
      oversizedChunks,
      thresholds: { totalGzip: 750 * 1024, perChunkGzip: 130 * 1024 },
      passed: !hasIssues,
    }, null, 2)
  );
  console.log(`\n📄 Report written to .next/analyze/bundle-report.json`);

  if (hasIssues) {
    console.log('\n💡 Optimization suggestions:');
    console.log('  - Review dynamic imports for large chunks');
    console.log('  - Check for unnecessary dependencies');
    console.log('  - Consider code splitting for route-specific code');
    console.log('  - Use next/dynamic for heavy components');
    process.exit(1);
  }
}

analyze();
