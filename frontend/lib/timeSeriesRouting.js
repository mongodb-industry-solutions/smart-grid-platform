// Derives a "query routing" model from a time-series step so the explorer can
// visualize it: which collections (entities) the pipeline touches, how each
// stage transforms the document, and what shape the new object ends up with.
// Everything is derived from the step's pipeline (plus the result, when it has
// been run), so it stays correct if the steps change.

const OP_LABELS = {
  $match: "filter",
  $sort: "sort",
  $limit: "limit",
  $group: "group",
  $lookup: "join",
  $unwind: "flatten",
  $project: "shape",
};

export function opLabel(op) {
  return OP_LABELS[op] ?? op.replace(/^\$/, "");
}

function stageDetail(op, body) {
  if (body == null) return "";
  if (op === "$lookup") return body.from ?? "";
  if (op === "$unwind") {
    const path = typeof body === "string" ? body : body.path;
    return String(path ?? "").replace(/^\$/, "");
  }
  if (op === "$group") {
    return Object.keys(body)
      .filter((k) => k !== "_id")
      .join(", ");
  }
  if (op === "$project" || op === "$match" || op === "$sort") {
    return Object.keys(body).join(", ");
  }
  if (op === "$limit") return String(body);
  return "";
}

function describeStage(stage) {
  const op = Object.keys(stage)[0];
  const body = stage[op];
  const touches = [];
  if (op === "$lookup" && body?.from) touches.push(body.from);
  return { op, label: opLabel(op), detail: stageDetail(op, body), touches };
}

// The document shape the stage chain produces. The live result is the most
// accurate source; before a run we fall back to $project, then the last $group.
function outputFields(step, result) {
  if (Array.isArray(result) && result.length && result[0] && typeof result[0] === "object") {
    return Object.keys(result[0]);
  }
  const project = [...step.pipeline].reverse().find((s) => s.$project);
  if (project) return Object.keys(project.$project).filter((k) => k !== "_id");

  const group = [...step.pipeline].reverse().find((s) => s.$group);
  if (group) {
    const keys = Object.keys(group.$group).filter((k) => k !== "_id");
    if (keys.length) return keys;
    return ["_id"];
  }
  return [];
}

export function buildRouting(step, result) {
  const stages = step.pipeline.map(describeStage);

  const entities = [{ name: step.collection, role: "source" }];
  for (const s of stages) {
    for (const t of s.touches) {
      if (!entities.some((e) => e.name === t)) {
        entities.push({ name: t, role: "join" });
      }
    }
  }

  return {
    source: step.collection,
    entities,
    stages,
    output: {
      fields: outputFields(step, result),
      ready: Array.isArray(result) && result.length > 0,
    },
  };
}
