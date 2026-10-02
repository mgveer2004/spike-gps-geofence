/**
 * Plain-Node checks for the pure geofence logic (no phone needed).
 * Run with:  npm run check:logic
 */
import { haversineMeters } from '../src/geofence/haversine';
import {
  createInitialState,
  passesAccuracyFilter,
  reduceFix,
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

console.log(`\nAll ${passed} checks passed.`);
