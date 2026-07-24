import { env } from "../db";

type MetadataToken = {
  access_token?: string;
};

export function isProcessorJobConfigured() {
  return Boolean(env.GCP_PROJECT_ID && env.GCP_REGION && env.GCP_PROCESSOR_JOB_NAME);
}

export async function triggerProcessorJob() {
  if (!isProcessorJobConfigured()) {
    return { triggered: false, reason: "not_configured" } as const;
  }

  const tokenResponse = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!tokenResponse.ok) {
    throw new Error(`Could not obtain Cloud Run service token (${tokenResponse.status}).`);
  }

  const token = (await tokenResponse.json()) as MetadataToken;
  if (!token.access_token) throw new Error("Cloud Run service token was empty.");

  const jobName = encodeURIComponent(env.GCP_PROCESSOR_JOB_NAME!);
  const response = await fetch(
    `https://run.googleapis.com/v2/projects/${env.GCP_PROJECT_ID}/locations/${env.GCP_REGION}/jobs/${jobName}:run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Could not start processor job (${response.status}): ${body}`);
  }

  const operation = (await response.json()) as { name?: string };
  return { triggered: true, operationName: operation.name ?? null } as const;
}
