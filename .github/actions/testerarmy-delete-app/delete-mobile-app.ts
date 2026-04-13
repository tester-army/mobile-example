import {
  requireEnv,
  parseApiBase,
  handleMainError,
} from "../shared/github-actions-utils.ts";

async function main(): Promise<void> {
  const apiKey = requireEnv("TESTERARMY_API_KEY");
  const projectId = requireEnv("TESTERARMY_PROJECT_ID");
  const webhookUrl = requireEnv("TESTERARMY_WEBHOOK_URL");
  const appId = requireEnv("TESTERARMY_APP_ID");

  const apiBase = parseApiBase(webhookUrl);

  const response = await fetch(
    `${apiBase}/api/v1/projects/${projectId}/mobile/${appId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Failed to delete TesterArmy app ${appId} with status ${response.status}\n${responseText}`,
    );
  }
}

main().catch(handleMainError);
