import { test, expect } from "vitest";
import { VllmClient } from "../vllm.js";

test("VllmClient has correct defaults", () => {
  const client = new VllmClient();
  expect(client).toBeDefined();
});

test("VllmClient accepts custom baseUrl", () => {
  const client = new VllmClient({ baseUrl: "http://wsl:8000/v1" });
  expect(client).toBeDefined();
});
