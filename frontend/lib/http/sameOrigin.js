// Reject cross-site browser POSTs (a present-but-mismatched Origin); same-origin
// requests and non-browser tooling (no Origin header) are allowed.
//
// Compare HOSTS, not full origins: behind a reverse proxy / ingress (e.g. Kanopy)
// TLS is terminated at the edge, so the browser's Origin is the public https host
// while the pod sees an internal http host — full-origin comparison would never
// match. The proxy rewrites the forwarded host, so prefer `x-forwarded-host`.
export function sameOriginOk(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
