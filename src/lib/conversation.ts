// Branching conversation engine (pure functions).
import type { ConversationChoice, ConversationNode, ConversationScenario } from '../types';

export interface ConvTurn {
  node: ConversationNode;
  choice?: ConversationChoice;
}

export interface ConvState {
  nodeId: string;
  turns: ConvTurn[];
  best: number;
  ok: number;
  wrong: number;
  ended: boolean;
}

export function startConversation(sc: ConversationScenario): ConvState {
  const node = getNode(sc, sc.start);
  return { nodeId: sc.start, turns: [], best: 0, ok: 0, wrong: 0, ended: !!node.end };
}

export function getNode(sc: ConversationScenario, id: string): ConversationNode {
  const n = sc.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Missing node ${id} in ${sc.id}`);
  return n;
}

/**
 * Apply a reply. Wrong replies don't advance — the learner gets feedback and tries again.
 * Returns the new state and whether the conversation moved on.
 */
export function reply(sc: ConversationScenario, st: ConvState, choice: ConversationChoice): { state: ConvState; advanced: boolean } {
  if (st.ended) return { state: st, advanced: false };
  const node = getNode(sc, st.nodeId);
  if (choice.quality === 'wrong' || !choice.next) {
    return { state: { ...st, wrong: st.wrong + 1 }, advanced: false };
  }
  const next = getNode(sc, choice.next);
  return {
    state: {
      nodeId: next.id,
      turns: [...st.turns, { node, choice }],
      best: st.best + (choice.quality === 'best' ? 1 : 0),
      ok: st.ok + (choice.quality === 'ok' ? 1 : 0),
      wrong: st.wrong,
      ended: !!next.end,
    },
    advanced: true,
  };
}

/** Find the reply a recognised utterance corresponds to (by the target it matched). */
export function choiceForTarget(node: ConversationNode, roman: string): ConversationChoice | undefined {
  return node.choices?.find((c) => c.roman === roman);
}
