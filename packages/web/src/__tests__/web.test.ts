import { test, expect } from "vitest";
import { SearxngAdapter, WebSearchTool, WebFetchTool } from "../src/search.js";

test("WebSearchTool creates tool with correct name", () => {
  const adapter = new SearxngAdapter("http://localhost:8080");
  const tool = WebSearchTool(adapter);
  expect(tool.name).toBe("web_search");
  expect(tool.description).toContain("Search the web");
});

test("WebFetchTool has correct name", () => {
  expect(WebFetchTool.name).toBe("web_fetch");
  expect(WebFetchTool.description).toContain("Fetch a web page");
});
