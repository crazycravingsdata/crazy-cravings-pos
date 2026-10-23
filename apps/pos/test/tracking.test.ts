import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cents } from '@crazy-cravings/domain';
import { PosDatabase } from '../src/db/schema';
import { closeShift, openShift } from '../src/features/shift/shift';
import { startTracking, type GeoApi, type TrackingStatus } from '../src/features/tracking/tracker';
import { recordLocation, toLocationPoint } from '../src/features/tracking/tracking';

let db: PosDatabase;
let counter = 0;
const T0 = 1_700_000_000_000;

beforeEach(async () => {
  counter += 1;
  db = new PosDatabase(`tracking-db-${counter}`);
  await db.open();
});

afterEach(() => {
  vi.useRealTimers();
});

const shiftStub = { id: 's1', driverId: 'd1' };

describe('toLocationPoint', () => {
  it('arredonda e guarda só os campos com número válido', () => {
    const p = toLocationPoint(shiftStub, {
      latitude: 43.25550123456,
      longitude: -79.87110987654,
      accuracy: 12.6,
      speed: null,
      heading: Number.NaN,
      timestamp: T0 + 0.4,
    });
    expect(p).toEqual({
      shiftId: 's1',
      driverId: 'd1',
      lat: 43.255501,
      lng: -79.87111,
      accuracy: 13,
      recordedAt: T0,
    });
    expect(p).not.toHaveProperty('speed');
    expect(p).not.toHaveProperty('heading');
  });

  it('guarda velocidade e direção quando o aparelho informa', () => {
    const p = toLocationPoint(
      { id: 's1' },
      { latitude: 1, longitude: 2, speed: 8.349, heading: 181.6, timestamp: T0 },
    );
    expect(p).toMatchObject({ speed: 8.3, heading: 182 });
    expect(p).not.toHaveProperty('driverId');
  });

  it('recusa coordenadas inválidas', () => {
    const base = { latitude: 0, longitude: 0, timestamp: T0 };
    expect(toLocationPoint(shiftStub, { ...base, latitude: 91 })).toBeUndefined();
    expect(toLocationPoint(shiftStub, { ...base, longitude: -181 })).toBeUndefined();
    expect(toLocationPoint(shiftStub, { ...base, latitude: Number.NaN })).toBeUndefined();
    expect(toLocationPoint(shiftStub, { ...base, timestamp: Number.NaN })).toBeUndefined();
  });
});

describe('recordLocation', () => {
  it('grava um evento location.recorded na fila, com a van do turno', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10000) }, T0);
    const saved = await recordLocation(
      db,
      shift.id,
      { latitude: 43.2557, longitude: -79.8711, accuracy: 8, timestamp: T0 + 1000 },
      T0 + 1500,
    );
    expect(saved).toBeDefined();

    const events = await db.outbox.filter((e) => e.type === 'location.recorded').toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      vanId: 'van-01',
      status: 'pending',
      payload: { shiftId: shift.id, lat: 43.2557, lng: -79.8711, accuracy: 8, recordedAt: T0 + 1000 },
    });
  });

  it('não grava depois de fechar o turno nem para turno que não existe', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10000) }, T0);
    await closeShift(db, { shiftId: shift.id, countedCash: cents(10000) }, T0 + 5000);

    const pos = { latitude: 1, longitude: 2, timestamp: T0 + 6000 };
    expect(await recordLocation(db, shift.id, pos, T0 + 6000)).toBeUndefined();
    expect(await recordLocation(db, 'nao-existe', pos, T0 + 6000)).toBeUndefined();
    expect(await db.outbox.filter((e) => e.type === 'location.recorded').count()).toBe(0);
  });

  it('não grava posição inválida', async () => {
    const shift = await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10000) }, T0);
    const saved = await recordLocation(db, shift.id, { latitude: 200, longitude: 0, timestamp: T0 }, T0);
    expect(saved).toBeUndefined();
    expect(await db.outbox.filter((e) => e.type === 'location.recorded').count()).toBe(0);
  });
});

/** GPS falso: o teste decide quando chega uma posição ou um erro. */
function fakeGeo() {
  let onOk: Parameters<GeoApi['watchPosition']>[0] | undefined;
  let onErr: Parameters<GeoApi['watchPosition']>[1];
  const cleared: number[] = [];
  const geo: GeoApi = {
    watchPosition(ok, err) {
      onOk = ok;
      onErr = err;
      return 7;
    },
    clearWatch(id) {
      cleared.push(id);
    },
  };
  return {
    geo,
    cleared,
    fix(timestamp: number, lat = 43.25, lng = -79.87) {
      onOk?.({
        coords: { latitude: lat, longitude: lng, accuracy: 10, speed: null, heading: null },
        timestamp,
      });
    },
    fail(code: number) {
      onErr?.({ code });
    },
  };
}

describe('startTracking', () => {
  async function setup() {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const shift = await openShift(db, { vanId: 'van-01', operator: 'Ana', openingFloat: cents(10000) }, T0);
    const statuses: TrackingStatus[] = [];
    let clock = T0;
    const g = fakeGeo();
    const stop = startTracking({
      db,
      shiftId: shift.id,
      geo: g.geo,
      onStatus: (s) => statuses.push(s),
      now: () => clock,
    });
    const count = () => db.outbox.filter((e) => e.type === 'location.recorded').count();
    const advance = async (ms: number) => {
      clock += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    return { g, stop, statuses, count, advance, now: () => clock };
  }

  it('grava a primeira posição na hora e depois uma a cada 30 s', async () => {
    const { g, stop, statuses, count, advance, now } = await setup();
    expect(statuses).toEqual(['starting']);

    g.fix(now());
    await vi.waitFor(async () => expect(await count()).toBe(1));
    expect(statuses.at(-1)).toBe('tracking');

    await advance(30_000);
    g.fix(now());
    await advance(30_000);
    await vi.waitFor(async () => expect(await count()).toBe(2));
    stop();
  });

  it('não repete a mesma medição', async () => {
    const { g, stop, count, advance, now } = await setup();
    g.fix(now());
    await vi.waitFor(async () => expect(await count()).toBe(1));

    await advance(30_000); // nenhuma posição nova chegou
    await advance(30_000);
    expect(await count()).toBe(1);
    stop();
  });

  it('não inventa ponto quando a posição está velha (tela apagada): marca waiting', async () => {
    const { g, stop, statuses, count, advance, now } = await setup();
    g.fix(now());
    await vi.waitFor(async () => expect(await count()).toBe(1));

    await advance(90_000); // GPS parou: a última posição já tem 90 s
    expect(await count()).toBe(1);
    expect(statuses.at(-1)).toBe('waiting');

    g.fix(now()); // voltou
    await advance(30_000);
    await vi.waitFor(async () => expect(await count()).toBe(2));
    expect(statuses.at(-1)).toBe('tracking');
    stop();
  });

  it('permissão negada: marca denied e não grava nada', async () => {
    const { g, stop, statuses, count, advance } = await setup();
    g.fail(1);
    expect(statuses.at(-1)).toBe('denied');
    await advance(60_000);
    expect(await count()).toBe(0);
    stop();
  });

  it('outro erro do GPS (sinal, tempo esgotado): marca waiting', async () => {
    const { g, stop, statuses } = await setup();
    g.fail(2);
    expect(statuses.at(-1)).toBe('waiting');
    stop();
  });

  it('sem GPS no aparelho: marca unsupported', () => {
    const statuses: TrackingStatus[] = [];
    const stop = startTracking({ db, shiftId: 'x', geo: undefined, onStatus: (s) => statuses.push(s) });
    expect(statuses).toEqual(['unsupported']);
    stop();
  });

  it('ao parar, solta o GPS e não grava mais', async () => {
    const { g, stop, count, advance, now } = await setup();
    g.fix(now());
    await vi.waitFor(async () => expect(await count()).toBe(1));

    stop();
    expect(g.cleared).toEqual([7]);

    g.fix(now() + 1);
    await advance(60_000);
    expect(await count()).toBe(1);
  });
});
