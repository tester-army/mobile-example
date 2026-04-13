import * as fs from "node:fs";

import {
  getEnv,
  handleMainError,
  parseApiBase,
  requestJson,
  requireEnv,
  setOutput,
} from "../shared/github-actions-utils.ts";

type RunState = "passed" | "failed" | "pending";

interface RunEntry {
  id: string;
  featureName: string;
  status: string;
  result: string;
  state: RunState;
  duration: string;
  description: string;
  issues: unknown[];
  screenshots: unknown[];
}

function writeSummary(content: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  fs.writeFileSync(summaryPath, content);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeForTable(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

function formatDuration(durationMs: unknown): string {
  const value = Number(durationMs);
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }

  const totalSeconds = Math.floor(value / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

function issueText(issue: unknown): string {
  if (typeof issue === "string") {
    return issue;
  }

  if (issue && typeof issue === "object") {
    const obj = issue as Record<string, unknown>;
    for (const key of ["title", "message", "description", "summary"]) {
      if (typeof obj[key] === "string" && obj[key]) {
        return obj[key] as string;
      }
    }
    return JSON.stringify(obj);
  }

  return String(issue);
}

function screenshotUrl(screenshot: unknown): string | null {
  if (typeof screenshot === "string") {
    return screenshot;
  }

  if (screenshot && typeof screenshot === "object") {
    const obj = screenshot as Record<string, unknown>;
    for (const key of ["url", "src", "href"]) {
      if (typeof obj[key] === "string" && obj[key]) {
        return obj[key] as string;
      }
    }
  }

  return null;
}

function classifyRun(status: string, result: string): RunState {
  const pendingStatuses = ["queued", "pending", "running", "in_progress"];
  const failedStatuses = ["failed", "failure", "cancelled", "canceled", "error"];
  const completedStatuses = ["completed", "succeeded", "success", "passed"];
  const passResults = ["pass", "passed", "success", "succeeded"];

  if (pendingStatuses.includes(status)) {
    return "pending";
  }

  if (failedStatuses.includes(status)) {
    return "failed";
  }

  if (completedStatuses.includes(status)) {
    return passResults.includes(result) ? "passed" : "failed";
  }

  console.warn(`Unrecognized run status "${status}" (result: "${result}"), treating as pending`);
  return "pending";
}

function buildSummary(
  resolvedMobileAppId: string,
  overallStatus: string,
  runs: RunEntry[],
): string {
  const counts = runs.reduce(
    (acc, run) => {
      acc[run.state] += 1;
      return acc;
    },
    { passed: 0, failed: 0, pending: 0 } as Record<RunState, number>,
  );

  const lines: string[] = [
    "## TesterArmy Results",
    "",
    `**Overall:** \`${overallStatus}\`  `,
  ];

  if (resolvedMobileAppId) {
    lines.push(`**Resolved Mobile App ID:** \`${resolvedMobileAppId}\`  `);
  }

  lines.push(
    `**Runs:** \`${runs.length}\` total, \`${counts.passed}\` passed, \`${counts.failed}\` failed, \`${counts.pending}\` pending`,
    "",
    "| Test | Status | Result | Duration | Issues |",
    "| --- | --- | --- | --- | --- |",
  );

  for (const run of runs) {
    lines.push(
      `| ${sanitizeForTable(run.featureName)} | \`${run.status}\` | \`${run.result}\` | ${sanitizeForTable(run.duration)} | ${run.issues.length} |`,
    );
  }

  for (const run of runs) {
    lines.push("");
    lines.push("<details>");
    lines.push(
      `<summary><strong>${sanitizeForTable(run.featureName)}</strong> - ${run.result}</summary>`,
    );
    lines.push("");
    lines.push(`Run ID: \`${run.id}\`  `);
    lines.push(`Status: \`${run.status}\`  `);
    lines.push(`Result: \`${run.result}\`  `);
    lines.push(`Duration: \`${run.duration}\`  `);
    lines.push(`Issues: \`${run.issues.length}\``);
    lines.push("");

    if (run.description) {
      lines.push(run.description, "");
    }

    if (run.issues.length > 0) {
      lines.push("**Issues**", "");
      for (const issue of run.issues) {
        lines.push(`- ${issueText(issue)}`);
      }
      lines.push("");
    }

    const urls = run.screenshots
      .map((item) => screenshotUrl(item))
      .filter(Boolean) as string[];
    if (urls.length > 0) {
      lines.push("**Screenshots**", "");
      urls.forEach((url, index) => {
        lines.push(`- [Screenshot ${index + 1}](${url})`);
      });
      lines.push("");
    }

    lines.push("</details>");
  }

  return lines.join("\n");
}

async function fetchRunEntry(
  apiBase: string,
  apiKey: string,
  runId: string,
): Promise<RunEntry> {
  const runResponse = await requestJson(`${apiBase}/api/v1/runs/${runId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const payload = runResponse.data ?? {};
  const output = payload.output ?? {};
  const status = String(payload.status ?? "unknown").toLowerCase();
  const result = String(output.result ?? payload.result ?? "unknown").toLowerCase();
  const state = classifyRun(status, result);

  const issues = Array.isArray(output.issues) ? output.issues
    : Array.isArray(payload.issues) ? payload.issues
    : [];

  const screenshots = Array.isArray(output.screenshots) ? output.screenshots
    : Array.isArray(payload.screenshots) ? payload.screenshots
    : [];

  return {
    id: runId,
    featureName: String(output.featureName ?? payload.name ?? payload.id ?? "Unknown run"),
    status,
    result,
    state,
    duration: formatDuration(payload.durationMs),
    description: String(output.description ?? payload.description ?? "").trim(),
    issues,
    screenshots,
  };
}

async function main(): Promise<void> {
  const apiKey = requireEnv("TESTERARMY_API_KEY");
  const webhookUrl = requireEnv("TESTERARMY_WEBHOOK_URL");
  const websiteUrl = getEnv("TESTERARMY_WEBSITE_URL").trim();
  const appId = getEnv("TESTERARMY_APP_ID").trim();
  const commitSha = getEnv("TESTERARMY_COMMIT_SHA").trim();
  const pollIntervalSeconds = Number(getEnv("POLL_INTERVAL_SECONDS", "10"));
  const timeoutSeconds = Number(getEnv("TIMEOUT_SECONDS", "1800"));

  const requestPayload: Record<string, unknown> = {};
  if (commitSha) {
    requestPayload.commitSha = commitSha;
  }
  if (websiteUrl) {
    requestPayload.targetUrl = websiteUrl;
  }
  if (appId) {
    requestPayload.mobile = { appId };
  }

  let requestBody: string | undefined;
  const headers: HeadersInit = {};
  if (Object.keys(requestPayload).length > 0) {
    requestBody = JSON.stringify(requestPayload);
    headers["Content-Type"] = "application/json";
  }

  const triggerResponse = await requestJson(webhookUrl, {
    method: "POST",
    headers,
    body: requestBody,
  });

  const runIds = Array.isArray(triggerResponse.data.runIds)
    ? triggerResponse.data.runIds.map((value: unknown) => String(value))
    : [];

  if (runIds.length === 0) {
    throw new Error(
      `Webhook response did not include any run IDs\n${JSON.stringify(triggerResponse.data, null, 2)}`,
    );
  }

  const apiBase = parseApiBase(webhookUrl);
  setOutput("run_ids", JSON.stringify(runIds));

  const resolvedMobileAppId = String(
    triggerResponse.data?.metadata?.mobile?.resolvedAppId ?? appId ?? "",
  );

  const deadline = Date.now() + timeoutSeconds * 1000;

  while (true) {
    const runs = await Promise.all(
      runIds.map((runId: string) => fetchRunEntry(apiBase, apiKey, runId)),
    );

    const failedCount = runs.filter((run) => run.state === "failed").length;
    const pendingCount = runs.filter((run) => run.state === "pending").length;

    let overallStatus = "running";
    if (failedCount > 0) {
      overallStatus = "failed";
    } else if (pendingCount === 0) {
      overallStatus = "passed";
    }

    writeSummary(buildSummary(resolvedMobileAppId, overallStatus, runs));

    if (failedCount > 0) {
      setOutput("overall_status", overallStatus);
      throw new Error(
        `One or more TesterArmy runs failed\n${runs.map((run) => `${run.id}\t${run.status}\t${run.result}`).join("\n")}`,
      );
    }

    if (pendingCount === 0) {
      setOutput("overall_status", overallStatus);
      return;
    }

    if (Date.now() >= deadline) {
      setOutput("overall_status", "timed_out");
      throw new Error("Timed out waiting for TesterArmy runs to finish");
    }

    await sleep(pollIntervalSeconds * 1000);
  }
}

main().catch(handleMainError);
