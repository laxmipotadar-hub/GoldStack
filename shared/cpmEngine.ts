/**
 * Pure TypeScript Critical Path Method (CPM) & Milestone Scheduling Engine
 *
 * Implements:
 * 1. Topological dependency ordering & validation (cycle detection)
 * 2. Forward pass: Earliest Start (ES) and Earliest Finish (EF)
 * 3. Backward pass: Latest Start (LS) and Latest Finish (LF)
 * 4. Slack calculation: Slack = LS - ES = LF - EF; Zero-slack identifies the Critical Path
 * 5. Reverse-scheduling milestones backward from customer Occasion Date (Wedding Date Protection)
 * 6. Delay cascade recomputation: dynamically shifts downstream milestones and flags AT_RISK
 */

export type OrderComplexity = 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'INTRICATE';

export interface CpmMilestoneInput {
  id: string;
  name: string;
  name_hi?: string;
  sequence: number;
  duration_days: number;
  dependencies: string[]; // array of predecessor IDs
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED';
  planned_start_date?: string;
  planned_date?: string; // planned finish date
  actual_date?: string | null;
  notes?: string;
}

export interface CpmCalculatedNode extends CpmMilestoneInput {
  earliest_start: number; // in relative days from start (ES)
  earliest_finish: number; // EF = ES + duration
  latest_start: number; // in relative days from start (LS)
  latest_finish: number; // LF
  slack: number; // Slack = LS - ES
  is_critical: boolean; // Slack <= 0.001
  planned_start_date: string; // ISO Date YYYY-MM-DD
  planned_date: string; // ISO Date YYYY-MM-DD (finish)
}

export interface CpmProjectResult {
  totalDurationDays: number;
  criticalPath: string[]; // IDs of milestones on critical path
  milestones: CpmCalculatedNode[];
  targetDeliveryDate: string; // YYYY-MM-DD
  occasionDate: string; // YYYY-MM-DD
  bufferDays: number; // Days between delivery and occasion
}

export interface DelayCascadeResult {
  isAtRisk: boolean;
  orderStatus: 'ACTIVE' | 'IN_PROGRESS' | 'DELAYED' | 'AT_RISK';
  projectedDeliveryDate: string;
  occasionDate: string;
  daysToOccasion: number;
  bufferDaysRemaining: number;
  milestones: CpmCalculatedNode[];
  affectedMilestoneIds: string[];
}

/**
 * Standard jewellery crafting milestones template duration scaled by complexity
 */
export function getStandardMilestoneTemplates(complexity: OrderComplexity): Omit<CpmMilestoneInput, 'id'>[] {
  // Scaling factors: SIMPLE (fast / plain cast), MEDIUM (standard link/collet), COMPLEX (bridal/kundan), INTRICATE (temple/nakshi)
  const durationMap: Record<OrderComplexity, [number, number, number, number, number, number]> = {
    SIMPLE: [1, 2, 1, 1, 1, 1], // Total: 7 days
    MEDIUM: [2, 3, 3, 2, 1, 1], // Total: 12 days
    COMPLEX: [3, 5, 6, 3, 2, 1], // Total: 20 days
    INTRICATE: [5, 7, 10, 5, 2, 1] // Total: 30 days
  };

  const [dDesign, dCasting, dSetting, dPolishing, dQc, dDelivery] = durationMap[complexity] || durationMap.MEDIUM;

  return [
    {
      name: 'Design & CAD Approval',
      name_hi: 'डिज़ाइन व सीएडी अनुमोदन',
      sequence: 1,
      duration_days: dDesign,
      dependencies: []
    },
    {
      name: 'Gold Melting & Casting',
      name_hi: 'सोना ढलाई व तार खिंचाई',
      sequence: 2,
      duration_days: dCasting,
      dependencies: ['step-1'] // will be mapped to previous step ID
    },
    {
      name: 'Stone Setting & Kundan Jadau',
      name_hi: 'नगीना जड़ाई व कुंदन कार्य',
      sequence: 3,
      duration_days: dSetting,
      dependencies: ['step-2']
    },
    {
      name: 'Hand Filing & Polishing',
      name_hi: 'घिसाई व पॉलिशिंग',
      sequence: 4,
      duration_days: dPolishing,
      dependencies: ['step-3']
    },
    {
      name: 'Hallmarking & Quality Check',
      name_hi: 'हॉलमार्किंग व बीआईएस गुणवत्ता जाँच',
      sequence: 5,
      duration_days: dQc,
      dependencies: ['step-4']
    },
    {
      name: 'Final Assembly & Delivery',
      name_hi: 'तैयार आभूषण सुपुर्दगी',
      sequence: 6,
      duration_days: dDelivery,
      dependencies: ['step-5']
    }
  ];
}

/**
 * Helper: Adds integer days to an ISO date string (YYYY-MM-DD)
 */
export function addDaysToDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().split('T')[0];
}

/**
 * Helper: Computes difference in calendar days between two ISO dates (date2 - date1)
 */
export function diffDays(date1: string, date2: string): number {
  const d1 = new Date(date1.split('T')[0] + 'T00:00:00Z').getTime();
  const d2 = new Date(date2.split('T')[0] + 'T00:00:00Z').getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * Topological Sort to establish DAG execution order and detect circular dependencies
 */
export function topologicalSort(nodes: CpmMilestoneInput[]): CpmMilestoneInput[] {
  const nodeMap = new Map<string, CpmMilestoneInput>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  }

  for (const n of nodes) {
    for (const depId of n.dependencies) {
      if (nodeMap.has(depId)) {
        adjList.get(depId)!.push(n.id);
        inDegree.set(n.id, (inDegree.get(n.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const sorted: CpmMilestoneInput[] = [];

  while (queue.length > 0) {
    const currId = queue.shift()!;
    sorted.push(nodeMap.get(currId)!);

    for (const neighbor of adjList.get(currId) || []) {
      const nextDeg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error('Cycle detected in milestone dependencies graph. Milestones must form a valid DAG.');
  }

  return sorted;
}

/**
 * Executes Critical Path Method (CPM):
 * - Forward Pass: computes Earliest Start (ES) and Earliest Finish (EF)
 * - Backward Pass: computes Latest Start (LS) and Latest Finish (LF)
 * - Slack = LS - ES
 * - Zero Slack (slack <= 0.001) flags the Critical Path
 *
 * @param milestones List of milestones forming a DAG
 * @param occasionDate Customer's target occasion date (YYYY-MM-DD)
 * @param deliveryBufferDays Safe buffer days before occasion date (default: 1 day)
 */
export function calculateCpmSchedule(
  milestones: CpmMilestoneInput[],
  occasionDate: string,
  deliveryBufferDays = 1
): CpmProjectResult {
  if (!milestones || milestones.length === 0) {
    return {
      totalDurationDays: 0,
      criticalPath: [],
      milestones: [],
      targetDeliveryDate: occasionDate,
      occasionDate,
      bufferDays: deliveryBufferDays
    };
  }

  const sortedNodes = topologicalSort(milestones);
  const nodeMap = new Map<string, CpmMilestoneInput>(milestones.map((m) => [m.id, m]));
  const successorsMap = new Map<string, string[]>();

  for (const m of milestones) {
    successorsMap.set(m.id, []);
  }
  for (const m of milestones) {
    for (const depId of m.dependencies) {
      if (successorsMap.has(depId)) {
        successorsMap.get(depId)!.push(m.id);
      }
    }
  }

  // 1. Forward Pass (ES & EF)
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const node of sortedNodes) {
    const validDeps = node.dependencies.filter((d) => nodeMap.has(d));
    let earliestStart = 0;
    if (validDeps.length > 0) {
      earliestStart = Math.max(...validDeps.map((d) => ef.get(d) ?? 0));
    }
    const earliestFinish = earliestStart + node.duration_days;
    es.set(node.id, earliestStart);
    ef.set(node.id, earliestFinish);
  }

  const totalDurationDays = Math.max(...Array.from(ef.values()));

  // 2. Backward Pass (LS & LF)
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  // Reverse topological order
  const reverseSorted = [...sortedNodes].reverse();

  for (const node of reverseSorted) {
    const successors = successorsMap.get(node.id) || [];
    let latestFinish: number;
    if (successors.length === 0) {
      // Terminal milestone: finishes at project duration
      latestFinish = totalDurationDays;
    } else {
      latestFinish = Math.min(...successors.map((sId) => ls.get(sId) ?? totalDurationDays));
    }
    const latestStart = latestFinish - node.duration_days;
    lf.set(node.id, latestFinish);
    ls.set(node.id, latestStart);
  }

  // 3. Reverse-scheduling: anchor delivery finish date before occasion date
  const cleanOccasionDate = occasionDate.split('T')[0];
  const targetDeliveryDate = addDaysToDate(cleanOccasionDate, -deliveryBufferDays);

  // 4. Slack calculation & Critical Path identification
  const criticalPath: string[] = [];
  const calculatedNodes: CpmCalculatedNode[] = [];

  for (const node of milestones) {
    const nodeEs = es.get(node.id) ?? 0;
    const nodeEf = ef.get(node.id) ?? 0;
    const nodeLs = ls.get(node.id) ?? 0;
    const nodeLf = lf.get(node.id) ?? 0;
    const slack = Number((nodeLs - nodeEs).toFixed(4));
    const isCritical = Math.abs(slack) <= 0.001;

    if (isCritical) {
      criticalPath.push(node.id);
    }

    // Planned finish date is reverse-scheduled relative to targetDeliveryDate
    // The final milestone finishes at targetDeliveryDate (offset = 0)
    // Any milestone i finishes (totalDurationDays - nodeLf) days before targetDeliveryDate
    const finishOffsetDays = totalDurationDays - nodeLf;
    const plannedFinishDate = addDaysToDate(targetDeliveryDate, -finishOffsetDays);
    const plannedStartDate = addDaysToDate(plannedFinishDate, -node.duration_days);

    calculatedNodes.push({
      ...node,
      earliest_start: nodeEs,
      earliest_finish: nodeEf,
      latest_start: nodeLs,
      latest_finish: nodeLf,
      slack,
      is_critical: isCritical,
      planned_start_date: plannedStartDate,
      planned_date: plannedFinishDate
    });
  }

  // Sort by sequence for consistent display
  calculatedNodes.sort((a, b) => a.sequence - b.sequence);

  return {
    totalDurationDays,
    criticalPath,
    milestones: calculatedNodes,
    targetDeliveryDate,
    occasionDate: cleanOccasionDate,
    bufferDays: deliveryBufferDays
  };
}

/**
 * Recomputes downstream milestone dates when a milestone is marked DELAYED or completed with lag.
 * If the newly computed final delivery date exceeds the occasion_date, sets order status to 'AT_RISK'.
 *
 * @param currentMilestones Existing milestones with planned dates
 * @param delayedMilestoneId The milestone encountering a delay
 * @param delayDays Additional days delayed
 * @param occasionDate Customer's non-negotiable event date
 */
export function recomputeDelayCascade(
  currentMilestones: CpmCalculatedNode[],
  delayedMilestoneId: string,
  delayDays: number,
  occasionDate: string
): DelayCascadeResult {
  const cleanOccasionDate = occasionDate.split('T')[0];
  const nodeMap = new Map<string, CpmCalculatedNode>(currentMilestones.map((m) => [m.id, { ...m }]));
  const delayedNode = nodeMap.get(delayedMilestoneId);

  if (!delayedNode || delayDays <= 0) {
    const deliveryNode = currentMilestones[currentMilestones.length - 1];
    const projDate = deliveryNode ? deliveryNode.planned_date : cleanOccasionDate;
    const daysToOccasion = diffDays(new Date().toISOString().split('T')[0], cleanOccasionDate);
    const buffer = diffDays(projDate, cleanOccasionDate);

    return {
      isAtRisk: buffer < 0,
      orderStatus: buffer < 0 ? 'AT_RISK' : 'ACTIVE',
      projectedDeliveryDate: projDate,
      occasionDate: cleanOccasionDate,
      daysToOccasion,
      bufferDaysRemaining: buffer,
      milestones: currentMilestones,
      affectedMilestoneIds: []
    };
  }

  // 1. Shift the delayed milestone
  delayedNode.status = 'DELAYED';
  delayedNode.planned_date = addDaysToDate(delayedNode.planned_date, delayDays);

  const affectedIds = new Set<string>([delayedMilestoneId]);
  const sorted = topologicalSort(currentMilestones);

  // 2. Cascade delay to downstream milestones topologically
  for (const node of sorted) {
    if (node.id === delayedMilestoneId) continue;

    const curr = nodeMap.get(node.id)!;
    // Check if any predecessor was affected
    const affectedPreds = curr.dependencies.filter((pId) => affectedIds.has(pId));

    if (affectedPreds.length > 0) {
      // Find latest finish among predecessors
      let maxPredFinish = curr.planned_start_date;
      for (const pId of curr.dependencies) {
        const pred = nodeMap.get(pId);
        if (pred && (!maxPredFinish || pred.planned_date > maxPredFinish)) {
          maxPredFinish = pred.planned_date;
        }
      }

      // If predecessor finish exceeds current planned start, push current milestone
      if (maxPredFinish && maxPredFinish > curr.planned_start_date) {
        curr.planned_start_date = maxPredFinish;
        curr.planned_date = addDaysToDate(curr.planned_start_date, curr.duration_days);
        affectedIds.add(curr.id);
      }
    }
  }

  // 3. Find final projected delivery date (terminal node)
  const updatedMilestones = Array.from(nodeMap.values()).sort((a, b) => a.sequence - b.sequence);
  const terminalMilestone = updatedMilestones[updatedMilestones.length - 1];
  const projectedDeliveryDate = terminalMilestone.planned_date;

  // 4. Assess Wedding-Date Risk:
  // If projected delivery is after occasion date, set to AT_RISK!
  const bufferDaysRemaining = diffDays(projectedDeliveryDate, cleanOccasionDate);
  const isAtRisk = bufferDaysRemaining < 0; // Exceeds occasion date!

  const todayStr = new Date().toISOString().split('T')[0];
  const daysToOccasion = diffDays(todayStr, cleanOccasionDate);

  let orderStatus: 'ACTIVE' | 'IN_PROGRESS' | 'DELAYED' | 'AT_RISK' = 'IN_PROGRESS';
  if (isAtRisk) {
    orderStatus = 'AT_RISK';
  } else {
    orderStatus = 'DELAYED';
  }

  return {
    isAtRisk,
    orderStatus,
    projectedDeliveryDate,
    occasionDate: cleanOccasionDate,
    daysToOccasion,
    bufferDaysRemaining,
    milestones: updatedMilestones,
    affectedMilestoneIds: Array.from(affectedIds)
  };
}

