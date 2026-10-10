import { describe, expect, it } from "vitest";
import { jobKey, newJobs } from "./queue-insert";

describe("newJobs", () => {
  const a = { kind: "creator_discover", platform: "tiktok", target: "fitness" };
  const b = { kind: "creator_discover", platform: "tiktok", target: "beauty" };
  it("skips live jobs and repeats, keeps order", () => {
    expect(newJobs([a, b, a], new Set([jobKey(b)]))).toEqual([a]);
  });
  it("treats platforms apart", () => {
    const yt = { ...a, platform: "youtube" };
    expect(newJobs([a, yt], new Set())).toEqual([a, yt]);
  });
});
