import { backupMetrics, evaluateLoad, opsCount, parallel, systemAvailability } from './calc';
import { ecommerce } from './cases/ecommerce';
import { defaultDesign } from './project';

describe('計算式', () => {
  it('計算量', () => {
    expect(opsCount('1', 1000)).toBe(1);
    expect(opsCount('n', 1000)).toBe(1000);
    expect(opsCount('n2', 100)).toBe(10000);
    expect(opsCount('logn', 1024)).toBeCloseTo(11);
  });

  it('並列の稼働率 1-(1-a)^n', () => {
    expect(parallel(0.99, 2)).toBeCloseTo(0.9999);
  });

  it('冗長化すると稼働率が上がる', () => {
    const d = defaultDesign(ecommerce);
    const single = systemAvailability(d.infra);
    const dual = systemAvailability({ ...d.infra, webCount: 2, lb: true, dbReplica: true });
    expect(dual).toBeGreaterThan(single);
  });

  it('利用率が上がると応答時間が伸びる（待ち行列）', () => {
    const d = defaultDesign(ecommerce);
    d.infra.network = '10G';
    const data = { products: 20000, ordersPerDay: 3000 };
    const low = evaluateLoad(ecommerce, d, data, 2, 1);
    const high = evaluateLoad(ecommerce, d, data, 12, 1);
    expect(high.rho).toBeGreaterThan(low.rho);
    expect(high.response).toBeGreaterThan(low.response);
  });

  it('インデックスにすると処理能力が上がる', () => {
    const d = defaultDesign(ecommerce);
    const data = { products: 20000, ordersPerDay: 3000 };
    const linear = evaluateLoad(ecommerce, d, data, 10, 1);
    d.processes.search = 'search-index';
    const index = evaluateLoad(ecommerce, d, data, 10, 1);
    expect(index.capacity).toBeGreaterThan(linear.capacity * 2);
  });

  it('増分バックアップは容量が小さく、復元に時間がかかる', () => {
    const full = backupMetrics({ type: 'full', interval: 'daily', generations: 7, offsite: false }, 300);
    const incr = backupMetrics({ type: 'incr', interval: 'daily', generations: 7, offsite: false }, 300);
    expect(incr.storageGB).toBeLessThan(full.storageGB);
    expect(incr.rtoHours).toBeGreaterThan(full.rtoHours);
    expect(full.rpoHours).toBe(24);
  });

  it('フルバックアップを毎時は間に合わない', () => {
    const b = backupMetrics({ type: 'full', interval: 'hourly', generations: 24, offsite: false }, 300);
    expect(b.feasible).toBe(false);
  });
});
