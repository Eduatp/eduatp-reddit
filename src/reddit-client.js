import { Buffer } from "node:buffer";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_ORIGIN = "https://oauth.reddit.com";
const RAW_TEXT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function fetchApplicationToken(config, fetchImpl = fetch) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
    },
    body: "grant_type=client_credentials",
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) throw new Error(`Reddit authentication failed (${response.status}).`);
  return payload.access_token;
}

export async function fetchSubredditDiscussions(options) {
  const {
    subreddit,
    allowedSubreddits,
    accessToken,
    userAgent,
    fetchImpl = fetch,
    limit = 6,
    collectedAt = new Date().toISOString(),
  } = options;
  const normalized = normalizeSubreddit(subreddit);
  const allowlist = new Set((allowedSubreddits ?? []).map(normalizeSubreddit));
  if (!allowlist.has(normalized)) throw new Error(`Subreddit is not approved by the configured allowlist: ${normalized}`);
  if (!accessToken) throw new Error("A Reddit access token is required.");
  if (!userAgent) throw new Error("A descriptive Reddit user agent is required.");

  const itemLimit = clamp(limit, 1, 12);
  const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": userAgent };
  const encoded = encodeURIComponent(normalized);
  const listings = await Promise.all([
    getJson(`${API_ORIGIN}/r/${encoded}/hot?limit=${Math.max(8, itemLimit)}&raw_json=1`, headers, fetchImpl),
    getJson(`${API_ORIGIN}/r/${encoded}/new?limit=${Math.max(6, itemLimit)}&raw_json=1`, headers, fetchImpl),
  ]);
  const posts = dedupe(
    listings.flatMap((listing) => listing?.data?.children ?? []).map((child) => child?.data).filter(isUsablePost),
    (post) => post.id,
  )
    .sort((left, right) => momentum(right) - momentum(left))
    .slice(0, itemLimit);

  const records = [];
  for (const post of posts) {
    const comments = await fetchTopComments({ subreddit: normalized, postId: post.id, headers, fetchImpl });
    records.push(normalizePost(post, comments, collectedAt));
  }
  return records;
}

export function isExpiredRecord(record, now = new Date()) {
  return !record?.expiresAt || Date.parse(record.expiresAt) <= now.getTime();
}

async function fetchTopComments({ subreddit, postId, headers, fetchImpl }) {
  try {
    const payload = await getJson(
      `${API_ORIGIN}/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(postId)}?limit=6&depth=1&sort=top&raw_json=1`,
      headers,
      fetchImpl,
    );
    return (payload?.[1]?.data?.children ?? [])
      .map((child) => child?.data)
      .filter((comment) => comment && usableText(comment.body))
      .slice(0, 4)
      .map((comment) => capText(comment.body, 500));
  } catch {
    return [];
  }
}

function normalizePost(post, comments, collectedAt) {
  const collectedTime = Number.isFinite(Date.parse(collectedAt)) ? Date.parse(collectedAt) : Date.now();
  const body = usableText(post.selftext) ? capText(post.selftext, 2_000) : "";
  return {
    externalId: String(post.id),
    title: capText(post.title, 300),
    permalink: `https://www.reddit.com${post.permalink}`,
    body,
    comments,
    publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
    metrics: {
      score: number(post.score),
      comments: number(post.num_comments),
      upvoteRatio: Number(post.upvote_ratio ?? 0),
    },
    thumbnailUrl: /^https:\/\//i.test(post.thumbnail ?? "") ? post.thumbnail : null,
    collectedAt: new Date(collectedTime).toISOString(),
    expiresAt: new Date(collectedTime + RAW_TEXT_RETENTION_MS).toISOString(),
  };
}

function isUsablePost(post) {
  return Boolean(post?.id && post?.title && post?.permalink && !post.removed_by_category && post.title !== "[deleted]");
}

function usableText(value) {
  const clean = String(value ?? "").trim();
  return Boolean(clean && clean !== "[deleted]" && clean !== "[removed]");
}

async function getJson(url, headers, fetchImpl) {
  const response = await fetchImpl(url, { headers });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(`Reddit request failed (${response.status}).`);
  return payload;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeSubreddit(value) {
  return String(value ?? "").trim().replace(/^r\//i, "").toLowerCase();
}

function momentum(post) {
  return number(post.score) + number(post.num_comments) * 3;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  const parsed = Math.trunc(Number(value));
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min));
}

function capText(value, max) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`;
}

function dedupe(items, keyFor) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
