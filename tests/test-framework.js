/**
 * Zero-Dependency Browser-Native Micro Test Runner
 * Wardrobe Organizer & AI Fashion Stylist PWA
 * 
 * Supports describe, it, expect, beforeEach, afterEach, beforeAll, afterAll,
 * deep equality, async tests, assertion counting, and progressive test execution.
 */

class TestAssertionError extends Error {
  constructor(message, expected, actual) {
    super(message);
    this.name = 'TestAssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

// Deep equality comparator supporting primitives, Objects, Arrays, ArrayBuffers, Dates, Sets, Maps
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;

  if (a == null || b == null) return a === b;

  if (typeof a !== 'object' && typeof b !== 'object') {
    return Object.is(a, b);
  }

  if (a.constructor !== b.constructor) return false;

  if (a instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    if (a.byteLength !== b.byteLength) return false;
    const viewA = new Uint8Array(a);
    const viewB = new Uint8Array(b);
    for (let i = 0; i < viewA.length; i++) {
      if (viewA[i] !== viewB[i]) return false;
    }
    return true;
  }

  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.byteLength !== b.byteLength) return false;
    const uA = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const uB = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < uA.length; i++) {
      if (uA[i] !== uB[i]) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const val of a) {
      let found = false;
      for (const bVal of b) {
        if (deepEqual(val, bVal)) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

function formatValue(val) {
  if (typeof val === 'string') return `"${val}"`;
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
  if (val instanceof ArrayBuffer) return `ArrayBuffer(${val.byteLength})`;
  if (ArrayBuffer.isView(val)) return `${val.constructor.name}(${val.byteLength} bytes)`;
  if (typeof val === 'object') {
    try {
      const str = JSON.stringify(val);
      if (str.length > 100) return str.slice(0, 97) + '...';
      return str;
    } catch {
      return String(val);
    }
  }
  return String(val);
}

class TestContext {
  constructor(runner) {
    this.runner = runner;
    this.isSkipped = false;
    this.skipReason = null;
  }

  skip(reason = 'Test skipped') {
    this.isSkipped = true;
    this.skipReason = reason;
  }
}

class Expectation {
  constructor(actual, isNegated = false, runner = null) {
    this.actual = actual;
    this.isNegated = isNegated;
    this.runner = runner;
  }

  get not() {
    return new Expectation(this.actual, !this.isNegated, this.runner);
  }

  get rejects() {
    return {
      toThrow: async (expectedPattern) => {
        if (this.runner) this.runner.totalAssertions++;
        let threw = false;
        let caughtError = null;
        try {
          if (typeof this.actual === 'function') {
            await this.actual();
          } else {
            await this.actual;
          }
        } catch (err) {
          threw = true;
          caughtError = err;
        }

        const passes = this.isNegated ? !threw : threw;
        if (!passes) {
          const msg = this.isNegated
            ? `Expected promise not to reject, but it rejected with ${caughtError}`
            : `Expected promise to reject with error, but it did not reject`;
          throw new TestAssertionError(msg, expectedPattern, caughtError);
        }

        if (threw && expectedPattern && !this.isNegated) {
          const errMsg = caughtError ? (caughtError.message || String(caughtError)) : '';
          const matches = expectedPattern instanceof RegExp
            ? expectedPattern.test(errMsg)
            : errMsg.includes(String(expectedPattern));
          if (!matches) {
            throw new TestAssertionError(
              `Expected error message matching ${expectedPattern}, but got "${errMsg}"`,
              expectedPattern,
              errMsg
            );
          }
        }
      }
    };
  }

  _recordAssertion() {
    if (this.runner) this.runner.totalAssertions++;
  }

  _assert(condition, message, expected) {
    this._recordAssertion();
    const passes = this.isNegated ? !condition : condition;
    if (!passes) {
      const msg = this.isNegated
        ? `[NOT] ${message}. Received: ${formatValue(this.actual)}`
        : `${message}. Expected: ${formatValue(expected)}, Received: ${formatValue(this.actual)}`;
      throw new TestAssertionError(msg, expected, this.actual);
    }
  }

  toBe(expected) {
    this._assert(
      Object.is(this.actual, expected),
      `Expected values to be strictly identical`,
      expected
    );
  }

  toEqual(expected) {
    this._assert(
      deepEqual(this.actual, expected),
      `Expected values to be deeply equal`,
      expected
    );
  }

  toBeTruthy() {
    this._assert(
      Boolean(this.actual) === true,
      `Expected value to be truthy`,
      true
    );
  }

  toBeFalsy() {
    this._assert(
      Boolean(this.actual) === false,
      `Expected value to be falsy`,
      false
    );
  }

  toBeNull() {
    this._assert(
      this.actual === null,
      `Expected value to be null`,
      null
    );
  }

  toBeUndefined() {
    this._assert(
      this.actual === undefined,
      `Expected value to be undefined`,
      undefined
    );
  }

  toBeDefined() {
    this._assert(
      this.actual !== undefined,
      `Expected value to be defined`,
      '(defined)'
    );
  }

  toBeGreaterThan(expected) {
    this._assert(
      typeof this.actual === 'number' && this.actual > expected,
      `Expected ${formatValue(this.actual)} to be greater than ${formatValue(expected)}`,
      expected
    );
  }

  toBeGreaterThanOrEqual(expected) {
    this._assert(
      typeof this.actual === 'number' && this.actual >= expected,
      `Expected ${formatValue(this.actual)} to be greater than or equal to ${formatValue(expected)}`,
      expected
    );
  }

  toBeLessThan(expected) {
    this._assert(
      typeof this.actual === 'number' && this.actual < expected,
      `Expected ${formatValue(this.actual)} to be less than ${formatValue(expected)}`,
      expected
    );
  }

  toBeLessThanOrEqual(expected) {
    this._assert(
      typeof this.actual === 'number' && this.actual <= expected,
      `Expected ${formatValue(this.actual)} to be less than or equal to ${formatValue(expected)}`,
      expected
    );
  }

  toContain(expected) {
    let contains = false;
    if (this.actual == null) {
      contains = false;
    } else if (typeof this.actual === 'string' || Array.isArray(this.actual)) {
      contains = this.actual.includes(expected);
    } else if (this.actual instanceof Set) {
      contains = this.actual.has(expected);
    } else if (typeof this.actual === 'object') {
      contains = Object.prototype.hasOwnProperty.call(this.actual, expected);
    }
    this._assert(
      contains,
      `Expected container to contain element`,
      expected
    );
  }

  toHaveLength(expected) {
    const len = this.actual != null ? this.actual.length : undefined;
    this._assert(
      len === expected,
      `Expected length to be ${expected}, got ${len}`,
      expected
    );
  }

  toBeCloseTo(expected, precision = 2) {
    const diff = Math.abs(this.actual - expected);
    const threshold = Math.pow(10, -precision) / 2;
    this._assert(
      diff < threshold,
      `Expected ${this.actual} to be close to ${expected} with precision ${precision}`,
      expected
    );
  }

  toBeInstanceOf(expectedClass) {
    this._assert(
      this.actual instanceof expectedClass,
      `Expected object to be instance of ${expectedClass.name}`,
      expectedClass.name
    );
  }

  toMatch(regexOrString) {
    let matches = false;
    if (typeof this.actual === 'string') {
      matches = regexOrString instanceof RegExp
        ? regexOrString.test(this.actual)
        : this.actual.includes(String(regexOrString));
    }
    this._assert(
      matches,
      `Expected string to match pattern`,
      regexOrString
    );
  }

  toThrow(expectedPattern) {
    this._recordAssertion();
    if (typeof this.actual !== 'function') {
      throw new TestAssertionError(`toThrow requires a function to execute`, 'Function', typeof this.actual);
    }
    let threw = false;
    let caughtError = null;
    try {
      this.actual();
    } catch (err) {
      threw = true;
      caughtError = err;
    }

    const passes = this.isNegated ? !threw : threw;
    if (!passes) {
      const msg = this.isNegated
        ? `Expected function not to throw, but it threw ${caughtError}`
        : `Expected function to throw an error, but it returned without throwing`;
      throw new TestAssertionError(msg, expectedPattern, caughtError);
    }

    if (threw && expectedPattern && !this.isNegated) {
      const errMsg = caughtError ? (caughtError.message || String(caughtError)) : '';
      const matches = expectedPattern instanceof RegExp
        ? expectedPattern.test(errMsg)
        : errMsg.includes(String(expectedPattern));
      if (!matches) {
        throw new TestAssertionError(
          `Expected error message matching ${expectedPattern}, but got "${errMsg}"`,
          expectedPattern,
          errMsg
        );
      }
    }
  }
}

class TestSuite {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = [];
    this.tests = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
  }
}

class MicroTestRunner {
  constructor() {
    this.rootSuites = [];
    this.currentSuite = null;
    this.totalAssertions = 0;
    this.results = null;
  }

  reset() {
    this.rootSuites = [];
    this.currentSuite = null;
    this.totalAssertions = 0;
    this.results = null;
  }

  describe(name, fn) {
    const suite = new TestSuite(name, this.currentSuite);
    if (this.currentSuite) {
      this.currentSuite.children.push(suite);
    } else {
      this.rootSuites.push(suite);
    }

    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  it(name, fn) {
    if (!this.currentSuite) {
      this.describe('Global', () => this.it(name, fn));
      return;
    }
    this.currentSuite.tests.push({
      name,
      fn,
      skip: false
    });
  }

  skip(name, fn) {
    if (!this.currentSuite) {
      this.describe('Global', () => this.skip(name, fn));
      return;
    }
    this.currentSuite.tests.push({
      name,
      fn,
      skip: true,
      skipReason: 'Explicitly skipped with it.skip'
    });
  }

  beforeEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeEachHooks.push(fn);
    }
  }

  afterEach(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterEachHooks.push(fn);
    }
  }

  beforeAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeAllHooks.push(fn);
    }
  }

  afterAll(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterAllHooks.push(fn);
    }
  }

  expect(actual) {
    return new Expectation(actual, false, this);
  }

  async run(filter = null) {
    const startTime = performance.now();
    const suiteResults = [];
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    const executeSuite = async (suite, path = '') => {
      const suiteFullName = path ? `${path} > ${suite.name}` : suite.name;
      const suiteResult = {
        name: suiteFullName,
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0
      };

      // Collect all beforeEach and afterEach hooks up the ancestor chain
      const getHooks = (s, hookType) => {
        let hooks = [];
        let cur = s;
        while (cur) {
          hooks = [...cur[hookType], ...hooks];
          cur = cur.parent;
        }
        return hooks;
      };

      // Run beforeAll hooks for this suite
      for (const hook of suite.beforeAllHooks) {
        try {
          await hook();
        } catch (err) {
          console.error(`Error in beforeAll for ${suiteFullName}:`, err);
        }
      }

      // Execute tests
      for (const test of suite.tests) {
        if (filter && !`${suiteFullName} ${test.name}`.toLowerCase().includes(filter.toLowerCase())) {
          continue;
        }

        total++;
        const testStartTime = performance.now();
        const testCtx = new TestContext(this);
        const testResult = {
          name: test.name,
          suiteName: suiteFullName,
          status: 'passed',
          durationMs: 0,
          error: null,
          skipReason: null
        };

        if (test.skip) {
          skipped++;
          suiteResult.skipped++;
          testResult.status = 'skipped';
          testResult.skipReason = test.skipReason || 'Skipped';
          testResult.durationMs = 0;
          suiteResult.tests.push(testResult);
          continue;
        }

        const initialAssertions = this.totalAssertions;
        try {
          // Run beforeEach hooks
          const beforeHooks = getHooks(suite, 'beforeEachHooks');
          for (const hook of beforeHooks) {
            await hook(testCtx);
          }

          if (testCtx.isSkipped) {
            skipped++;
            suiteResult.skipped++;
            testResult.status = 'skipped';
            testResult.skipReason = testCtx.skipReason;
          } else {
            // Run the actual test
            await test.fn(testCtx);

            if (testCtx.isSkipped) {
              skipped++;
              suiteResult.skipped++;
              testResult.status = 'skipped';
              testResult.skipReason = testCtx.skipReason;
            } else {
              passed++;
              suiteResult.passed++;
              testResult.status = 'passed';
            }
          }
        } catch (err) {
          failed++;
          suiteResult.failed++;
          testResult.status = 'failed';
          testResult.error = {
            message: err.message || String(err),
            stack: err.stack,
            expected: err.expected !== undefined ? formatValue(err.expected) : undefined,
            actual: err.actual !== undefined ? formatValue(err.actual) : undefined
          };
        } finally {
          // Run afterEach hooks
          const afterHooks = getHooks(suite, 'afterEachHooks');
          for (const hook of afterHooks) {
            try {
              await hook(testCtx);
            } catch (hookErr) {
              console.error(`Error in afterEach for ${test.name}:`, hookErr);
            }
          }
        }

        testResult.durationMs = Math.round((performance.now() - testStartTime) * 100) / 100;
        testResult.assertionsCount = this.totalAssertions - initialAssertions;
        suiteResult.tests.push(testResult);
      }

      // Run afterAll hooks for this suite
      for (const hook of suite.afterAllHooks) {
        try {
          await hook();
        } catch (err) {
          console.error(`Error in afterAll for ${suiteFullName}:`, err);
        }
      }

      if (suiteResult.tests.length > 0) {
        suiteResults.push(suiteResult);
      }

      // Run nested child suites
      for (const child of suite.children) {
        await executeSuite(child, suiteFullName);
      }
    };

    for (const root of this.rootSuites) {
      await executeSuite(root);
    }

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    this.results = {
      status: failed === 0 ? 'passed' : 'failed',
      summary: {
        total,
        passed,
        failed,
        skipped,
        assertions: this.totalAssertions,
        durationMs
      },
      suites: suiteResults,
      timestamp: new Date().toISOString()
    };

    return this.results;
  }
}

// Singleton runner instance
export const testRunner = new MicroTestRunner();

// Exported DSL functions
export const describe = (name, fn) => testRunner.describe(name, fn);
export const it = (name, fn) => testRunner.it(name, fn);
it.skip = (name, fn) => testRunner.skip(name, fn);
export const test = it;
export const expect = (actual) => testRunner.expect(actual);
export const beforeEach = (fn) => testRunner.beforeEach(fn);
export const afterEach = (fn) => testRunner.afterEach(fn);
export const beforeAll = (fn) => testRunner.beforeAll(fn);
export const afterAll = (fn) => testRunner.afterAll(fn);

/**
 * Safe dynamic import helper for progressive milestone verification.
 * If module does not exist yet, returns { ok: false, error, isMissing: true }
 * allowing tests to report informative skip reasons without crashing the runner.
 */
export async function safeImport(modulePath) {
  try {
    let resolved = modulePath;
    if (resolved.startsWith('../../')) {
      resolved = '../' + resolved.slice(6);
    }
    const mod = await import(resolved);
    return { ok: true, module: mod };
  } catch (err) {
    console.error('safeImport failed for ' + modulePath + ':', err);
    return { ok: false, error: err, isMissing: true };
  }
}

// Expose runner on window if running in browser
if (typeof window !== 'undefined') {
  window.__MICRO_TEST_RUNNER__ = testRunner;
  window.describe = describe;
  window.it = it;
  window.expect = expect;
  window.beforeEach = beforeEach;
  window.afterEach = afterEach;
  window.beforeAll = beforeAll;
  window.afterAll = afterAll;
}
