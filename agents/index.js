/**
 * AET Agents Index
 *
 * Exports all available agents for the AET workflow system.
 */

import { routerDefinition } from "./router/index.js";
import { designDefinition } from "./design/index.js";
import { implementDefinition } from "./implement/index.js";
import { testDefinition } from "./test/index.js";
import { bugfixDefinition } from "./bugfix/index.js";
import { docDefinition } from "./doc/index.js";
import { releaseDefinition } from "./release/index.js";

export const AGENTS = [
  routerDefinition,
  designDefinition,
  implementDefinition,
  testDefinition,
  bugfixDefinition,
  docDefinition,
  releaseDefinition,
];

export function getAgentByName(name) {
  return AGENTS.find(agent => agent.name === name);
}

export function getAllAgentNames() {
  return AGENTS.map(agent => agent.name);
}