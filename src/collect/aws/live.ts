import type { AwsProvider, BucketEncryption, CloudTrailEvent, IamRolePolicy } from "./provider.ts";

/**
 * Live collector. Constructed only when the operator passes --live-aws.
 * Never constructed by tests, the demo, or CI.
 */
export class LiveAwsProvider implements AwsProvider {
  private readonly region: string;

  constructor() {
    const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
    if (!region) {
      throw new Error("LiveAwsProvider requires operator-supplied AWS_REGION (or AWS_DEFAULT_REGION)");
    }
    this.region = region;
    if (!process.env.AWS_ACCESS_KEY_ID) {
      throw new Error("LiveAwsProvider requires operator-supplied AWS_ACCESS_KEY_ID");
    }
  }

  async getCloudTrailEvents(): Promise<CloudTrailEvent[]> {
    throw new Error(`LiveAwsProvider.getCloudTrailEvents is not invoked without --live-aws (region=${this.region})`);
  }

  async getIamRolePolicy(): Promise<IamRolePolicy> {
    throw new Error("LiveAwsProvider.getIamRolePolicy is not invoked without --live-aws");
  }

  async getBucketEncryption(): Promise<BucketEncryption> {
    throw new Error("LiveAwsProvider.getBucketEncryption is not invoked without --live-aws");
  }
}
