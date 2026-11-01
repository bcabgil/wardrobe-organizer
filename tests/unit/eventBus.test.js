/**
 * Unit Test Suite: Reactive EventBus (Milestone 1)
 * Target: src/utils/eventBus.js
 * 
 * Verifies:
 * - EventBus subscription (on), once-subscription (once), unsubscription (off, returned unbind)
 * - Error containment: synchronous errors and asynchronous rejections in subscribers
 * - EVENTS catalog constants and frozen immutability
 * - Subscriber count metrics and clear()
 */

import { describe, it, expect, beforeEach } from '../test-framework.js';
import { EventBus, eventBus, EVENTS } from '../../src/utils/eventBus.js';

describe('EventBus: Reactive Pub-Sub & Error Containment', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('T1-EB-01: subscribes to an event and receives payload', () => {
    let received = null;
    bus.on('test:event', (data) => {
      received = data;
    });

    const count = bus.emit('test:event', { message: 'hello world', id: 42 });
    expect(count).toBe(1);
    expect(received).toBeDefined();
    expect(received.message).toBe('hello world');
    expect(received.id).toBe(42);
  });

  it('T1-EB-02: returns an unbind function that detaches listener', () => {
    let callCount = 0;
    const unsubscribe = bus.on('test:unbind', () => {
      callCount++;
    });

    bus.emit('test:unbind');
    expect(callCount).toBe(1);

    unsubscribe();
    bus.emit('test:unbind');
    expect(callCount).toBe(1);
    expect(bus.listenerCount('test:unbind')).toBe(0);
  });

  it('T1-EB-03: unbinds with off(event, callback) and off(event) removing all', () => {
    let countA = 0;
    let countB = 0;
    const cbA = () => { countA++; };
    const cbB = () => { countB++; };

    bus.on('multi:event', cbA);
    bus.on('multi:event', cbB);
    expect(bus.listenerCount('multi:event')).toBe(2);

    bus.off('multi:event', cbA);
    expect(bus.listenerCount('multi:event')).toBe(1);

    bus.emit('multi:event');
    expect(countA).toBe(0);
    expect(countB).toBe(1);

    // Remove all for event
    bus.off('multi:event');
    expect(bus.listenerCount('multi:event')).toBe(0);
  });

  it('T1-EB-04: once() fires callback exactly once and detaches', () => {
    let onceCount = 0;
    let receivedPayload = null;

    bus.once('one:time', (data) => {
      onceCount++;
      receivedPayload = data;
    });

    bus.emit('one:time', { first: true });
    expect(onceCount).toBe(1);
    expect(receivedPayload.first).toBe(true);

    bus.emit('one:time', { second: true });
    expect(onceCount).toBe(1);
    expect(bus.listenerCount('one:time')).toBe(0);
  });

  it('T1-EB-05: error containment - throwing subscriber does not break other subscribers', () => {
    let secondSubscriberCalled = false;
    let thirdSubscriberCalled = false;

    bus.on('failing:event', () => {
      throw new Error('Subscriber intentional explosion');
    });

    bus.on('failing:event', () => {
      secondSubscriberCalled = true;
    });

    bus.on('failing:event', () => {
      thirdSubscriberCalled = true;
    });

    // emit must not throw
    let emitThrew = false;
    let notified = 0;
    try {
      notified = bus.emit('failing:event', { safe: true });
    } catch (e) {
      emitThrew = true;
    }

    expect(emitThrew).toBe(false);
    expect(notified).toBe(3);
    expect(secondSubscriberCalled).toBe(true);
    expect(thirdSubscriberCalled).toBe(true);
  });

  it('T1-EB-06: async error containment - rejected Promise in subscriber is caught cleanly', async () => {
    let secondCalled = false;

    bus.on('async:event', async () => {
      throw new Error('Async explosion');
    });

    bus.on('async:event', () => {
      secondCalled = true;
    });

    const count = bus.emit('async:event');
    expect(count).toBe(2);
    expect(secondCalled).toBe(true);
  });

  it('T1-EB-07: verifies standard EVENTS catalog constants and frozen immutability', () => {
    expect(EVENTS).toBeDefined();
    expect(Object.isFrozen(EVENTS)).toBe(true);

    expect(EVENTS.GARMENT_CREATED).toBe('garment:created');
    expect(EVENTS.GARMENT_UPDATED).toBe('garment:updated');
    expect(EVENTS.GARMENT_DELETED).toBe('garment:deleted');
    expect(EVENTS.LAUNDRY_UPDATED).toBe('laundry:updated');
    expect(EVENTS.SEASON_CHANGED).toBe('season:changed');
    expect(EVENTS.BACKUP_STATUS_CHANGED).toBe('backup:status_changed');
    expect(EVENTS.TOAST_SHOW).toBe('toast:show');
  });

  it('T1-EB-08: clear() wipes single event or all events', () => {
    bus.on('evt1', () => {});
    bus.on('evt1', () => {});
    bus.on('evt2', () => {});

    expect(bus.listenerCount('evt1')).toBe(2);
    expect(bus.listenerCount('evt2')).toBe(1);

    bus.clear('evt1');
    expect(bus.listenerCount('evt1')).toBe(0);
    expect(bus.listenerCount('evt2')).toBe(1);

    bus.clear();
    expect(bus.listenerCount('evt2')).toBe(0);
  });
});
