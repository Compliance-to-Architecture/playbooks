import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HindsightAdapter,
  defaultHindsightConfig,
} from "../core/memory/hindsight-adapter";

describe("HindsightAdapter", () => {
  let adapter: HindsightAdapter;

  beforeEach(() => {
    adapter = new HindsightAdapter({
      baseUrl: "http://localhost:8888",
      bankId: "test-bank",
    });
  });

  describe("constructor", () => {
    it("uses default config when no overrides provided", () => {
      const defaultAdapter = new HindsightAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it("merges partial config with defaults", () => {
      const customAdapter = new HindsightAdapter({
        bankId: "custom-bank",
        recallTokenBudget: 5000,
      });
      expect(customAdapter).toBeDefined();
    });
  });

  describe("defaultHindsightConfig", () => {
    it("has expected default values", () => {
      expect(defaultHindsightConfig.baseUrl).toBe("http://localhost:8888");
      expect(defaultHindsightConfig.bankId).toBe("iof-coding-engine");
      expect(defaultHindsightConfig.recallTokenBudget).toBe(2000);
      expect(defaultHindsightConfig.autoRetain).toBe(true);
      expect(defaultHindsightConfig.autoReflect).toBe(true);
      expect(defaultHindsightConfig.reflectIntervalMinutes).toBe(60);
    });
  });

  describe("isAvailable", () => {
    it("returns false when server is not reachable", async () => {
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });

    it("caches availability result", async () => {
      await adapter.isAvailable();
      // Second call should use cached result
      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe("retain", () => {
    it("returns error when server is unavailable", async () => {
      const result = await adapter.retain("test content");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Hindsight server not available");
    });
  });

  describe("recall", () => {
    it("returns empty memories when server is unavailable", async () => {
      const result = await adapter.recall("test query");
      expect(result.success).toBe(false);
      expect(result.memories).toEqual([]);
      expect(result.error).toBe("Hindsight server not available");
    });
  });

  describe("reflect", () => {
    it("returns error when server is unavailable", async () => {
      const result = await adapter.reflect("test query");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Hindsight server not available");
    });
  });

  describe("ensureBank", () => {
    it("returns false when server is unavailable", async () => {
      const result = await adapter.ensureBank();
      expect(result).toBe(false);
    });
  });

  describe("getBankStats", () => {
    it("returns null when server is unavailable", async () => {
      const result = await adapter.getBankStats();
      expect(result).toBeNull();
    });
  });

  describe("MemorySystem integration", () => {
    it("MemorySystem accepts hindsight config", async () => {
      const { MemorySystem } = await import("../core/memory/memory-system");
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-hs-test-"));

      try {
        const memory = new MemorySystem(tmpDir, {
          bankId: "test-bank",
        });
        memory.initialize();

        const hs = memory.getHindsight();
        expect(hs).toBeDefined();
        expect(hs).toBeInstanceOf(HindsightAdapter);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("MemorySystem works without hindsight", async () => {
      const { MemorySystem } = await import("../core/memory/memory-system");
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-hs-test-"));

      try {
        const memory = new MemorySystem(tmpDir);
        memory.initialize();

        const hs = memory.getHindsight();
        expect(hs).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("connectHindsight enables hindsight after construction", async () => {
      const { MemorySystem } = await import("../core/memory/memory-system");
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-hs-test-"));

      try {
        const memory = new MemorySystem(tmpDir);
        expect(memory.getHindsight()).toBeNull();

        memory.connectHindsight({ bankId: "late-connect" });
        expect(memory.getHindsight()).toBeInstanceOf(HindsightAdapter);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
