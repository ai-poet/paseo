import { describe, expect, it } from "vitest";
import { buildPayApiUrl, buildPayCenterUrl } from "./sub2api-pay-url";

describe("sub2api-pay-url", () => {
  it("builds the pay center URL under /pay", () => {
    expect(buildPayCenterUrl("https://ai-coding.cyberspirit.io", "token-123")).toBe(
      "https://ai-coding.cyberspirit.io/pay?token=token-123&theme=dark&ui_mode=embedded&lang=en",
    );
  });

  it("routes payment API calls through /pay/api", () => {
    expect(
      buildPayApiUrl(
        "https://ai-coding.cyberspirit.io",
        "/api/orders/my?token=abc&page=1&page_size=20",
      ),
    ).toBe("https://ai-coding.cyberspirit.io/pay/api/orders/my?token=abc&page=1&page_size=20");
  });
});
