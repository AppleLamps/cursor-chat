import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AgentMode, ModelId } from "@/lib/defaults";

const CONFIGURED_SIGNING_SECRET =
  process.env.ASKCURSOR_AGENT_SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET;

if (!CONFIGURED_SIGNING_SECRET?.trim() && process.env.NODE_ENV === "production") {
  throw new Error(
    "ASKCURSOR_AGENT_SESSION_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be set in production."
  );
}

const SIGNING_SECRET =
  CONFIGURED_SIGNING_SECRET?.trim() || randomBytes(32).toString("hex");

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

type AgentSessionClaims = {
  v: 1;
  agentId: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  modelId: ModelId;
  apiKeyHash: string;
  expiresAt: number;
};

export type AgentSessionContext = {
  agentId: string;
  repoUrl: string;
  branch: string;
  agentMode: AgentMode;
  modelId: ModelId;
  apiKey: string;
};

function normalizeString(value: string) {
  return value.trim();
}

function normalizeRepoUrl(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function normalizeBranch(value: string) {
  return value.trim();
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", SIGNING_SECRET).update(payload).digest("base64url");
}

function apiKeyHash(apiKey: string) {
  return createHash("sha256").update(apiKey.trim()).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) return false;

  return timingSafeEqual(aBuffer, bBuffer);
}

export function createAgentSessionToken(
  context: AgentSessionContext,
  ttlMs = DEFAULT_SESSION_TTL_MS
) {
  const claims: AgentSessionClaims = {
    v: 1,
    agentId: normalizeString(context.agentId),
    repoUrl: normalizeRepoUrl(context.repoUrl),
    branch: normalizeBranch(context.branch),
    agentMode: context.agentMode,
    modelId: context.modelId,
    apiKeyHash: apiKeyHash(context.apiKey),
    expiresAt: Date.now() + ttlMs
  };
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifyAgentSessionToken(
  token: string | undefined,
  expected: AgentSessionContext
) {
  if (!token?.trim()) {
    return { valid: false as const, reason: "Missing agent session token." };
  }

  const [payload, signature] = token.trim().split(".");

  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) {
    return { valid: false as const, reason: "Invalid agent session token." };
  }

  let claims: AgentSessionClaims;

  try {
    claims = JSON.parse(base64UrlDecode(payload)) as AgentSessionClaims;
  } catch {
    return { valid: false as const, reason: "Invalid agent session token." };
  }

  if (claims.v !== 1 || Date.now() > claims.expiresAt) {
    return { valid: false as const, reason: "Expired agent session token." };
  }

  const expectedClaims = {
    agentId: normalizeString(expected.agentId),
    repoUrl: normalizeRepoUrl(expected.repoUrl),
    branch: normalizeBranch(expected.branch),
    agentMode: expected.agentMode,
    modelId: expected.modelId,
    apiKeyHash: apiKeyHash(expected.apiKey)
  };

  if (
    claims.agentId !== expectedClaims.agentId ||
    claims.repoUrl !== expectedClaims.repoUrl ||
    claims.branch !== expectedClaims.branch ||
    claims.agentMode !== expectedClaims.agentMode ||
    claims.modelId !== expectedClaims.modelId ||
    claims.apiKeyHash !== expectedClaims.apiKeyHash
  ) {
    return {
      valid: false as const,
      reason: "Agent session token does not match this request."
    };
  }

  return { valid: true as const };
}
