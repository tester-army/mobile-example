import * as fs from "node:fs";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is not available");
  }
  fs.appendFileSync(outputPath, `${name}=${value}\n`);
}

export async function requestJson(
  url: string,
  init: RequestInit,
): Promise<{ data: any; status: number }> {
  const response = await fetch(url, init);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed with status ${response.status}\n${responseText}`,
    );
  }

  let data: any = {};
  try {
    if (responseText) {
      data = JSON.parse(responseText);
    }
  } catch {
    throw new Error(
      `Failed to parse JSON response from ${url}\n${responseText}`,
    );
  }

  return { data, status: response.status };
}

export function parseApiBase(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

export function handleMainError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
