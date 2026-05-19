import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
} from "../core/storage/storage-adapter";

describe("InMemoryStorageAdapter", () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  it("stores and retrieves values", async () => {
    await adapter.set("key1", "value1");
    expect(await adapter.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", async () => {
    expect(await adapter.get("missing")).toBeUndefined();
  });

  it("deletes keys", async () => {
    await adapter.set("key1", "value1");
    expect(await adapter.delete("key1")).toBe(true);
    expect(await adapter.get("key1")).toBeUndefined();
  });

  it("checks key existence", async () => {
    await adapter.set("exists", "yes");
    expect(await adapter.has("exists")).toBe(true);
    expect(await adapter.has("nope")).toBe(false);
  });

  it("lists keys by prefix", async () => {
    await adapter.set("user:1", "a");
    await adapter.set("user:2", "b");
    await adapter.set("order:1", "c");
    const keys = await adapter.listKeys("user:");
    expect(keys).toHaveLength(2);
    expect(keys).toContain("user:1");
    expect(keys).toContain("user:2");
  });

  it("respects TTL", async () => {
    await adapter.set("ttl-key", "val", 1);
    expect(await adapter.get("ttl-key")).toBe("val");
    await new Promise((r) => setTimeout(r, 10));
    expect(await adapter.get("ttl-key")).toBeUndefined();
  });

  it("health check always returns true", async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });
});

describe("FileStorageAdapter", () => {
  let tmpDir: string;
  let adapter: FileStorageAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-storage-"));
    adapter = new FileStorageAdapter(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores and retrieves values", async () => {
    await adapter.set("test-key", "test-value");
    expect(await adapter.get("test-key")).toBe("test-value");
  });

  it("creates nested directories", async () => {
    await adapter.set("sub/dir/key", "nested-value");
    expect(await adapter.get("sub/dir/key")).toBe("nested-value");
  });

  it("returns undefined for missing keys", async () => {
    expect(await adapter.get("nope")).toBeUndefined();
  });

  it("deletes keys", async () => {
    await adapter.set("del-key", "val");
    expect(await adapter.delete("del-key")).toBe(true);
    expect(await adapter.get("del-key")).toBeUndefined();
  });

  it("checks key existence", async () => {
    await adapter.set("check-key", "val");
    expect(await adapter.has("check-key")).toBe(true);
    expect(await adapter.has("missing")).toBe(false);
  });

  it("health check returns true for existing directory", async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it("health check returns false for non-existing directory", async () => {
    const badAdapter = new FileStorageAdapter("/nonexistent/path/12345");
    expect(await badAdapter.healthCheck()).toBe(false);
  });
});
