package colophon.gate

import rego.v1

# Decision composition is fail-closed: default effect is deny.
# An explicit allow assignment is the only way a call proceeds.
# Adding `effect := "allow" if { input.call.name == "fs.write" }` is enough
# to flip write decisions (C19) because no competing deny assignment exists.

default effect := "deny"

declared_tool := t if {
	some t in input.card.tools
	t.name == input.call.name
}

tool_declared if {
	declared_tool
}

# --- touched data classes inferred from the call (policy is data) ---

touched_class contains "filesystem" if {
	input.call.name in {"fs.read", "fs.write"}
}

touched_class contains "repository" if {
	input.call.name in {"repo.list", "repo.read_settings"}
}

touched_class contains "network" if {
	input.call.name == "net.fetch"
}

touched_class contains "email" if {
	input.call.name == "mail.send"
}

# Credential class: auth.* family, explicit token field, or a content
# field on a non-write filesystem call (credential-bearing tools).
# fs.write content is file payload (class filesystem), not a credential
# unless a token field is also present.
touched_class contains "credential" if {
	startswith(input.call.name, "auth.")
}

touched_class contains "credential" if {
	object.get(input.call.arguments, "token", null) != null
}

touched_class contains "credential" if {
	object.get(input.call.arguments, "content", null) != null
	input.call.name != "fs.write"
}

declared_classes := {c | some c in declared_tool.data_classes}

# COL-GATE-DATA-CLASS: arguments touch a class the tool did not declare.
data_class_violation if {
	tool_declared
	some c in touched_class
	not c in declared_classes
}

# COL-GATE-WRITE-SANDBOX: fs.write path must be a prefix of sandbox.write_paths.
write_outside_sandbox if {
	input.call.name == "fs.write"
	path := object.get(input.call.arguments, "path", "")
	not sandbox_prefix_match(path)
}

sandbox_prefix_match(path) if {
	some prefix in object.get(object.get(input.card, "sandbox", {}), "write_paths", [])
	prefix != ""
	startswith(path, prefix)
}

# COL-GATE-SCOPE-EXPANSION: auth.* scopes must be subset of the declared tool scopes.
scope_expansion if {
	startswith(input.call.name, "auth.")
	tool_declared
	some s in object.get(input.call.arguments, "scopes", [])
	not s in object.get(declared_tool, "allowed_scopes", [])
}

# COL-GATE-REPO-SCOPE: repository argument must appear in decision_boundaries.
repo_outside_scope if {
	input.call.name == "repo.read_settings"
	repo := object.get(input.call.arguments, "repository", "")
	repo != ""
	not repo in allowed_repositories
}

allowed_repositories contains repo if {
	some b in object.get(input.card, "decision_boundaries", [])
	some repo in object.get(b, "allowed_repositories", [])
}

# COL-GATE-URL-SCOPE: net.fetch url must match an allowed prefix when prefixes exist.
url_outside_scope if {
	input.call.name == "net.fetch"
	url := object.get(input.call.arguments, "url", "")
	count(allowed_url_prefixes) > 0
	not url_prefix_match(url)
}

allowed_url_prefixes contains p if {
	some b in object.get(input.card, "decision_boundaries", [])
	some p in object.get(b, "allowed_url_prefixes", [])
}

url_prefix_match(url) if {
	some p in allowed_url_prefixes
	startswith(url, p)
}

# COL-GATE-APPROVAL-REQUIRED: one-shot approval fingerprint.
needs_approval if {
	tool_declared
	declared_tool.requires_approval == true
	not approval_available
}

approval_available if {
	fp := object.get(input.context, "approval_fingerprint", "")
	fp != ""
	fp in object.get(input.context, "approvals", [])
	not approval_already_consumed
}

approval_already_consumed if {
	fp := object.get(input.context, "approval_fingerprint", "")
	some d in object.get(input.context, "prior_decisions", [])
	d.approval_fingerprint == fp
	d.effect == "allow"
}

permitted if {
	tool_declared
	not data_class_violation
	not write_outside_sandbox
	not scope_expansion
	not repo_outside_scope
	not url_outside_scope
}

effect := "allow" if {
	permitted
	not needs_approval
}

effect := "escalate" if {
	permitted
	needs_approval
}

# --- auditor-readable rule IDs and reasons ---

rule_ids contains "COL-GATE-UNKNOWN-TOOL" if {
	not tool_declared
}

rule_ids contains "COL-GATE-DATA-CLASS" if {
	data_class_violation
}

rule_ids contains "COL-GATE-WRITE-SANDBOX" if {
	write_outside_sandbox
}

rule_ids contains "COL-GATE-SCOPE-EXPANSION" if {
	scope_expansion
}

rule_ids contains "COL-GATE-REPO-SCOPE" if {
	repo_outside_scope
}

rule_ids contains "COL-GATE-URL-SCOPE" if {
	url_outside_scope
}

rule_ids contains "COL-GATE-APPROVAL-REQUIRED" if {
	needs_approval
}

rule_ids contains "COL-GATE-ALLOW" if {
	effect == "allow"
}

# Named violations only. Default is attached below so the set is not self-referential.

reasons contains sprintf("COL-GATE-UNKNOWN-TOOL: tool %q is not listed on the Card tools[]", [input.call.name]) if {
	not tool_declared
}

reasons contains sprintf("COL-GATE-DATA-CLASS: call touches data classes %v; Card tool %q declares %v", [touched_class, input.call.name, declared_classes]) if {
	data_class_violation
}

reasons contains sprintf("COL-GATE-WRITE-SANDBOX: path %q is outside sandbox.write_paths %v", [object.get(input.call.arguments, "path", ""), object.get(object.get(input.card, "sandbox", {}), "write_paths", [])]) if {
	write_outside_sandbox
}

reasons contains sprintf("COL-GATE-SCOPE-EXPANSION: requested scopes %v exceed Card allowed_scopes %v", [object.get(input.call.arguments, "scopes", []), object.get(declared_tool, "allowed_scopes", [])]) if {
	scope_expansion
}

reasons contains sprintf("COL-GATE-REPO-SCOPE: repository %q is not in decision_boundaries.allowed_repositories", [object.get(input.call.arguments, "repository", "")]) if {
	repo_outside_scope
}

reasons contains sprintf("COL-GATE-URL-SCOPE: url %q is not under allowed_url_prefixes", [object.get(input.call.arguments, "url", "")]) if {
	url_outside_scope
}

reasons contains sprintf("COL-GATE-APPROVAL-REQUIRED: tool %q has requires_approval=true; approval fingerprint %s is missing or already consumed", [input.call.name, object.get(input.context, "approval_fingerprint", "")]) if {
	needs_approval
}

reasons contains sprintf("COL-GATE-ALLOW: tool %q is on the Card and arguments stay inside declared classes and boundaries", [input.call.name]) if {
	effect == "allow"
}

final_rule_ids := rule_ids if {
	count(rule_ids) > 0
}

final_rule_ids := {"COL-GATE-DEFAULT"} if {
	count(rule_ids) == 0
	effect == "deny"
}

final_reasons := reasons if {
	count(reasons) > 0
}

final_reasons := {"COL-GATE-DEFAULT: no permit rule matched; fail closed"} if {
	count(reasons) == 0
	effect == "deny"
}

decision := {
	"effect": effect,
	"rule_ids": [id | some id in final_rule_ids],
	"reasons": [r | some r in final_reasons],
}
