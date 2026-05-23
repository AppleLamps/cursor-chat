import type { SDKImage } from "@cursor/sdk";

const CURSOR_API_BASE = "https://api.cursor.com";

type CloudApiErrorBody = {
  error?: {
    message?: string;
    code?: string;
  };
};

export type CloudAgentMode = "agent" | "plan";

export type CreateCloudAgentParams = {
  apiKey: string;
  promptText: string;
  images?: SDKImage[];
  instructions: string;
  mode?: CloudAgentMode;
  modelId: string;
  repoUrl: string;
  branch: string;
};

export type CreateCloudAgentResult = {
  agentId: string;
  runId: string;
};

function basicAuthHeader(apiKey: string) {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function mapImages(images?: SDKImage[]) {
  if (!images?.length) return undefined;

  return images.map((image) =>
    "url" in image
      ? { url: image.url, dimension: image.dimension }
      : { data: image.data, mimeType: image.mimeType, dimension: image.dimension }
  );
}

async function parseCloudApiError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as CloudApiErrorBody;
  const message =
    body.error?.message ||
    `Cursor API request failed with status ${response.status}.`;
  const code = body.error?.code;

  return code ? `[${code}] ${message}` : message;
}

export async function createCloudAgentRun({
  apiKey,
  promptText,
  images,
  instructions,
  mode = "plan",
  modelId,
  repoUrl,
  branch
}: CreateCloudAgentParams): Promise<CreateCloudAgentResult> {
  const prompt = {
    text: promptText,
    ...(mapImages(images) ? { images: mapImages(images) } : {})
  };

  const createBody = (includeInstructions: boolean) => ({
    prompt: includeInstructions
      ? prompt
      : {
          text: `${instructions}\n\n---\n\nUser question:\n${promptText}`,
          ...(mapImages(images) ? { images: mapImages(images) } : {})
        },
    ...(includeInstructions ? { instructions } : {}),
    mode,
    model: { id: modelId },
    repos: [{ url: repoUrl, startingRef: branch }],
    skipReviewerRequest: true
  });

  let response = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createBody(true))
  });

  if (!response.ok && response.status === 400) {
    response = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(apiKey),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createBody(false))
    });
  }

  if (!response.ok) {
    throw new Error(await parseCloudApiError(response));
  }

  const payload = (await response.json()) as {
    agent?: { id?: string };
    run?: { id?: string };
  };

  const agentId = payload.agent?.id?.trim();
  const runId = payload.run?.id?.trim();

  if (!agentId || !runId) {
    throw new Error("Cursor API returned an incomplete agent response.");
  }

  return { agentId, runId };
}
