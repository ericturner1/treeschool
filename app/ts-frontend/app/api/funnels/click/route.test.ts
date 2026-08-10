import { describe, expect, test } from "bun:test";
import { getPublicAppOrigin } from "../../../../lib/security/public-origin";
import { GET } from "./route";

const attribution = JSON.stringify({
  funnelId: "1d49f7fd-7137-43a4-aa0e-1db0e74a6ca8",
  funnelSlug: "first-time-homeschooler",
  stepId: "c0db33f4-a0d7-4a16-9d36-663bf1a275a7",
  pageId: "43437522-9526-4c63-bcc7-933a66d947e8",
  revisionNumber: 1,
  visitorId: "177601a9-513d-4ecd-82ff-1b3976f2ecc7",
  experimentId: null,
  experimentVariantId: null
});

function request(target: string) {
  const query = new URLSearchParams({ target, attribution });
  return new Request(`http://0.0.0.0:3100/api/funnels/click?${query}`, {
    headers: {
      host: "0.0.0.0:3100",
      "x-forwarded-host": "dev.treehomeschool.com",
      "x-forwarded-proto": "https"
    }
  });
}

describe("managed funnel click redirect", () => {
  test("does not trust forwarded hosts for first-party destinations", () => {
    const input = request("/pricing");
    const response = GET(input);

    expect(response.headers.get("location")).toBe(
      `${getPublicAppOrigin(input.url)}/pricing`
    );
    expect(response.cookies.get("treeschool_funnel_attribution")?.value).toBeTruthy();
  });

  test("rejects untrusted redirect destinations", () => {
    const input = request("https://example.invalid/steal");
    const response = GET(input);

    expect(response.headers.get("location")).toBe(
      `${getPublicAppOrigin(input.url)}/`
    );
  });
});
