import { createHash } from "node:crypto";
export class ProfileService {
  constructor({ repository }) { this.r=repository; }
  list() { return this.r.list("profiles"); }
  get(id) { return this.r.find("profiles",id); }
  snapshotConfiguration({profileVersionId, ruleVersionId, configuration={}}) {
    const configurationVersion = "cfg-" + createHash("sha256").update(JSON.stringify(configuration)).digest("hex").slice(0,16);
    const configurationHash = createHash("sha256").update(JSON.stringify({
      profile_version_id: profileVersionId ?? null,
      rule_version_id: ruleVersionId ?? null,
      configuration,
    })).digest("hex");
    return { configuration_version: configurationVersion, configuration_hash: configurationHash };
  }
}
