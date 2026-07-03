// AI vendor registry — module-scope map from VendorId to AiVendor.
//
// Ported from Starkhorn (nadi-backend/src/services/ai/registry.ts). Vendors
// register themselves here; the orchestrator (services/ai_client.ts) looks up by
// id. No factory machinery — strategy pattern with a static map.
//
// Adding a new vendor:
//   1. Write a new file under services/ai/vendors/ implementing AiVendor.
//   2. Import the singleton here and add the registry entry.

import { claudeCliVendor } from "./vendors/claude_cli_vendor";
import { geminiApiVendor } from "./vendors/gemini_api_vendor";
import type { AiVendor, VendorId } from "./types";

const REGISTRY: Record<string, AiVendor> = {
  [claudeCliVendor.id]: claudeCliVendor,
  [geminiApiVendor.id]: geminiApiVendor,
};

export function getVendor(id: VendorId): AiVendor {
  const v = REGISTRY[id];
  if (!v) throw new Error(`Unknown AI vendor: ${id}`);
  return v;
}

export function listVendors(): VendorId[] {
  return Object.keys(REGISTRY) as VendorId[];
}
