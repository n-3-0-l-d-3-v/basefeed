import { describe, expect, it } from "vitest";
import { urlProblem } from "./webhook-url";

const PROD = "https://feedback.example.com";

describe("webhook URLs", () => {
  it("accepts public https endpoints", () => {
    for (const url of ["https://hooks.slack.com/services/T0/B0/x", "https://n8n.example.com/webhook/abc", "https://hooks.zapier.com/hooks/catch/1/2/"])
      expect(urlProblem(url, PROD)).toBeNull();
  });

  it("refuses anything the server could use to reach private systems", () => {
    for (const url of [
      "http://example.com/hook", // not encrypted
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.10/hook",
      "https://172.20.0.1/hook",
      "https://169.254.169.254/latest/meta-data", // cloud metadata service
      "https://[::1]/hook",
      "https://db.internal/hook",
      "https://printer.local/hook",
      "ftp://example.com/hook",
      "not a url",
    ])
      expect(urlProblem(url, PROD), url).not.toBeNull();
  });

  it("lets a local app call localhost, and only a local app", () => {
    expect(urlProblem("http://localhost:4011/hook", "http://localhost:3000")).toBeNull();
    expect(urlProblem("http://localhost:4011/hook", PROD)).not.toBeNull();
    expect(urlProblem("http://10.0.0.5/hook", "http://localhost:3000")).not.toBeNull();
  });
});
