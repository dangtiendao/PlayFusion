import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Kiểm Tra Bất Biến Kiến Trúc (Architecture Invariants Test - P2.5c)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const srcDir = path.join(rootDir, 'src');
  const packagesDir = path.join(rootDir, 'packages');

  function getAllSourceFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
          results.push(...getAllSourceFiles(fullPath));
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('1. BẰNG CHỨNG DoD GỐC: Tuyệt đối KHÔNG module nào ngoài src/repositories/ được import @supabase/supabase-js', () => {
    const allFiles = [...getAllSourceFiles(srcDir), ...getAllSourceFiles(packagesDir)];
    const forbiddenImports = [
      '@supabase/supabase-js',
      'src/repositories/supabaseClient',
      './supabaseClient',
      '../repositories/supabaseClient',
    ];

    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of allFiles) {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

      // Bỏ qua thư mục repositories và các file test RLS (chạy trực tiếp trên test DB)
      if (relPath.startsWith('src/repositories/') || relPath.startsWith('tests/rls/')) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Bỏ qua comment
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }

        for (const forbidden of forbiddenImports) {
          if (
            ((trimmed.startsWith('import') || trimmed.startsWith('export')) &&
              trimmed.includes(`'${forbidden}'`)) ||
            trimmed.includes(`"${forbidden}"`)
          ) {
            violations.push({
              file: relPath,
              line: index + 1,
              content: trimmed,
            });
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('2. src/core/syncOutbox.ts là generic queue thuần, không import src/repositories', () => {
    const outboxPath = path.join(srcDir, 'core', 'syncOutbox.ts');
    expect(fs.existsSync(outboxPath)).toBe(true);

    const content = fs.readFileSync(outboxPath, 'utf8');
    expect(content).not.toMatch(/from\s+['"].*repositories.*['"]/);
    expect(content).not.toMatch(/@supabase/);
  });

  it('3. packages/engines hoàn toàn độc lập 100%, không import bất kỳ file nào từ src/', () => {
    const engineFiles = getAllSourceFiles(packagesDir);
    const violations: string[] = [];

    for (const filePath of engineFiles) {
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');

      if (
        content.includes("from '@/") ||
        content.includes("from '../src") ||
        content.includes("from '../../src")
      ) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });
});
