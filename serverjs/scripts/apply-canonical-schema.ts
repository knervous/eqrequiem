import { applyCanonicalContentSchema, applyCanonicalRuntimeSchema } from "../src/db/canonical-schema.js";
import { createNodeDatabase } from "../src/db/node/factory.js";

const content = createNodeDatabase(process.env.CONTENT_DATABASE_URL ?? "sqlite:./data/content-db.sqlite");
const runtime = createNodeDatabase(process.env.RUNTIME_DATABASE_URL ?? "sqlite:./data/runtime-db.sqlite");

try {
  await applyCanonicalContentSchema(content);
  await applyCanonicalRuntimeSchema(runtime);
  console.log("Canonical content/runtime schema is current");
} finally {
  await Promise.all([content.close(), runtime.close()]);
}
