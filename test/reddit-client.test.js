import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, parseAllowedSubreddits } from "../src/config.js";
import { fetchApplicationToken, fetchSubredditDiscussions, isExpiredRecord } from "../src/reddit-client.js";

test("configuration requires credentials and contains no default sources", () => {
  assert.deepEqual(parseAllowedSubreddits(""), []);
  assert.throws(() => loadConfig({}), /REDDIT_CLIENT_ID/);
  const config = loadConfig({
    REDDIT_CLIENT_ID: "example-id",
    REDDIT_CLIENT_SECRET: "example-secret",
    REDDIT_USER_AGENT: "example-review-client/0.1",
    REDDIT_ALLOWED_SUBREDDITS: "ExampleCommunity,r/SecondCommunity",
  });
  assert.deepEqual(config.allowedSubreddits, ["examplecommunity", "secondcommunity"]);
});

test("token credentials are supplied at runtime", async () => {
  const requests = [];
  const token = await fetchApplicationToken(
    { clientId: "example-id", clientSecret: "example-secret", userAgent: "example-review-client/0.1" },
    async (url, init) => {
      requests.push({ url, init });
      return response({ access_token: "synthetic-token" });
    },
  );
  assert.equal(token, "synthetic-token");
  assert.equal(requests[0].url, "https://www.reddit.com/api/v1/access_token");
  assert.match(requests[0].init.headers.Authorization, /^Basic /);
});

test("read-only collection is allowlisted, bounded, minimized, and expiring", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/comments/")) {
      return response([
        {},
        { data: { children: [{ data: { body: "Useful public context without an author field." } }] } },
      ]);
    }
    return response({
      data: {
        children: [{
          data: {
            id: "post-1",
            title: "Example public discussion",
            selftext: "A synthetic post body used only by the offline test.",
            permalink: "/r/ExampleCommunity/comments/post-1/example/",
            created_utc: 1_787_486_400,
            score: 42,
            num_comments: 12,
            upvote_ratio: 0.9,
          },
        }],
      },
    });
  };

  const records = await fetchSubredditDiscussions({
    subreddit: "ExampleCommunity",
    allowedSubreddits: ["examplecommunity"],
    accessToken: "synthetic-token",
    userAgent: "example-review-client/0.1",
    fetchImpl,
    collectedAt: "2026-08-31T12:00:00.000Z",
  });

  assert.equal(calls.length, 3);
  assert.equal(records.length, 1);
  assert.equal(records[0].comments.length, 1);
  assert.equal("author" in records[0], false);
  assert.equal(records[0].expiresAt, "2026-09-30T12:00:00.000Z");
  assert.equal(isExpiredRecord(records[0], new Date("2026-10-01T00:00:00.000Z")), true);
});

test("unapproved communities are rejected before any request", async () => {
  let called = false;
  await assert.rejects(
    fetchSubredditDiscussions({
      subreddit: "NotApproved",
      allowedSubreddits: ["examplecommunity"],
      accessToken: "synthetic-token",
      userAgent: "example-review-client/0.1",
      fetchImpl: async () => { called = true; return response({}); },
    }),
    /not approved/,
  );
  assert.equal(called, false);
});

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
