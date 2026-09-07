import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../../lib/paths.ts";
import type { AwsProvider, BucketEncryption, CloudTrailEvent, IamRolePolicy } from "./provider.ts";

export class FixtureAwsProvider implements AwsProvider {
  constructor(private readonly dir = join(repoRoot(), "fixtures", "aws")) {}

  async getCloudTrailEvents(): Promise<CloudTrailEvent[]> {
    const raw = JSON.parse(readFileSync(join(this.dir, "cloudtrail.json"), "utf8")) as { events: CloudTrailEvent[] };
    return raw.events;
  }

  async getIamRolePolicy(roleName: string): Promise<IamRolePolicy> {
    const raw = JSON.parse(readFileSync(join(this.dir, "iam-role-policy.json"), "utf8")) as IamRolePolicy;
    return { ...raw, role_name: roleName || raw.role_name };
  }

  async getBucketEncryption(bucket: string): Promise<BucketEncryption> {
    const raw = JSON.parse(readFileSync(join(this.dir, "bucket-encryption.json"), "utf8")) as BucketEncryption;
    return { ...raw, bucket: bucket || raw.bucket };
  }
}
