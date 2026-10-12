declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FAMILY_PASSWORD?: string;
    FAMILY_SESSION_SECRET?: string;
  }
}
