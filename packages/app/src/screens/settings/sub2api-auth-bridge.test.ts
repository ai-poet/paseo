import { describe, expect, it } from "vitest";
import {
  buildSub2APILoginBridgeUrl,
  isValidSub2APIEndpoint,
  parseSub2APIAuthCallback,
} from "./sub2api-auth-bridge";

describe("sub2api-auth-bridge", () => {
  it("builds the web auth bridge url from the configured endpoint", () => {
    expect(buildSub2APILoginBridgeUrl("https://api.example.com/")).toBe(
      "https://api.example.com/auth/paseo?endpoint=https%3A%2F%2Fapi.example.com",
    );
  });

  it("parses tokens, api key, and endpoint from the paseo callback url", () => {
    expect(
      parseSub2APIAuthCallback(
        "paseo://auth/callback#access_token=access&refresh_token=refresh&expires_in=300&api_key=sk-test&endpoint=https%3A%2F%2Fapi.example.com%2F",
      ),
    ).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 300,
      apiKey: "sk-test",
      endpoint: "https://api.example.com",
    });
  });

  it("rejects invalid endpoint formats", () => {
    expect(isValidSub2APIEndpoint("")).toBe(false);
    expect(isValidSub2APIEndpoint("api.example.com")).toBe(false);
    expect(isValidSub2APIEndpoint("ftp://api.example.com")).toBe(false);
    expect(() => buildSub2APILoginBridgeUrl("api.example.com")).toThrow();
  });
});
