import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Auth primitives for the local notification/hook HTTP server, kept free of
 * Electron/DB imports so they can be unit-tested under `bun test`.
 */

/**
 * Whether the Host header points at loopback. Blunts DNS-rebinding: a malicious
 * page resolving an attacker domain to 127.0.0.1 still sends its own Host header,
 * which we reject. The server only binds 127.0.0.1, so legitimate callers always
 * send `127.0.0.1[:port]` or `localhost[:port]`.
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
	if (!hostHeader) return false;
	// Strip the optional :port (IPv6 literals aren't used here — we bind IPv4).
	const host = hostHeader.split(":")[0].trim().toLowerCase();
	return host === "127.0.0.1" || host === "localhost";
}

/**
 * Constant-time comparison of the presented token against the expected token.
 * Length-guarded because timingSafeEqual throws on differing buffer lengths.
 */
export function tokensMatch(
	provided: string | undefined,
	expected: string,
): boolean {
	if (!provided) return false;
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Express middleware that gates the notification server:
 *   1. Reject non-loopback Host headers (DNS-rebinding guard) → 403.
 *   2. GET /health is unauthenticated (liveness probe only, leaks nothing).
 *   3. Every other endpoint requires the x-roster-token header → 401 on
 *      missing/mismatch, compared in constant time.
 *
 * This is a local, non-browser RPC surface, so there is intentionally no CORS:
 * we omit Access-Control-Allow-Origin entirely and require the shared secret.
 */
export function createNotificationAuthMiddleware(getToken: () => string) {
	return (req: Request, res: Response, next: NextFunction) => {
		if (!isLoopbackHost(req.headers.host)) {
			return res.status(403).json({ error: "Forbidden host" });
		}

		if (req.method === "GET" && req.path === "/health") {
			return next();
		}

		if (!tokensMatch(req.header("x-roster-token"), getToken())) {
			return res.status(401).json({ error: "Unauthorized" });
		}

		next();
	};
}
