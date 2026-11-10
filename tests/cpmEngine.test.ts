import { describe, it, expect } from 'vitest';
import {
  calculateCpmSchedule,
  recomputeDelayCascade,
  getStandardMilestoneTemplates,
  topologicalSort,
  diffDays,
  addDaysToDate,
  CpmMilestoneInput
} from '../shared/cpmEngine.js';

describe('Critical Path Method (CPM) & Milestone Engine', () => {
  describe('1. CPM Calculation on a Known Milestone Graph', () => {
    // Known graph with a critical and non-critical parallel branch:
    // A (3d) -> B (4d) -> D (3d) [Path ABD: 3 + 4 + 3 = 10 days]
    // A (3d) -> C (2d) -> D (3d) [Path ACD: 3 + 2 + 3 = 8 days, Slack on C = 2 days]
    const testGraph: CpmMilestoneInput[] = [
      { id: 'node-A', name: 'Design CAD', sequence: 1, duration_days: 3, dependencies: [] },
      { id: 'node-B', name: 'Intricate Setting', sequence: 2, duration_days: 4, dependencies: ['node-A'] },
      { id: 'node-C', name: 'Simple Engraving', sequence: 3, duration_days: 2, dependencies: ['node-A'] },
      { id: 'node-D', name: 'Final Assembly', sequence: 4, duration_days: 3, dependencies: ['node-B', 'node-C'] }
    ];

    it('should correctly compute Forward Pass (ES & EF) and total duration', () => {
      const occasionDate = '2026-12-15';
      const result = calculateCpmSchedule(testGraph, occasionDate, 1);

      expect(result.totalDurationDays).toBe(10);

      const a = result.milestones.find((m) => m.id === 'node-A')!;
      const b = result.milestones.find((m) => m.id === 'node-B')!;
      const c = result.milestones.find((m) => m.id === 'node-C')!;
      const d = result.milestones.find((m) => m.id === 'node-D')!;

      // Node A
      expect(a.earliest_start).toBe(0);
      expect(a.earliest_finish).toBe(3);

      // Node B (Critical branch)
      expect(b.earliest_start).toBe(3);
      expect(b.earliest_finish).toBe(7);

      // Node C (Non-critical branch)
      expect(c.earliest_start).toBe(3);
      expect(c.earliest_finish).toBe(5);

      // Node D (Wait for max(EF_B, EF_C) = 7)
      expect(d.earliest_start).toBe(7);
      expect(d.earliest_finish).toBe(10);
    });

    it('should correctly compute Backward Pass (LS & LF) and Slack', () => {
      const occasionDate = '2026-12-15';
      const result = calculateCpmSchedule(testGraph, occasionDate, 1);

      const a = result.milestones.find((m) => m.id === 'node-A')!;
      const b = result.milestones.find((m) => m.id === 'node-B')!;
      const c = result.milestones.find((m) => m.id === 'node-C')!;
      const d = result.milestones.find((m) => m.id === 'node-D')!;

      // Node D (Terminal)
      expect(d.latest_finish).toBe(10);
      expect(d.latest_start).toBe(7);
      expect(d.slack).toBe(0);
      expect(d.is_critical).toBe(true);

      // Node B (Predecessor to D)
      expect(b.latest_finish).toBe(7);
      expect(b.latest_start).toBe(3);
      expect(b.slack).toBe(0);
      expect(b.is_critical).toBe(true);

      // Node C (Predecessor to D with float/slack)
      expect(c.latest_finish).toBe(7);
      expect(c.latest_start).toBe(5);
      expect(c.slack).toBe(2); // 5 - 3 = 2 days of slack!
      expect(c.is_critical).toBe(false);

      // Node A (Predecessor to B and C)
      expect(a.latest_finish).toBe(3);
      expect(a.latest_start).toBe(0);
      expect(a.slack).toBe(0);
      expect(a.is_critical).toBe(true);
    });

    it('should accurately identify Zero-Slack as the Critical Path [node-A, node-B, node-D]', () => {
      const occasionDate = '2026-12-15';
      const result = calculateCpmSchedule(testGraph, occasionDate, 1);

      expect(result.criticalPath).toEqual(['node-A', 'node-B', 'node-D']);
      expect(result.criticalPath).not.toContain('node-C');
    });

    it('should detect cycles and throw an error', () => {
      const cyclicGraph: CpmMilestoneInput[] = [
        { id: '1', name: 'Step 1', sequence: 1, duration_days: 2, dependencies: ['2'] },
        { id: '2', name: 'Step 2', sequence: 2, duration_days: 2, dependencies: ['1'] }
      ];
      expect(() => topologicalSort(cyclicGraph)).toThrow(/Cycle detected/);
    });
  });

  describe('2. Reverse-Scheduling from Occasion Date (Wedding Date Protection)', () => {
    it('should reverse-schedule milestones backward from delivery date before wedding date', () => {
      const occasionDate = '2026-12-15'; // Customer's Wedding Day
      const deliveryBuffer = 2; // Deliver 2 days before wedding (2026-12-13)

      const milestones: CpmMilestoneInput[] = [
        { id: 'm1', name: 'Design', sequence: 1, duration_days: 2, dependencies: [] },
        { id: 'm2', name: 'Casting', sequence: 2, duration_days: 3, dependencies: ['m1'] },
        { id: 'm3', name: 'Final Delivery', sequence: 3, duration_days: 1, dependencies: ['m2'] }
      ];
      // Total duration = 2 + 3 + 1 = 6 days

      const result = calculateCpmSchedule(milestones, occasionDate, deliveryBuffer);

      expect(result.totalDurationDays).toBe(6);
      expect(result.targetDeliveryDate).toBe('2026-12-13'); // 15 - 2 days

      const m3 = result.milestones.find((m) => m.id === 'm3')!;
      const m2 = result.milestones.find((m) => m.id === 'm2')!;
      const m1 = result.milestones.find((m) => m.id === 'm1')!;

      // m3 finishes on targetDeliveryDate (2026-12-13) and starts 1 day before (2026-12-12)
      expect(m3.planned_date).toBe('2026-12-13');
      expect(m3.planned_start_date).toBe('2026-12-12');

      // m2 finishes when m3 starts (2026-12-12) and takes 3 days (starts 2026-12-09)
      expect(m2.planned_date).toBe('2026-12-12');
      expect(m2.planned_start_date).toBe('2026-12-09');

      // m1 finishes when m2 starts (2026-12-09) and takes 2 days (starts 2026-12-07)
      expect(m1.planned_date).toBe('2026-12-09');
      expect(m1.planned_start_date).toBe('2026-12-07');
    });

    it('should scale standard milestone template durations by design complexity', () => {
      const simple = getStandardMilestoneTemplates('SIMPLE');
      const intricate = getStandardMilestoneTemplates('INTRICATE');

      const simpleTotal = simple.reduce((acc, m) => acc + m.duration_days, 0);
      const intricateTotal = intricate.reduce((acc, m) => acc + m.duration_days, 0);

      expect(simpleTotal).toBe(7); // 7 days total for simple items
      expect(intricateTotal).toBe(30); // 30 days total for intricate temple/kundan bridal wear
      expect(intricateTotal).toBeGreaterThan(simpleTotal);
    });
  });

  describe('3. Delay Cascade Recomputation & AT_RISK Alerting', () => {
    it('should shift downstream milestones when a critical milestone is delayed', () => {
      const occasionDate = '2026-12-20';
      const templates: CpmMilestoneInput[] = [
        { id: 'step-1', name: 'Design', sequence: 1, duration_days: 2, dependencies: [] },
        { id: 'step-2', name: 'Casting', sequence: 2, duration_days: 3, dependencies: ['step-1'] },
        { id: 'step-3', name: 'QC & Delivery', sequence: 3, duration_days: 1, dependencies: ['step-2'] }
      ];
      // Base schedule: 6 days total. Target delivery: 2026-12-19.

      const initialSchedule = calculateCpmSchedule(templates, occasionDate, 1);
      expect(initialSchedule.targetDeliveryDate).toBe('2026-12-19');

      // Introduce a 2-day delay on Step 2 (Casting delay: gold refiner shipment lagged)
      const cascade = recomputeDelayCascade(initialSchedule.milestones, 'step-2', 2, occasionDate);

      // Step 2 was pushed by 2 days
      const s2 = cascade.milestones.find((m) => m.id === 'step-2')!;
      expect(s2.status).toBe('DELAYED');

      // Step 3 (Delivery) must cascade forward by 2 days
      const s3 = cascade.milestones.find((m) => m.id === 'step-3')!;
      expect(cascade.projectedDeliveryDate).toBe('2026-12-21'); // 19 + 2 = 21

      // Projected delivery is 2026-12-21, which EXCEEDS occasionDate (2026-12-20)!
      expect(cascade.isAtRisk).toBe(true);
      expect(cascade.orderStatus).toBe('AT_RISK');
      expect(cascade.bufferDaysRemaining).toBe(-1); // 1 day past wedding date!
    });

    it('should NOT flag AT_RISK if delayed delivery still finishes on or before the occasion date', () => {
      const occasionDate = '2026-12-25'; // Generous 5-day buffer
      const templates: CpmMilestoneInput[] = [
        { id: 'step-1', name: 'Design', sequence: 1, duration_days: 2, dependencies: [] },
        { id: 'step-2', name: 'Casting', sequence: 2, duration_days: 3, dependencies: ['step-1'] },
        { id: 'step-3', name: 'QC & Delivery', sequence: 3, duration_days: 1, dependencies: ['step-2'] }
      ];

      const initialSchedule = calculateCpmSchedule(templates, occasionDate, 5); // Target delivery: 2026-12-20
      expect(initialSchedule.targetDeliveryDate).toBe('2026-12-20');

      // Delay Step 2 by 2 days -> projected delivery becomes 2026-12-22 (still 3 days before occasion 12-25)
      const cascade = recomputeDelayCascade(initialSchedule.milestones, 'step-2', 2, occasionDate);

      expect(cascade.projectedDeliveryDate).toBe('2026-12-22');
      expect(cascade.isAtRisk).toBe(false);
      expect(cascade.orderStatus).toBe('DELAYED'); // Marked delayed, but NOT at risk of missing wedding
      expect(cascade.bufferDaysRemaining).toBe(3); // 3 days safety buffer remaining
    });
  });
});

