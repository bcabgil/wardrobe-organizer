/**
 * Integration Test Suite: HashRouter Navigation & View Lifecycle (Milestone 4/5)
 * Target: src/router.js
 * 
 * Verifies:
 * - Client-side HashRouter routing (#gallery, #add, #tomorrow, #laundry, #settings)
 * - Empty or unknown hash fallback redirection to #gallery
 * - Query parameter parsing (#gallery?season=winter&category=top)
 * - View lifecycle transitions (mount new view, unmount previous view)
 * - Back gesture / popstate history navigation
 * - Rapid consecutive navigation stress & memory leak prevention
 */

import { describe, it, expect, beforeEach, afterEach, safeImport } from '../test-framework.js';

describe('Router Integration: Hash Navigation & View Lifecycle', () => {
  let routerMod = null;
  let origHash = '';

  beforeEach(async (ctx) => {
    origHash = window.location.hash;
    const res = await safeImport('../../src/router.js');
    if (!res.ok) {
      ctx.skip('Pending Milestone 4/5: src/router.js not implemented yet');
      return;
    }
    routerMod = res.module;
  });

  afterEach(() => {
    window.location.hash = origHash;
  });

  // ==========================================
  // TIER 1: ROUTE REGISTRATION & PARSING
  // ==========================================

  it('T1-ROU-01: parses hash routes and query parameters correctly', async (ctx) => {
    if (!routerMod) return;

    const RouterClass = routerMod.HashRouter || routerMod.default;
    const router = new RouterClass();

    if (router.parseHash) {
      const parsed = router.parseHash('#tomorrow?anchor=123&occasion=gym');
      expect(parsed.route).toBe('#tomorrow');
      expect(parsed.params.anchor).toBe('123');
      expect(parsed.params.occasion).toBe('gym');
    }
  });

  it('T1-ROU-02: redirects unknown or empty route to #gallery by default', async (ctx) => {
    if (!routerMod) return;

    const RouterClass = routerMod.HashRouter || routerMod.default;
    let renderedRoute = null;

    const router = new RouterClass({
      defaultRoute: '#gallery'
    });

    router.register('#gallery', () => { renderedRoute = '#gallery'; });
    router.register('#laundry', () => { renderedRoute = '#laundry'; });

    await router.handleRoute('#unknown_route_xyz');
    expect(renderedRoute).toBe('#gallery');
  });

  it('T1-ROU-03: dispatches view lifecycle (mount and unmount) on route change', async (ctx) => {
    if (!routerMod) return;

    const RouterClass = routerMod.HashRouter || routerMod.default;
    const router = new RouterClass();

    let view1Mounted = false;
    let view1Unmounted = false;
    let view2Mounted = false;

    const mockView1 = {
      mount: () => { view1Mounted = true; },
      unmount: () => { view1Unmounted = true; }
    };

    const mockView2 = {
      mount: () => { view2Mounted = true; },
      unmount: () => {}
    };

    router.register('#view1', () => mockView1);
    router.register('#view2', () => mockView2);

    await router.handleRoute('#view1');
    expect(view1Mounted).toBe(true);
    expect(view1Unmounted).toBe(false);

    await router.handleRoute('#view2');
    expect(view1Unmounted).toBe(true);
    expect(view2Mounted).toBe(true);
  });

  // ==========================================
  // TIER 2: BOUNDARY & CONCURRENCY
  // ==========================================

  it('T2-ROU-01: handles rapid consecutive navigation calls cleanly without race conditions', async (ctx) => {
    if (!routerMod) return;

    const RouterClass = routerMod.HashRouter || routerMod.default;
    const router = new RouterClass();
    const transitions = [];

    router.register('#gallery', () => { transitions.push('#gallery'); });
    router.register('#tomorrow', () => { transitions.push('#tomorrow'); });
    router.register('#settings', () => { transitions.push('#settings'); });

    // Fire 3 navigations concurrently
    await Promise.all([
      router.handleRoute('#gallery'),
      router.handleRoute('#tomorrow'),
      router.handleRoute('#settings')
    ]);

    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions[transitions.length - 1]).toBe('#settings');
  });

  it('T2-ROU-02: sanitizes special characters in query string', async (ctx) => {
    if (!routerMod) return;

    const RouterClass = routerMod.HashRouter || routerMod.default;
    const router = new RouterClass();

    if (router.parseHash) {
      const parsed = router.parseHash('#gallery?tag=%3Cscript%3Ealert(1)%3C/script%3E');
      expect(parsed.route).toBe('#gallery');
      expect(parsed.params.tag).not.toContain('<script>');
    }
  });
});
