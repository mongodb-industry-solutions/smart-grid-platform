import {
  StateGraph,
  MessagesAnnotation,
  Annotation,
  START,
  END,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import getMongoClientPromise from "@/lib/mongodb";
import { makeLLM } from "./llm";
import { SKILLS, ALL_TOOLS, MODULE_IDS, MODULE_CATALOG } from "./skills";

// Graph state: the message list (LangGraph reducer) + the routed module.
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  module: Annotation(),
});

const toolNode = new ToolNode(ALL_TOOLS);

// Extract plain text from a message whose content may be a string or blocks.
function textOf(message) {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "string" ? b : b.text || "")).join("");
  return "";
}

// ── Node: router — classify the question into one module. ──
async function routerNode(state) {
  const lastHuman = [...state.messages].reverse().find((m) => m._getType?.() === "human");
  const question = textOf(lastHuman);
  const llm = makeLLM({ maxTokens: 16 });
  const sys = `Classify the user's question into exactly ONE module id.\nModules:\n${MODULE_CATALOG}\nRespond with ONLY the module id, nothing else.`;
  let module = "general";
  try {
    const res = await llm.invoke([new SystemMessage(sys), new HumanMessage(question)]);
    const guess = textOf(res).trim().toLowerCase().replace(/[^a-z]/g, "");
    if (MODULE_IDS.includes(guess)) module = guess;
  } catch {
    module = "general";
  }
  return { module };
}

// ── Node: agent — LLM bound to the routed module's tools. ──
async function agentNode(state) {
  const skill = SKILLS[state.module] || SKILLS.general;
  const llm = makeLLM().bindTools(skill.tools);
  const res = await llm.invoke([new SystemMessage(skill.prompt), ...state.messages]);
  return { messages: [res] };
}

function shouldContinue(state) {
  const last = state.messages[state.messages.length - 1];
  return last?.tool_calls?.length ? "tools" : END;
}

const workflow = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("agent", agentNode)
  .addNode("tools", toolNode)
  .addEdge(START, "router")
  .addEdge("router", "agent")
  .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
  .addEdge("tools", "agent");

let compiledGraph;
async function getGraph() {
  if (!compiledGraph) {
    const client = await getMongoClientPromise();
    const checkpointer = new MongoDBSaver({
      client,
      dbName: process.env.DATABASE_NAME,
      checkpointCollectionName: "agent_checkpoints",
      checkpointWritesCollectionName: "agent_checkpoint_writes",
    });
    compiledGraph = workflow.compile({ checkpointer });
  }
  return compiledGraph;
}

/**
 * Runs one turn. Conversation memory is persisted in MongoDB by thread_id, so
 * only the new user message is sent each turn.
 *
 * @param {string} userText the new user message
 * @param {string} threadId conversation id (memory key)
 * @param {{ category?: string|null }} [ctx]
 * @returns {Promise<{ answer, module, moduleLabel, toolCalls, sources }>}
 */
export async function runGraph(userText, threadId, ctx = {}) {
  const graph = await getGraph();
  const result = await graph.invoke(
    { messages: [new HumanMessage(userText)] },
    {
      configurable: { thread_id: threadId, category: ctx.category || null },
      recursionLimit: 12,
    }
  );

  const messages = result.messages ?? [];
  const module = result.module || "general";

  // Final answer = last AI message text.
  const lastAi = [...messages].reverse().find((m) => m._getType?.() === "ai");
  const answer = textOf(lastAi).trim() || "Sorry, I couldn't produce an answer.";

  // Ordered tool-call steps (the real sequence, across every agent turn) +
  // unique tool names + KB sources (from tool results).
  const steps = [];
  const toolCalls = new Set();
  const sources = new Map();
  for (const m of messages) {
    if (m._getType?.() === "ai" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        toolCalls.add(tc.name);
        steps.push({ name: tc.name, input: tc.args ?? {} });
      }
    }
    if (m._getType?.() === "tool" && m.name === "search_knowledge_base") {
      try {
        for (const a of JSON.parse(textOf(m))) {
          sources.set(a.title, { title: a.title, category: a.category });
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return {
    answer,
    module,
    moduleLabel: SKILLS[module]?.label ?? "General",
    steps,
    toolCalls: [...toolCalls],
    sources: [...sources.values()],
  };
}
