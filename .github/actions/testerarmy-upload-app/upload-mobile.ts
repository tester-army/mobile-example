import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  requireEnv,
  getEnv,
  setOutput,
  requestJson,
  handleMainError,
} from "../shared/github-actions-utils.ts";

const API_BASE = "https://tester.army/api/v1";

async function uploadBinary(uploadUrl: string, archivePath: string): Promise<void> {
  const blob = await fs.openAsBlob(archivePath, { type: "application/octet-stream" });
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: blob,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Storage upload failed with status ${response.status}\n${responseText}`,
    );
  }
}

function zipDirectory(appPath: string): string {
  const archivePath = path.join(
    os.tmpdir(),
    `${path.basename(appPath)}-${Math.floor(Math.random() * 100000)}.zip`,
  );

  const result = spawnSync("zip", ["-r", archivePath, path.basename(appPath)], {
    cwd: path.dirname(appPath),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`zip failed with exit code ${result.status ?? "unknown"}`);
  }

  return archivePath;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("API_KEY");
  const projectId = requireEnv("PROJECT_ID");
  const appPath = requireEnv("APP_PATH");
  const removeAfter = getEnv("REMOVE_AFTER", "3600");

  if (!fs.existsSync(appPath)) {
    throw new Error(`App path does not exist: ${appPath}`);
  }

  let archivePath = appPath;
  let archiveCreated = false;

  try {
    if (fs.statSync(appPath).isDirectory()) {
      archivePath = zipDirectory(appPath);
      archiveCreated = true;
    }

    const appName = path.basename(archivePath);
    const appSize = fs.statSync(archivePath).size;

    const initPayload: Record<string, unknown> = {
      filename: appName,
      fileSize: appSize,
    };

    if (removeAfter !== "0") {
      initPayload.removeAfter = Number(removeAfter);
    }

    const initResponse = await requestJson(
      `${API_BASE}/projects/${projectId}/mobile/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initPayload),
      },
    );

    const uploadUrl = String(initResponse.data.uploadUrl ?? "");
    const storageKey = String(initResponse.data.storageKey ?? "");

    if (!uploadUrl || !storageKey) {
      throw new Error(
        `Upload initiation response is missing uploadUrl or storageKey\n${JSON.stringify(initResponse.data, null, 2)}`,
      );
    }

    await uploadBinary(uploadUrl, archivePath);

    const confirmPayload: Record<string, unknown> = {
      storageKey,
      filename: appName,
      fileSize: appSize,
    };

    if (removeAfter !== "0") {
      confirmPayload.removeAfter = Number(removeAfter);
    }

    const confirmResponse = await requestJson(
      `${API_BASE}/projects/${projectId}/mobile/upload/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(confirmPayload),
      },
    );

    const appId = String(confirmResponse.data?.app?.id ?? "");
    if (!appId) {
      throw new Error(
        `Upload confirmation response did not include app.id\n${JSON.stringify(confirmResponse.data, null, 2)}`,
      );
    }

    setOutput("app_id", appId);
  } finally {
    if (archiveCreated && fs.existsSync(archivePath)) {
      fs.rmSync(archivePath, { force: true });
    }
  }
}

main().catch(handleMainError);
