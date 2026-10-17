/**
 * Fetching an address a person typed, from our own server, without letting it reach our network.
 *
 * Whoever supplies a URL controls where the server connects, and the server can reach places the
 * person cannot: the database host, cloud metadata endpoints, anything on a private network. An
 * unguarded fetch of a user's URL is therefore a way to read those. This refuses them, and it
 * refuses them *at the moment of connecting* rather than only by looking the name up beforehand —
 * a hostname can answer one address to a check and another to the connection that follows, which
 * is how a pre-check is walked around. Every redirect is held to the same rules, because an
 * allowed address that redirects to a forbidden one is the oldest trick there is.
 *
 * It also bounds what it will read: a few seconds, a couple of megabytes, text and data types
 * only. Nothing it fetches is executed or rendered here; it is returned as a string to be parsed.
 */

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/** An address on a private, loopback, link-local, reserved or otherwise internal range. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);

  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;

    /* An IPv4 address wearing an IPv6 coat is judged as the IPv4 address it is. */
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]+:[0-9a-f]+$/.test(lower)) return true;

    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (lower.startsWith("64:ff9b:")) return true; // NAT64: can embed a private IPv4
    return false;
  }

  /* Not an address at all. Refuse rather than guess. */
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; message: string };

/** The rules that can be decided from the text of the address alone. */
export function checkUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: "That is not a web address." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, message: "Only http and https addresses can be fetched." };

  /* An address with a name and password in it is a way to smuggle one host inside another's name. */
  if (url.username || url.password)
    return { ok: false, message: "Addresses with a username or password in them are not allowed." };

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) return { ok: false, message: "That port cannot be fetched." };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local"))
    return { ok: false, message: "That address is not on the public internet." };

  if (net.isIP(host) && isPrivateAddress(host))
    return { ok: false, message: "That address is not on the public internet." };

  return { ok: true, url };
}

/** What a connection may resolve to. Runs for every connection, including each redirect's. */
const safeLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void,
) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address)))
      return callback(new Error("That address is not on the public internet."), "", 0);
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as unknown as net.LookupFunction;

const TEXT_TYPES = /^(text\/|application\/(json|csv|xml|xhtml\+xml|vnd\.ms-excel)|application\/x-(csv|tsv))/i;

export interface Fetched {
  text: string;
  contentType: string;
  finalUrl: string;
}

export class FetchRefused extends Error {}

function once(url: URL): Promise<{ status: number; location: string | null; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;

    const request = client.request(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": "BlufyTournamentOS/1.0 (+results import)",
          Accept: "text/html,text/csv,text/plain,application/json;q=0.9,*/*;q=0.1",
          /* Plain bytes, so there is nothing to decompress and no decompression bomb to defuse. */
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = typeof response.headers.location === "string" ? response.headers.location : null;
        const contentType = String(response.headers["content-type"] ?? "");

        if (status >= 300 && status < 400 && location) {
          response.resume();
          resolve({ status, location, contentType, body: Buffer.alloc(0) });
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          reject(new FetchRefused(`The source answered ${status}.`));
          return;
        }

        if (contentType && !TEXT_TYPES.test(contentType)) {
          response.resume();
          reject(new FetchRefused("That address does not serve a table or text. Only HTML, CSV, TSV, JSON and plain text can be read."));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BYTES) {
            request.destroy(new FetchRefused("That page is larger than 2 MB, which is more than a results table needs."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, location: null, contentType, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      },
    );

    request.on("timeout", () => request.destroy(new FetchRefused("The source took too long to answer.")));
    request.on("error", (error) => reject(error));
    request.end();
  });
}

/** Fetches text from a public address, following a few redirects and checking every one. */
export async function safeFetchText(raw: string): Promise<Fetched> {
  let current = checkUrl(raw);
  if (!current.ok) throw new FetchRefused(current.message);
  let url = current.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await once(url);

    if (result.location) {
      let next: URL;
      try {
        next = new URL(result.location, url);
      } catch {
        throw new FetchRefused("The source redirected to an address that is not valid.");
      }
      current = checkUrl(next.toString());
      if (!current.ok) throw new FetchRefused(current.message);
      url = current.url;
      continue;
    }

    return {
      text: result.body.toString("utf8"),
      contentType: result.contentType,
      finalUrl: url.toString(),
    };
  }

  throw new FetchRefused("The source redirected too many times.");
}
