/**
 * Applies a copilot workflow diff to the ReactFlow canvas state.
 *
 * Handles UUID remapping (copilot IDs → real UUIDs), overlap correction,
 * and block name uniqueness.
 */

import type { Node, Edge } from "reactflow";
import type { WorkflowDiff } from "@/lib/ai-api";
import { getDefaultConfig, blockRegistry } from "@/data/ai-workflows/block-registry";

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

/**
 * Build a map from copilot-generated IDs to real UUIDs.
 * Also remap any copilot ID references inside config string values.
 */
function buildIdMap(addBlocks: WorkflowDiff["add_blocks"]): Map<string, string> {
  const idMap = new Map<string, string>();
  if (!addBlocks) return idMap;
  for (const block of addBlocks) {
    idMap.set(block.id, crypto.randomUUID());
  }
  return idMap;
}

/** Remap copilot IDs in a string value to block names for reference syntax. */
function remapConfigRefs(
  value: unknown,
  idToName: Map<string, string>,
): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const [copilotId, blockName] of idToName) {
      // Replace <copilotId. with <blockName.
      result = result.replaceAll(`<${copilotId}.`, `<${blockName}.`);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((v) => remapConfigRefs(v, idToName));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = remapConfigRefs(v, idToName);
    }
    return out;
  }
  return value;
}

/** Ensure block names are unique relative to existing nodes. */
function uniquifyName(name: string, existingNames: Set<string>): string {
  if (!existingNames.has(name)) {
    existingNames.add(name);
    return name;
  }
  let suffix = 2;
  while (existingNames.has(`${name} ${suffix}`)) {
    suffix++;
  }
  const unique = `${name} ${suffix}`;
  existingNames.add(unique);
  return unique;
}

/** Fix overlapping blocks: enforce min 200px vertical gap for blocks at similar X. */
function correctOverlaps(nodes: Node[], newNodeIds: Set<string>): void {
  // Only adjust newly added nodes
  const newNodes = nodes.filter((n) => newNodeIds.has(n.id));
  if (newNodes.length < 2) return;

  // Sort new nodes by Y position
  newNodes.sort((a, b) => a.position.y - b.position.y);

  const MIN_Y_GAP = 200;
  const X_PROXIMITY = 150; // blocks within this X distance are "same column"

  for (let i = 1; i < newNodes.length; i++) {
    const prev = newNodes[i - 1];
    const curr = newNodes[i];
    // Only adjust if they're in a similar X column
    if (Math.abs(curr.position.x - prev.position.x) > X_PROXIMITY) continue;

    const gap = curr.position.y - prev.position.y;
    if (gap < MIN_Y_GAP) {
      curr.position = { ...curr.position, y: prev.position.y + MIN_Y_GAP };
    }
  }
}

/** Normalize knowledge_bases: copilot may send various shapes, UI expects [{id:"id1"},{id:"id2"}] */
function normalizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const kb = config.knowledge_bases;
  if (kb == null || kb === false) return config;
  // Single string → wrap in array of objects
  if (typeof kb === "string") {
    return { ...config, knowledge_bases: kb ? [{ id: kb }] : [] };
  }
  if (Array.isArray(kb)) {
    // Normalize each item: strings → {id}, objects with id → keep, objects without id → skip
    const normalized = kb
      .map((item) => {
        if (typeof item === "string") return { id: item };
        if (item && typeof item === "object" && "id" in item) return item;
        return null;
      })
      .filter(Boolean);
    return { ...config, knowledge_bases: normalized };
  }
  return config;
}

export function applyCopilotDiff(
  diff: WorkflowDiff,
  setNodes: SetState<Node[]>,
  setEdges: SetState<Edge[]>,
): void {
  // Build copilot ID → UUID map for new blocks
  const idMap = buildIdMap(diff.add_blocks);

  // Copilot ID → post-uniquified block name map (populated inside setNodes,
  // read by setEdges — hoisted so both callbacks can access it)
  let idToName = new Map<string, string>();

  // Name → UUID map for existing blocks (populated in setNodes, used by setEdges).
  // The copilot uses block names (not UUIDs) for all references; this resolves them.
  let nameToUuid = new Map<string, string>();

  /** Resolve an edge endpoint: try copilot ID map first, then name→UUID, then passthrough. */
  function resolveRef(id: string): string {
    return idMap.get(id) ?? nameToUuid.get(id) ?? id;
  }

  // Pre-resolve remove_blocks names → will be resolved to UUIDs inside setNodes
  const rawRemoveBlocks = diff.remove_blocks ?? [];

  setNodes((prevNodes) => {
    // Build name→UUID lookup from existing canvas nodes.
    // Skip duplicates (keep first) — the copilot sees disambiguated names
    // from CopilotPanel, so exact-name collisions shouldn't happen in practice.
    nameToUuid = new Map<string, string>();
    for (const n of prevNodes) {
      const label = (n.data?.label as string) ?? "";
      if (label && !nameToUuid.has(label)) {
        nameToUuid.set(label, n.id);
      }
    }

    // Resolve remove_blocks: copilot sends names, we need UUIDs
    const removeBlockIds = new Set(
      rawRemoveBlocks.map((ref) => nameToUuid.get(ref) ?? ref),
    );

    // 1. Filter removed blocks
    let nodes = removeBlockIds.size > 0
      ? prevNodes.filter((n) => !removeBlockIds.has(n.id))
      : [...prevNodes];

    // 2. Add new blocks with UUID remapping and name uniqueness
    //    (first pass: create nodes, assign unique names, build idToName)
    const newNodeIds = new Set<string>();
    if (diff.add_blocks) {
      const existingNames = new Set<string>(
        nodes.map((n) => (n.data?.label as string) ?? ""),
      );

      for (const block of diff.add_blocks) {
        const uuid = idMap.get(block.id) ?? block.id;
        const defaultConfig = getDefaultConfig(block.type);
        const blockDef = blockRegistry[block.type];
        const rawName = block.name ?? blockDef?.name ?? block.type;
        const name = uniquifyName(rawName, existingNames);

        // Record the post-uniquified name for reference remapping
        idToName.set(block.id, name);
        // Also register new block in name→UUID so edges can resolve them
        nameToUuid.set(name, uuid);

        // Auto-generate webhook credentials (same as WorkflowCanvas)
        const finalConfig = block.type === "webhook"
          ? {
              ...defaultConfig,
              ...(block.config ?? {}),
              webhook_id: crypto.randomUUID(),
              webhook_secret: crypto.randomUUID(),
            }
          : { ...defaultConfig, ...(block.config ?? {}) };

        const newNode: Node = {
          id: uuid,
          type: "block",
          position: block.position,
          data: {
            blockType: block.type,
            label: name,
            config: normalizeConfig(finalConfig),
          },
        };
        nodes.push(newNode);
        newNodeIds.add(uuid);
      }
    }

    // 3. Second pass: remap copilot ID references in new nodes' configs
    //    (now that all names are finalized in idToName)
    if (idToName.size > 0) {
      for (const node of nodes) {
        if (!newNodeIds.has(node.id)) continue;
        const remappedConfig = remapConfigRefs(node.data.config, idToName) as Record<string, unknown>;
        node.data = { ...node.data, config: remappedConfig };
      }
    }

    // 4. Apply updates — copilot sends block names as IDs, resolve to UUIDs
    if (diff.update_blocks) {
      const updateMap = new Map(
        diff.update_blocks.map((u) => [nameToUuid.get(u.id) ?? u.id, u.config]),
      );
      nodes = nodes.map((n) => {
        const configUpdate = updateMap.get(n.id);
        if (!configUpdate) return n;
        const remappedUpdate = remapConfigRefs(configUpdate, idToName) as Record<string, unknown>;
        return {
          ...n,
          data: {
            ...n.data,
            config: normalizeConfig({ ...(n.data.config ?? {}), ...remappedUpdate }),
          },
        };
      });
    }

    // 5. Fix overlapping blocks
    correctOverlaps(nodes, newNodeIds);

    return nodes;
  });

  setEdges((prevEdges) => {
    // Resolve remove_blocks to UUIDs for edge filtering
    const removeBlockIds = new Set(
      rawRemoveBlocks.map((ref) => nameToUuid.get(ref) ?? ref),
    );

    // 1. Filter edges from removed blocks
    let edges = removeBlockIds.size > 0
      ? prevEdges.filter(
          (e) => !removeBlockIds.has(e.source) && !removeBlockIds.has(e.target)
        )
      : [...prevEdges];

    // 2. Filter explicitly removed edges (resolve names → UUIDs, include sourceHandle)
    if (diff.remove_edges) {
      const removeSet = new Set(
        diff.remove_edges.map((re) => {
          const key = `${resolveRef(re.source)}->${resolveRef(re.target)}`;
          return re.sourceHandle ? `${key}:${re.sourceHandle}` : key;
        })
      );
      edges = edges.filter((e) => {
        const key = `${e.source}->${e.target}`;
        const keyWithHandle = `${key}:${e.sourceHandle}`;
        return !removeSet.has(key) && !removeSet.has(keyWithHandle);
      });
    }

    // 3. Add new edges — resolve names and copilot IDs to UUIDs
    if (diff.add_edges) {
      for (const edgeDef of diff.add_edges) {
        const id = crypto.randomUUID();
        const newEdge: Edge = {
          id,
          source: resolveRef(edgeDef.source),
          target: resolveRef(edgeDef.target),
          sourceHandle: edgeDef.sourceHandle,
          data: edgeDef.sourceHandle
            ? { condition: edgeDef.sourceHandle }
            : undefined,
        };
        edges.push(newEdge);
      }
    }

    return edges;
  });
}
