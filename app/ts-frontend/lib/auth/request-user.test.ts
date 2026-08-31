import { describe, expect, test } from "bun:test";
import { getBearerToken } from "./request-user";

describe("mobile bearer authentication", () => {
  test("reads a bearer access token", () => {
    const request = new Request("https://www.treehomeschool.com/api/mobile/day", {
      headers: { Authorization: "Bearer access-token" },
    });

    expect(getBearerToken(request)).toBe("access-token");
  });

  test("does not accept another authorization scheme", () => {
    const request = new Request("https://www.treehomeschool.com/api/mobile/day", {
      headers: { Authorization: "Basic credentials" },
    });

    expect(getBearerToken(request)).toBeNull();
  });
});
