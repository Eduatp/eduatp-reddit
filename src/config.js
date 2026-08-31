const SUBREDDIT_NAME = /^[A-Za-z0-9_]{2,21}$/;

export function loadConfig(env = process.env) {
  return {
    clientId: required(env.REDDIT_CLIENT_ID, "REDDIT_CLIENT_ID"),
    clientSecret: required(env.REDDIT_CLIENT_SECRET, "REDDIT_CLIENT_SECRET"),
    userAgent: required(env.REDDIT_USER_AGENT, "REDDIT_USER_AGENT"),
    allowedSubreddits: parseAllowedSubreddits(env.REDDIT_ALLOWED_SUBREDDITS),
  };
}

export function parseAllowedSubreddits(value) {
  const names = String(value ?? "")
    .split(",")
    .map((name) => name.trim().replace(/^r\//i, ""))
    .filter(Boolean);

  for (const name of names) {
    if (!SUBREDDIT_NAME.test(name)) throw new Error(`Invalid subreddit name: ${name}`);
  }
  return Object.freeze([...new Set(names.map((name) => name.toLowerCase()))]);
}

function required(value, name) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`${name} is required.`);
  return clean;
}
