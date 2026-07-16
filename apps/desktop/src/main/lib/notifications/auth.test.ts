import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import {
	createNotificationAuthMiddleware,
	isLoopbackHost,
	tokensMatch,
} from "./auth";

describe("notifications/auth", () => {
	describe("isLoopbackHost", () => {
		it("accepts 127.0.0.1 with and without a port", () => {
			expect(isLoopbackHost("127.0.0.1")).toBe(true);
			expect(isLoopbackHost("127.0.0.1:8123")).toBe(true);
		});

		it("accepts localhost (case-insensitive) with and without a port", () => {
			expect(isLoopbackHost("localhost")).toBe(true);
			expect(isLoopbackHost("localhost:9000")).toBe(true);
			expect(isLoopbackHost("LOCALHOST:9000")).toBe(true);
		});

		it("rejects non-loopback and missing hosts (DNS-rebinding guard)", () => {
			expect(isLoopbackHost(undefined)).toBe(false);
			expect(isLoopbackHost("")).toBe(false);
			expect(isLoopbackHost("evil.com")).toBe(false);
			expect(isLoopbackHost("evil.com:8123")).toBe(false);
			expect(isLoopbackHost("192.168.1.10")).toBe(false);
		});
	});

	describe("tokensMatch", () => {
		const token = "a".repeat(64);

		it("returns true only for an exact match", () => {
			expect(tokensMatch(token, token)).toBe(true);
		});

		it("returns false for mismatches, wrong length, and missing token", () => {
			expect(tokensMatch("b".repeat(64), token)).toBe(false);
			expect(tokensMatch("short", token)).toBe(false);
			expect(tokensMatch(undefined, token)).toBe(false);
			expect(tokensMatch("", token)).toBe(false);
		});
	});

	describe("createNotificationAuthMiddleware", () => {
		const TOKEN = "f".repeat(64);
		let baseUrl: string;
		let port: number;
		let server: ReturnType<express.Express["listen"]>;

		// node:http lets us spoof the Host header (the Fetch API forbids it), which
		// is exactly what the DNS-rebinding guard defends against.
		function statusWithHost(
			path: string,
			host: string,
			headers: Record<string, string> = {},
		): Promise<number> {
			return new Promise((resolve, reject) => {
				const req = request(
					{
						host: "127.0.0.1",
						port,
						path,
						method: "GET",
						headers: { host, ...headers },
					},
					(res) => {
						res.resume();
						resolve(res.statusCode ?? 0);
					},
				);
				req.on("error", reject);
				req.end();
			});
		}

		beforeAll(async () => {
			const app = express();
			app.use(createNotificationAuthMiddleware(() => TOKEN));
			app.get("/health", (_req, res) => res.json({ status: "ok" }));
			app.get("/hook/complete", (_req, res) => res.json({ success: true }));
			app.post("/agent/invoke", (_req, res) => res.json({ success: true }));

			await new Promise<void>((resolve) => {
				server = app.listen(0, "127.0.0.1", () => resolve());
			});
			port = (server.address() as AddressInfo).port;
			baseUrl = `http://127.0.0.1:${port}`;
		});

		afterAll(() => {
			server.close();
		});

		it("allows GET /health without a token", async () => {
			const res = await fetch(`${baseUrl}/health`);
			expect(res.status).toBe(200);
		});

		it("rejects a protected endpoint when the token is missing", async () => {
			const res = await fetch(`${baseUrl}/hook/complete`);
			expect(res.status).toBe(401);
		});

		it("rejects a protected endpoint when the token is wrong", async () => {
			const res = await fetch(`${baseUrl}/agent/invoke`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-roster-token": "wrong",
				},
				body: "{}",
			});
			expect(res.status).toBe(401);
		});

		it("accepts a protected endpoint with the correct token", async () => {
			const res = await fetch(`${baseUrl}/hook/complete`, {
				headers: { "x-roster-token": TOKEN },
			});
			expect(res.status).toBe(200);
		});

		it("allows a loopback Host header (sanity for the http helper)", async () => {
			expect(
				await statusWithHost("/hook/complete", "127.0.0.1", {
					"x-roster-token": TOKEN,
				}),
			).toBe(200);
		});

		it("rejects a non-loopback Host header with 403 even with a valid token", async () => {
			expect(
				await statusWithHost("/hook/complete", "evil.com", {
					"x-roster-token": TOKEN,
				}),
			).toBe(403);
		});
	});
});
