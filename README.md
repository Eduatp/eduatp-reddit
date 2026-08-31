# EduATP Reddit Integration Review

This repository-sized package is a sanitized review extract for Reddit's Data API approval process. It demonstrates the limited, read-only Reddit module planned for EduATP Creator OS without exposing the private application, source catalog, credentials, collected data, or unrelated integrations.

API access is disabled until Reddit grants explicit approval. The authentication flow and scopes must be adjusted if Reddit's approval specifies a different credential method.

## Intended use

- Perform low-volume checks of an explicitly configured subreddit allowlist.
- Read a bounded number of `hot` and `new` public posts.
- Read a bounded number of top-level comments for selected posts.
- Normalize only the fields needed for private, human-reviewed editorial research.
- Preserve the original Reddit permalink for attribution and review.
- Expire raw text after 30 days and support deletion revalidation before production use.

The module does not vote, post, comment, message users, moderate communities, access private data, create advertising profiles, sell data, or train/fine-tune machine-learning models. Future Reddit publishing is not implemented here and would require separate approved user authorization plus an explicit human confirmation step.

## Data minimized by the module

For a post, the module returns the Reddit post ID, title, permalink, public body text, publication time, public engagement counts, a thumbnail URL when present, and up to four selected public comment excerpts. Reddit usernames are intentionally omitted.

Raw text records receive an `expiresAt` value 30 days after collection. `isExpiredRecord()` is provided so the host can remove expired records. A production deployment must also periodically re-fetch retained IDs and remove content Reddit reports as deleted or removed.

## Request boundaries

- Default accepted records per subreddit: 6
- Hard maximum accepted records per subreddit: 12
- Listing endpoints: `hot` and `new`
- Comment request: top-level only, depth 1, maximum 6 returned and 4 retained
- Authentication: environment variables only
- Subreddits: environment-configured allowlist only; this package contains no production watchlist

## Configuration

Create a local `.env` outside version control or supply the variables through the host environment:

```text
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=
REDDIT_ALLOWED_SUBREDDITS=
```

`REDDIT_ALLOWED_SUBREDDITS` is a comma-separated allowlist. No subreddit is enabled by default.

## Verification

The tests use synthetic Reddit-shaped responses and fake credentials. They never call Reddit:

```bash
npm test
```

## Security

Do not commit tokens, `.env`, API responses, databases, production logs, or exports of Reddit content. This review package has no dependency on the private Creator OS repository and should be published from a new Git repository with clean history.
