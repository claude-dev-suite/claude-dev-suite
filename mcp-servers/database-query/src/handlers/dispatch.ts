// SPDX-License-Identifier: MIT
/**
 * Tool dispatch with argument-error formatting and output redaction.
 */

import { z } from "zod";
import { allSecrets, redactText } from "../config.js";
import { handlers } from "./index.js";
import type { HandlerResult } from "./types.js";

export async function callTool(name: string, args: unknown): Promise<HandlerResult> {
  const handler = handlers[name];
  if (!handler) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
  }
  try {
    const result = await handler(args ?? {});
    // Last line of defence: no configured password ever leaves the server.
    const secrets = allSecrets();
    return { ...result, content: result.content.map((c) => ({ ...c, text: redactText(c.text, secrets) })) };
  } catch (error) {
    let message: string;
    if (error instanceof z.ZodError) {
      message = `Invalid arguments: ${error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`;
    } else {
      message = error instanceof Error ? error.message : String(error);
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ error: redactText(message, allSecrets()) }) }],
      isError: true,
    };
  }
}
