export type RiskTier = "low" | "medium" | "high" | "critical";

export type AutonomyLevel =
  | "assistive"
  | "supervised"
  | "delegated"
  | "autonomous_bounded"
  | "autonomous";

export type DataAccess = "read" | "write" | "none";

export type ToolDeclaration = {
  name: string;
  data_access: DataAccess;
  data_classes: string[];
  requires_approval: boolean;
  allowed_scopes?: string[]; // type field
};

export type DecisionBoundary = {
  id: string;
  description: string;
  allowed_repositories?: string[]; // type field
  allowed_url_prefixes?: string[]; // type field
};

export type KillSwitch = {
  available: boolean;
  mechanism?: string;
};

export type Declaration = {
  id: string;
  name: string;
  owner: string;
  risk_tier: RiskTier;
  autonomy_level: AutonomyLevel;
  next_review?: string;
  description?: string;
  tools: ToolDeclaration[];
  sandbox: { write_paths: string[] };
  decision_boundaries?: DecisionBoundary[];
  escalation?: { contact?: string; kill_switch: KillSwitch };
  governance?: { control_mappings: ControlMapping[] };
  evidence?: Array<{ kind: string; description: string }>;
};

export type ControlMapping = {
  control_id: string;
  framework_ref: string;
};

export type AgentCard = {
  spec_version: "1.0.0";
  card_type: "agent";
  metadata: {
    id: string;
    name: string;
    owner: string;
    exported_at: string;
    canonical_sha256?: string;
  };
  classification: {
    risk_tier: RiskTier;
    next_review: string;
  };
  autonomy: {
    level: AutonomyLevel;
    human_in_loop?: boolean;
  };
  tools: ToolDeclaration[];
  sandbox?: { write_paths: string[] };
  decision_boundaries: DecisionBoundary[];
  escalation: { contact?: string; kill_switch: KillSwitch };
  governance: { control_mappings: ControlMapping[] };
  evidence: Array<{ kind: string; description: string }>;
};

export type DecisionEffect = "allow" | "deny" | "escalate";

export type Decision = {
  effect: DecisionEffect;
  rule_ids: string[];
  reasons: string[];
};

export type PriorDecision = {
  tool: string;
  effect: DecisionEffect;
  approval_fingerprint?: string;
};

export type GateInput = {
  card: AgentCard;
  call: { name: string; arguments: Record<string, unknown> };
  context: {
    session_id: string;
    call_index: number;
    prior_decisions: PriorDecision[];
    approvals: string[];
    approval_fingerprint: string;
  };
};

export type TraceRecord = {
  ts: string;
  session_id: string;
  call_index: number;
  tool: string;
  args_sha256: string;
  args_redacted: Record<string, unknown>;
  effect: DecisionEffect;
  rule_ids: string[];
  reasons: string[];
  card_sha256: string;
  prev_hash: string;
  hash: string;
  approval_fingerprint?: string;
};

export type ScenarioCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  agent_id?: string;
  calls: ScenarioCall[];
};

export type EvidenceItem = {
  id: string;
  source: string;
  retrieved_at: string;
  sha256: string;
  payload: unknown;
  uuid: string;
};

export type ControlDef = {
  id: string;
  title: string;
  framework_refs: string[];
  intent: string;
  check: { type: string };
};

export type ControlOutcome = {
  control: ControlDef;
  satisfied: boolean;
  summary: string;
  evidence_uuids: string[];
};
