import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy. A nonce lets Next's own inline scripts
 * run without `'unsafe-inline'` in script-src, so an injected script tag would
 * be refused. Next reads the nonce from the policy on the request headers and
 * stamps it on the scripts it renders, which is why the page renders per
 * request (see `connection()` in app/layout.tsx).
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React and Radix set inline style attributes, so style-src stays relaxed.
    "style-src 'self' 'unsafe-inline'",
    // Chat attachments are data: and blob: URLs. Remote images are never
    // loaded (model output cannot use them to send data to a third party).
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"])
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development"
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Documents only: API responses, build assets, and static files need no policy.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.svg|apple-touch-icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
