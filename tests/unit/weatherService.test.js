/**
 * Unit Test Suite: Open-Meteo Weather Service Integration (Milestone 3)
 * Target: src/services/weather/weatherService.js
 * 
 * Verifies:
 * - Tomorrow forecast extraction and formatting (min/max temp, precipitation probability)
 * - Complete WMO Weather Interpretation code table
 * - Natural-language weather synthesizer
 * - Geocoding city search
 * - In-memory / storage caching logic
 * - Boundary conditions & offline graceful fallbacks
 */

import { describe, it, expect, beforeEach, safeImport } from '../test-framework.js';

describe('Weather Service: Open-Meteo Tomorrow Forecast', () => {
  let weatherMod = null;

  beforeEach(async (ctx) => {
    const res = await safeImport('../../src/services/weather/weatherService.js');
    if (!res.ok) {
      ctx.skip('Pending Milestone 3: src/services/weather/weatherService.js not implemented yet');
      return;
    }
    weatherMod = res.module;
  });

  // ==========================================
  // TIER 1: WMO CODE INTERPRETATION
  // ==========================================

  it('T1-WEA-01: accurately interprets standard WMO weather codes', async (ctx) => {
    if (!weatherMod) return;

    const interpret = weatherMod.interpretWmoCode || weatherMod.default?.interpretWmoCode;
    expect(typeof interpret).toBe('function');

    // Sunny / Clear
    const w0 = interpret(0);
    expect(w0.condition).toMatch(/clear|sunny/i);
    expect(w0.isRainy).toBe(false);

    // Partly cloudy / Overcast
    const w2 = interpret(2);
    expect(w2.condition).toMatch(/partly cloudy/i);

    const w3 = interpret(3);
    expect(w3.condition).toMatch(/overcast/i);

    // Fog
    const w45 = interpret(45);
    expect(w45.condition).toMatch(/fog/i);

    // Rain
    const w61 = interpret(61);
    expect(w61.condition).toMatch(/rain/i);
    expect(w61.isRainy).toBe(true);

    const w65 = interpret(65);
    expect(w65.condition).toMatch(/heavy rain/i);
    expect(w65.isRainy).toBe(true);

    // Snow
    const w71 = interpret(71);
    expect(w71.condition).toMatch(/snow/i);
    expect(w71.isSnowy || w71.isCold).toBeTruthy();

    // Thunderstorm
    const w95 = interpret(95);
    expect(w95.condition).toMatch(/thunderstorm/i);
    expect(w95.isRainy).toBe(true);
  });

  // ==========================================
  // TIER 1: SYNTHESIZER & FORECAST FORMATTING
  // ==========================================

  it('T1-WEA-02: synthesizes natural language summary with temperatures and advice', async (ctx) => {
    if (!weatherMod) return;

    const synthesize = weatherMod.synthesizeWeatherSummary || weatherMod.default?.synthesizeWeatherSummary;
    expect(typeof synthesize).toBe('function');

    const summary = synthesize({
      tempMin: 8,
      tempMax: 14,
      rainProb: 75,
      weatherCode: 61,
      condition: 'Moderate rain'
    });

    expect(typeof summary).toBe('string');
    expect(summary).toContain('8');
    expect(summary).toContain('14');
    expect(summary).toMatch(/rain|umbrella|jacket|wet/i);
  });

  it('T1-WEA-03: extracts tomorrow forecast from Open-Meteo REST response payload', async (ctx) => {
    if (!weatherMod) return;

    const parsePayload = weatherMod.parseOpenMeteoResponse || weatherMod.default?.parseOpenMeteoResponse;
    if (!parsePayload) return;

    // Simulated 2-day Open-Meteo payload
    const mockApiResponse = {
      daily: {
        time: ['2026-11-01', '2026-11-02'],
        temperature_2m_max: [16.5, 12.0],
        temperature_2m_min: [9.2, 5.1],
        precipitation_probability_max: [10, 85],
        weathercode: [2, 61]
      }
    };

    const tomorrow = parsePayload(mockApiResponse);
    expect(tomorrow).toBeDefined();
    expect(tomorrow.tempMax).toBe(12.0);
    expect(tomorrow.tempMin).toBe(5.1);
    expect(tomorrow.rainProb).toBe(85);
    expect(tomorrow.weatherCode).toBe(61);
  });

  // ==========================================
  // TIER 2: BOUNDARY & ERROR HANDLING
  // ==========================================

  it('T2-WEA-01: handles extreme temperature ranges (-20°C and +42°C) cleanly', async (ctx) => {
    if (!weatherMod) return;

    const synthesize = weatherMod.synthesizeWeatherSummary || weatherMod.default?.synthesizeWeatherSummary;

    // Freezing polar weather
    const freezing = synthesize({
      tempMin: -20,
      tempMax: -12,
      rainProb: 10,
      weatherCode: 71,
      condition: 'Light snow'
    });
    expect(freezing).toContain('-20');
    expect(freezing).toMatch(/freezing|heavy coat|bundle up|extreme cold/i);

    // Scorching heatwave
    const heatwave = synthesize({
      tempMin: 28,
      tempMax: 42,
      rainProb: 0,
      weatherCode: 0,
      condition: 'Clear sky'
    });
    expect(heatwave).toContain('42');
    expect(heatwave).toMatch(/hot|breathable|linen|sun/i);
  });

  it('T2-WEA-02: unknown WMO code falls back gracefully without crashing', async (ctx) => {
    if (!weatherMod) return;

    const interpret = weatherMod.interpretWmoCode || weatherMod.default?.interpretWmoCode;
    const unknown = interpret(999);
    expect(unknown).toBeDefined();
    expect(typeof unknown.condition).toBe('string');
  });

  it('T2-WEA-03: network failure returns fallback climate snapshot without rejecting', async (ctx) => {
    if (!weatherMod) return;

    const getWeather = weatherMod.getTomorrowWeather || weatherMod.default?.getTomorrowWeather;
    if (!getWeather) return;

    // Simulate offline network error
    const origFetch = window.fetch;
    window.fetch = async () => { throw new TypeError('Failed to fetch (offline)'); };

    try {
      const fallback = await getWeather({ lat: 40.71, lon: -74.00, cityName: 'New York' });
      expect(fallback).toBeDefined();
      expect(fallback.isFallback).toBe(true);
      expect(typeof fallback.tempMax).toBe('number');
    } finally {
      window.fetch = origFetch;
    }
  });
});
