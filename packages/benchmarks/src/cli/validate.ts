/**
 * Validate Command
 *
 * Validate benchmark configuration and files.
 */

import { Command } from 'commander';
import { join } from 'path';
import { readdir, stat, readFile, access, constants } from 'fs/promises';
import { createConsoleReporter } from '../reporters/console';

interface ValidationResult {
  benchmarkId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateCommand = new Command('validate')
  .description('Validate benchmark configuration')
  .argument('[benchmarkId]', 'Specific benchmark to validate')
  .option('--benchmarks-dir <path>', 'Path to benchmarks directory')
  .option('--fix', 'Attempt to fix issues')
  .action(async (benchmarkId, options) => {
    const consoleReporter = createConsoleReporter();

    try {
      const benchmarksDir = options.benchmarksDir ?? join(process.cwd(), 'benchmarks');
      const results: ValidationResult[] = [];

      // Get benchmarks to validate
      let benchmarks: string[] = [];
      if (benchmarkId) {
        benchmarks = [benchmarkId];
      } else {
        const entries = await readdir(benchmarksDir);
        benchmarks = entries.filter((e) => e.match(/^\d{2}-/) && !e.startsWith('00-'));
      }

      console.log('');
      console.log('Validating Benchmarks');
      console.log('═'.repeat(50));
      console.log('');

      for (const benchmark of benchmarks) {
        const result = await validateBenchmark(benchmarksDir, benchmark);
        results.push(result);

        // Print result
        if (result.valid) {
          consoleReporter.printSuccess(`${benchmark}: Valid`);
        } else {
          consoleReporter.printError(`${benchmark}: Invalid`);
          for (const error of result.errors) {
            console.log(`    - ${error}`);
          }
        }

        for (const warning of result.warnings) {
          consoleReporter.printWarning(`  ${warning}`);
        }
      }

      // Validate ground truth files
      console.log('');
      console.log('Validating Ground Truth Files');
      console.log('─'.repeat(40));

      const groundTruthDir = join(benchmarksDir, 'ground-truth');
      try {
        const gtFiles = await readdir(groundTruthDir);
        for (const file of gtFiles) {
          if (!file.endsWith('.json')) continue;

          const filePath = join(groundTruthDir, file);
          try {
            const content = await readFile(filePath, 'utf-8');
            const parsed = JSON.parse(content);

            // Validate structure
            const errors: string[] = [];
            if (!parsed.benchmarkId) errors.push('Missing benchmarkId');
            if (!parsed.waves || !Array.isArray(parsed.waves)) errors.push('Missing or invalid waves array');
            if (!parsed.criticalPath || !Array.isArray(parsed.criticalPath)) errors.push('Missing or invalid criticalPath');
            if (typeof parsed.maxParallelism !== 'number') errors.push('Missing or invalid maxParallelism');

            // Validate waves structure
            if (parsed.waves) {
              for (let i = 0; i < parsed.waves.length; i++) {
                const wave = parsed.waves[i];
                if (typeof wave.wave !== 'number') errors.push(`Wave ${i}: missing wave number`);
                if (!Array.isArray(wave.tasks)) errors.push(`Wave ${i}: missing tasks array`);
                if (!Array.isArray(wave.parallel)) errors.push(`Wave ${i}: missing parallel array`);
              }
            }

            if (errors.length === 0) {
              consoleReporter.printSuccess(`${file}: Valid`);
            } else {
              consoleReporter.printError(`${file}: Invalid`);
              for (const error of errors) {
                console.log(`    - ${error}`);
              }
            }
          } catch (e) {
            consoleReporter.printError(`${file}: Invalid JSON - ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch {
        consoleReporter.printWarning('No ground-truth directory found');
      }

      // Summary
      console.log('');
      console.log('Summary');
      console.log('─'.repeat(40));

      const validCount = results.filter((r) => r.valid).length;
      const invalidCount = results.filter((r) => !r.valid).length;

      console.log(`  Valid:   ${validCount}`);
      console.log(`  Invalid: ${invalidCount}`);
      console.log('');

      if (invalidCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      consoleReporter.printError(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

async function validateBenchmark(benchmarksDir: string, benchmarkId: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    benchmarkId,
    valid: true,
    errors: [],
    warnings: [],
  };

  const benchmarkPath = join(benchmarksDir, benchmarkId);

  // Check directory exists
  try {
    const s = await stat(benchmarkPath);
    if (!s.isDirectory()) {
      result.errors.push('Not a directory');
      result.valid = false;
      return result;
    }
  } catch {
    result.errors.push('Directory not found');
    result.valid = false;
    return result;
  }

  // Check PRD.md exists
  const prdPath = join(benchmarkPath, 'PRD.md');
  try {
    await stat(prdPath);
  } catch {
    result.errors.push('PRD.md not found');
    result.valid = false;
  }

  // Validate PRD structure
  try {
    const prdContent = await readFile(prdPath, 'utf-8');

    // Check for required sections
    if (!prdContent.includes('## 1. Project Overview')) {
      result.warnings.push('PRD missing "Project Overview" section');
    }
    if (!prdContent.includes('## 2. Architecture')) {
      result.warnings.push('PRD missing "Architecture" section');
    }
    if (!prdContent.includes('## 3. Dependency Graph')) {
      result.warnings.push('PRD missing "Dependency Graph" section');
    }
    if (!prdContent.includes('## 6. Acceptance Criteria')) {
      result.warnings.push('PRD missing "Acceptance Criteria" section');
    }
  } catch {
    // PRD read error handled above
  }

  // Check fixtures directory (optional but recommended)
  const fixturesPath = join(benchmarkPath, 'fixtures');
  try {
    await stat(fixturesPath);
  } catch {
    result.warnings.push('No fixtures directory');
  }

  // Check acceptance tests
  const acceptancePath = join(benchmarkPath, 'acceptance');
  try {
    await stat(acceptancePath);

    // Check for test script
    const testScripts = ['run-tests.sh', 'acceptance.sh', 'test.sh'];
    let hasScript = false;
    for (const script of testScripts) {
      try {
        const scriptPath = join(acceptancePath, script);
        await stat(scriptPath);
        hasScript = true;

        // Check executable
        try {
          await access(scriptPath, constants.X_OK);
        } catch {
          result.warnings.push(`${script} is not executable`);
        }
        break;
      } catch {
        // Try next
      }
    }

    if (!hasScript) {
      result.warnings.push('No test script found in acceptance directory');
    }
  } catch {
    result.warnings.push('No acceptance directory');
  }

  return result;
}
