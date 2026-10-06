/**
 * Plain-Node checks for the pure geofence logic (no phone needed).
 * Run with:  npm run check:logic
 */
import { DORMANT_SILENCE_MS } from '../src/geofence/config';
import { haversineMeters } from '../src/geofence/haversine';
import {
  createInitialState,
  passesAccuracyFilter,
  reduceFix,
  reduceTick,
  summarizeVote,
} from '../src/geofence/state-machine';
import type { GeofenceTarget, MachineState } from '../src/geofence/state-machine';
import type { GpsFix } from '../src/types/geofence';

// Tiny assertion helpers (keeps this script free of Node-specific type packages).
const assert = {
  ok(value: unknown, message?: string) {
    if (!value) throw new Error(message ?? 'Expected value to be truthy');
  },
  equal<T>(actual: T, expected: T, message?: string) {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
  },
};

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    throw e;
  }
}

// ---------- Haversine ----------
console.log('Haversine');

check('same point is 0 m', () => {
  assert.equal(haversineMeters(12.9716, 77.5946, 12.9716, 77.5946), 0);
});

check('London to Paris is about 343.5 km', () => {
  const d = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
  assert.ok(Math.abs(d - 343_500) < 2_000, `got ${d}`);
});

check('1 degree of latitude is about 111.19 km', () => {
  const d = haversineMeters(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111_195) < 50, `got ${d}`);
});

check('0.00045 degrees latitude is about 50 m', () => {
  const d = haversineMeters(12.9716, 77.5946, 12.9716 + 0.00045, 77.5946);
  assert.ok(Math.abs(d - 50.03) < 0.5, `got ${d}`);
});

check('is symmetric', () => {
  const a = haversineMeters(10, 20, 11, 21);
  const b = haversineMeters(11, 21, 10, 20);
  assert.ok(Math.abs(a - b) < 1e-6);
});

// ---------- Helpers for state machine checks ----------
const TARGET: GeofenceTarget = { latitude: 12.9716, longitude: 77.5946, radiusM: 50 };
const METERS_PER_DEG_LAT = 111_195;

/** Fix located `meters` due north of the target. */
function fixAt(meters: number, accuracy: number | null = 5, t = 0): GpsFix {
  return {
    latitude: TARGET.latitude + meters / METERS_PER_DEG_LAT,
    longitude: TARGET.longitude,
    accuracy,
    timestamp: t,
  };
}

function feed(state: MachineState, fixes: GpsFix[]): MachineState {
  return fixes.reduce((s, f) => reduceFix(s, f, TARGET), state);
}

// ---------- Entry (Rule 1) ----------
console.log('Entry: PLANNED -> ARRIVED');

check('default state is PLANNED', () => {
  assert.equal(createInitialState().status, 'PLANNED');
});

check('stays PLANNED while outside the radius', () => {
  const s = feed(createInitialState(), [fixAt(200), fixAt(120), fixAt(60)]);
  assert.equal(s.status, 'PLANNED');
  assert.ok(s.distanceM !== null && Math.abs(s.distanceM - 60) < 1);
});

check('just outside the radius (50.5 m) does NOT enter', () => {
  const s = feed(createInitialState(), [fixAt(50.5)]);
  assert.equal(s.status, 'PLANNED');
});

check('first fix below the radius enters immediately', () => {
  const s = feed(createInitialState(), [fixAt(200), fixAt(49)]);
  assert.equal(s.status, 'ARRIVED');
});

check('a fix with invalid coordinates is ignored', () => {
  const bad: GpsFix = { latitude: Number.NaN, longitude: 0, accuracy: 5, timestamp: 0 };
  const s = reduceFix(createInitialState(), bad, TARGET);
  assert.equal(s.fixCount, 0);
  assert.equal(s.status, 'PLANNED');
});

// ---------- Exit protocol (Rule 2) ----------
console.log('Exit: ARRIVED -> AWAITING_FORM');

/** A state that has just ARRIVED (entry fix inside the radius). */
const arrived = () => feed(createInitialState(), [fixAt(10)]);
const IN = () => fixAt(20, 5); // clearly inside, good accuracy
const OUT = () => fixAt(90, 5); // clearly outside, good accuracy
const OUT_BAD = () => fixAt(90, 35); // outside but terrible accuracy
const times = (n: number, make: () => GpsFix) => Array.from({ length: n }, make);

check('entry fix puts us in ARRIVED with an empty window', () => {
  const s = arrived();
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.window.length, 0);
});

check('accuracy filter: 20 m accepted, 20.1 m / unknown discarded', () => {
  assert.equal(passesAccuracyFilter(fixAt(0, 20)), true);
  assert.equal(passesAccuracyFilter(fixAt(0, 20.1)), false);
  assert.equal(passesAccuracyFilter(fixAt(0, null)), false);
});

check('inaccurate fixes never enter the window and never cause an exit', () => {
  const s = feed(arrived(), times(15, OUT_BAD));
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.window.length, 0);
  assert.equal(s.recent.length, 10); // debug log still shows them, capped at 10
  assert.ok(s.recent.every((e) => !e.accepted));
});

check('does not exit before the minimum number of valid fixes (4 outside is not enough)', () => {
  const s = feed(arrived(), times(4, OUT));
  assert.equal(s.status, 'ARRIVED');
});

check('exits on the 5th valid outside fix', () => {
  const s = feed(arrived(), times(5, OUT));
  assert.equal(s.status, 'AWAITING_FORM');
});

check('majority is enough, unanimity is not required (in,in,out,out,out)', () => {
  const s = feed(arrived(), [IN(), IN(), OUT(), OUT(), OUT()]);
  assert.equal(s.status, 'AWAITING_FORM');
});

check('minority outside does NOT exit (in,in,in,out,out)', () => {
  const s = feed(arrived(), [IN(), IN(), IN(), OUT(), OUT()]);
  assert.equal(s.status, 'ARRIVED');
});

check('exactly half outside does NOT exit (needs strictly more than half)', () => {
  const vote = summarizeVote(feed(arrived(), [IN(), IN(), OUT(), OUT()]).window);
  assert.equal(vote.exitConfirmed, false);
  const six = summarizeVote(feed(arrived(), [IN(), IN(), IN(), OUT(), OUT(), OUT()]).window);
  assert.equal(six.validCount, 6);
  assert.equal(six.outsideCount, 3);
  assert.equal(six.exitConfirmed, false);
});

check('implicit reset: drift outside then back inside stays ARRIVED', () => {
  const s = feed(arrived(), [OUT(), OUT(), IN(), IN(), IN(), IN(), IN()]);
  assert.equal(s.status, 'ARRIVED');
});

check('bad-accuracy outside fixes cannot outvote good inside fixes', () => {
  const s = feed(arrived(), [...times(5, IN), ...times(20, OUT_BAD)]);
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.window.length, 5);
});

check('window is capped at 7 and rolls (old inside fixes drop out)', () => {
  const s = feed(arrived(), [...times(7, IN), ...times(3, OUT)]);
  assert.equal(s.status, 'ARRIVED'); // window: in,in,in,in,out,out,out = 3/7
  assert.equal(s.window.length, 7);
  const s2 = feed(s, [OUT()]); // window: in,in,in,out,out,out,out = 4/7
  assert.equal(s2.status, 'AWAITING_FORM');
});

check('a fix exactly at the radius counts as inside (must be MORE than radius away)', () => {
  const s = feed(arrived(), times(5, () => fixAt(49.99, 5)));
  assert.equal(s.status, 'ARRIVED');
});

check('AWAITING_FORM is terminal: coming back inside does not revert', () => {
  const exited = feed(arrived(), times(5, OUT));
  const after = feed(exited, times(10, IN));
  assert.equal(after.status, 'AWAITING_FORM');
});

check('exit never fires from PLANNED (never arrived)', () => {
  const s = feed(createInitialState(), times(20, OUT));
  assert.equal(s.status, 'PLANNED');
});

// ---------- Arrival accuracy (PLANNED -> ARRIVED needs an accurate fix) ----------
console.log('Arrival accuracy');

check('inaccurate fix inside the radius stays PLANNED (100 m, 20.1 m, unknown accuracy)', () => {
  for (const accuracy of [100, 20.1, null]) {
    const s = feed(createInitialState(), [fixAt(10, accuracy, 1_000)]);
    assert.equal(s.status, 'PLANNED', `accuracy ${accuracy}`);
    assert.equal(s.lastAcceptedFixTimestamp, null);
  }
});

check('inaccurate fixes still update lastFix / distance while PLANNED', () => {
  const s = feed(createInitialState(), [fixAt(10, 100, 1_000)]);
  assert.equal(s.fixCount, 1);
  assert.ok(s.lastFix !== null && s.lastFix.timestamp === 1_000);
  assert.ok(s.distanceM !== null && Math.abs(s.distanceM - 10) < 1);
});

check('a later accurate inside fix arrives and records lastAcceptedFixTimestamp', () => {
  const s = feed(createInitialState(), [fixAt(10, 100, 1_000), fixAt(10, 5, 2_000)]);
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.lastAcceptedFixTimestamp, 2_000);
  assert.equal(s.dormantSince, null);
});

check('accuracy of exactly 20 m is good enough to arrive', () => {
  assert.equal(feed(createInitialState(), [fixAt(10, 20, 1_000)]).status, 'ARRIVED');
});

// ---------- DORMANT lifecycle ----------
console.log('DORMANT: silence detection, no flicker, wake-up');

const ARRIVED_AT = 1_000;
/** ARRIVED with its entry fix (accurate) at ARRIVED_AT. */
const arrivedAtT0 = () => feed(createInitialState(), [fixAt(10, 5, ARRIVED_AT)]);
const SILENCE_END = ARRIVED_AT + DORMANT_SILENCE_MS;
/** Weak cell-tower style ping (inaccurate), inside or outside. */
const WEAK_IN = (t: number) => fixAt(20, 100, t);
const WEAK_OUT = (t: number) => fixAt(90, 100, t);

check('entry records lastAcceptedFixTimestamp and no dormantSince', () => {
  const s = arrivedAtT0();
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.lastAcceptedFixTimestamp, ARRIVED_AT);
  assert.equal(s.dormantSince, null);
});

check('tick before the silence threshold keeps ARRIVED and returns the same object', () => {
  const s = arrivedAtT0();
  assert.ok(reduceTick(s, SILENCE_END - 1) === s);
  assert.ok(reduceTick(s, ARRIVED_AT) === s);
});

check('tick at the silence threshold: ARRIVED -> DORMANT, with dormantSince = now', () => {
  const s = reduceTick(arrivedAtT0(), SILENCE_END);
  assert.equal(s.status, 'DORMANT');
  assert.equal(s.dormantSince, SILENCE_END);
});

check('DORMANT keeps the window, lastFix and distance (nothing is erased)', () => {
  const before = feed(arrivedAtT0(), [fixAt(20, 5, 2_000), fixAt(90, 5, 3_000)]);
  const s = reduceTick(before, 3_000 + DORMANT_SILENCE_MS);
  assert.equal(s.status, 'DORMANT');
  assert.equal(s.window.length, 2);
  assert.ok(s.lastFix === before.lastFix);
  assert.equal(s.distanceM, before.distanceM);
});

check('silence counts from the last ACCEPTED fix, not from the last fix received', () => {
  // Weak pings keep arriving every 5 s, right up to the moment of the tick.
  const pings = [5, 10, 15, 20, 25, 30].map((sec) => WEAK_IN(ARRIVED_AT + sec * 1_000));
  const s = feed(arrivedAtT0(), pings);
  assert.equal(s.lastAcceptedFixTimestamp, ARRIVED_AT);
  assert.equal(s.lastFix?.timestamp, ARRIVED_AT + 30_000);
  assert.equal(reduceTick(s, SILENCE_END).status, 'DORMANT');
});

check('accurate fixes keep resetting the silence clock', () => {
  const s = feed(arrivedAtT0(), [fixAt(20, 5, 20_000)]);
  assert.equal(s.lastAcceptedFixTimestamp, 20_000);
  assert.equal(reduceTick(s, SILENCE_END).status, 'ARRIVED'); // only 11 s since 20_000
  assert.equal(reduceTick(s, 20_000 + DORMANT_SILENCE_MS).status, 'DORMANT');
});

check('ticks never change PLANNED or AWAITING_FORM', () => {
  const planned = createInitialState();
  assert.ok(reduceTick(planned, 10 * DORMANT_SILENCE_MS) === planned);
  const exited = feed(arrivedAtT0(), times(5, OUT));
  assert.equal(exited.status, 'AWAITING_FORM');
  assert.ok(reduceTick(exited, 10 * DORMANT_SILENCE_MS) === exited);
});

check('repeated ticks while DORMANT change nothing (same object, dormantSince kept)', () => {
  const dormant = reduceTick(arrivedAtT0(), SILENCE_END);
  assert.ok(reduceTick(dormant, SILENCE_END + 60_000) === dormant);
  assert.equal(dormant.dormantSince, SILENCE_END);
});

check('inaccurate fixes while DORMANT do not wake it, and the status never flickers', () => {
  let s = reduceTick(arrivedAtT0(), SILENCE_END);
  const windowBefore = s.window;
  for (let i = 1; i <= 12; i += 1) {
    const t = SILENCE_END + i * 5_000;
    s = reduceFix(s, i % 2 === 0 ? WEAK_IN(t) : WEAK_OUT(t), TARGET);
    assert.equal(s.status, 'DORMANT', `after weak ping ${i}`);
    s = reduceTick(s, t);
    assert.equal(s.status, 'DORMANT', `after tick ${i}`);
  }
  assert.equal(s.dormantSince, SILENCE_END);
  assert.equal(s.lastAcceptedFixTimestamp, ARRIVED_AT);
  assert.equal(s.window, windowBefore); // discarded fixes never touch the vote window
  assert.equal(s.fixCount, 13); // ...but they are still counted and shown (live distance, debug log)
});

check('weak outside pings (even 20 of them) can never exit from DORMANT', () => {
  const dormant = reduceTick(arrivedAtT0(), SILENCE_END);
  const s = feed(dormant, Array.from({ length: 20 }, (_, i) => WEAK_OUT(SILENCE_END + 1_000 * (i + 1))));
  assert.equal(s.status, 'DORMANT');
  assert.equal(s.exitTimestamp, null);
});

check('accurate inside fix while DORMANT wakes it back to ARRIVED', () => {
  const dormant = reduceTick(arrivedAtT0(), SILENCE_END);
  const t = SILENCE_END + 2_000;
  const s = reduceFix(dormant, fixAt(20, 5, t), TARGET);
  assert.equal(s.status, 'ARRIVED');
  assert.equal(s.dormantSince, null);
  assert.equal(s.lastAcceptedFixTimestamp, t);
  assert.equal(s.exitTimestamp, null);
  assert.equal(s.window.length, 1);
});

check('accurate outside fix while DORMANT that does not confirm the exit wakes it to ARRIVED', () => {
  const dormant = reduceTick(arrivedAtT0(), SILENCE_END);
  const s = reduceFix(dormant, fixAt(90, 5, SILENCE_END + 2_000), TARGET);
  assert.equal(s.status, 'ARRIVED'); // only 1 valid fix: below EXIT_MIN_VALID_FIXES
  assert.equal(s.dormantSince, null);
});

check('accurate outside fix while DORMANT that confirms the majority goes to AWAITING_FORM', () => {
  // 4 accurate outside fixes (not yet enough), then silence, then the 5th arrives after the gap.
  const before = feed(arrivedAtT0(), [2_000, 3_000, 4_000, 5_000].map((t) => fixAt(90, 5, t)));
  assert.equal(before.status, 'ARRIVED');
  const dormant = reduceTick(before, 5_000 + DORMANT_SILENCE_MS);
  assert.equal(dormant.status, 'DORMANT');
  const wakeTime = 5_000 + DORMANT_SILENCE_MS + 3_000;
  const s = reduceFix(dormant, fixAt(90, 5, wakeTime), TARGET);
  assert.equal(s.status, 'AWAITING_FORM');
  assert.equal(s.exitTimestamp, wakeTime);
  assert.equal(s.dormantSince, null);
});

check('after waking, the machine can go DORMANT again on a second silence', () => {
  const dormant = reduceTick(arrivedAtT0(), SILENCE_END);
  const woke = reduceFix(dormant, fixAt(20, 5, SILENCE_END + 1_000), TARGET);
  assert.equal(woke.status, 'ARRIVED');
  const again = reduceTick(woke, SILENCE_END + 1_000 + DORMANT_SILENCE_MS);
  assert.equal(again.status, 'DORMANT');
  assert.equal(again.dormantSince, SILENCE_END + 1_000 + DORMANT_SILENCE_MS);
});

console.log(`\nAll ${passed} checks passed.`);
