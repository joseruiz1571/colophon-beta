package colophon.gate_test

import rego.v1

import data.colophon.gate

base_card := {
	"tools": [
		{
			"name": "fs.read",
			"data_access": "read",
			"data_classes": ["filesystem"],
			"requires_approval": false,
		},
		{
			"name": "fs.write",
			"data_access": "write",
			"data_classes": ["filesystem"],
			"requires_approval": false,
		},
		{
			"name": "repo.list",
			"data_access": "read",
			"data_classes": ["repository"],
			"requires_approval": false,
		},
		{
			"name": "repo.read_settings",
			"data_access": "read",
			"data_classes": ["repository"],
			"requires_approval": false,
		},
		{
			"name": "auth.request_scopes",
			"data_access": "none",
			"data_classes": ["credential"],
			"requires_approval": false,
			"allowed_scopes": ["repo", "read:org"],
		},
		{
			"name": "net.fetch",
			"data_access": "read",
			"data_classes": ["network"],
			"requires_approval": false,
		},
		{
			"name": "mail.send",
			"data_access": "write",
			"data_classes": ["email"],
			"requires_approval": true,
		},
	],
	"sandbox": {"write_paths": ["fixtures/sandbox/"]},
	"decision_boundaries": [{
		"id": "repos",
		"description": "in-scope",
		"allowed_repositories": ["acme-corp/web", "acme-corp/api"],
		"allowed_url_prefixes": ["https://status.github.example/"],
	}],
}

approval_card := object.union(base_card, {"tools": [
	{
		"name": "fs.write",
		"data_access": "write",
		"data_classes": ["filesystem"],
		"requires_approval": true,
	},
	{
		"name": "fs.read",
		"data_access": "read",
		"data_classes": ["filesystem"],
		"requires_approval": false,
	},
]})

ctx := {"session_id": "s", "call_index": 0, "prior_decisions": [], "approvals": []}

eval_decision(card, name, arguments, context) := d if {
	d := gate.decision with input as {"card": card, "call": {"name": name, "arguments": arguments}, "context": context}
}

test_allow_fs_read if {
	d := eval_decision(base_card, "fs.read", {"path": "fixtures/fs/a.txt"}, ctx)
	d.effect == "allow"
	"COL-GATE-ALLOW" in d.rule_ids
}

test_allow_repo_list if {
	d := eval_decision(base_card, "repo.list", {"owner": "acme-corp"}, ctx)
	d.effect == "allow"
}

test_allow_repo_read_in_scope if {
	d := eval_decision(base_card, "repo.read_settings", {"repository": "acme-corp/web"}, ctx)
	d.effect == "allow"
	"COL-GATE-ALLOW" in d.rule_ids
}

test_allow_net_fetch_in_scope if {
	d := eval_decision(base_card, "net.fetch", {"url": "https://status.github.example/health"}, ctx)
	d.effect == "allow"
}

test_allow_fs_write_inside_sandbox if {
	d := eval_decision(base_card, "fs.write", {"path": "fixtures/sandbox/out.txt", "content": "x"}, ctx)
	d.effect == "allow"
}

test_allow_auth_declared_scope if {
	d := eval_decision(base_card, "auth.request_scopes", {"scopes": ["repo"]}, ctx)
	d.effect == "allow"
}

test_deny_unknown_tool if {
	d := eval_decision(base_card, "proc.exec", {}, ctx)
	d.effect == "deny"
	"COL-GATE-UNKNOWN-TOOL" in d.rule_ids
}

test_deny_unknown_mail_when_not_on_small_card if {
	small := object.union(base_card, {"tools": [{
		"name": "fs.read",
		"data_access": "read",
		"data_classes": ["filesystem"],
		"requires_approval": false,
	}]})
	d := eval_decision(small, "mail.send", {"to": "a@acme.example", "subject": "s", "body": "b"}, ctx)
	d.effect == "deny"
	"COL-GATE-UNKNOWN-TOOL" in d.rule_ids
}

test_deny_data_class_write_content_on_read_tool if {
	# fs.read does not declare credential; content field is class credential
	d := eval_decision(base_card, "fs.read", {"path": "fixtures/fs/a.txt", "content": "syn"}, ctx)
	d.effect == "deny"
	"COL-GATE-DATA-CLASS" in d.rule_ids
}

test_deny_data_class_token_field if {
	d := eval_decision(base_card, "fs.read", {"path": "fixtures/fs/a.txt", "token": "syn"}, ctx)
	d.effect == "deny"
	"COL-GATE-DATA-CLASS" in d.rule_ids
}

test_deny_write_outside_sandbox if {
	d := eval_decision(base_card, "fs.write", {"path": "/tmp/gh-token.json", "content": "x"}, ctx)
	d.effect == "deny"
	"COL-GATE-WRITE-SANDBOX" in d.rule_ids
}

test_deny_write_empty_sandbox if {
	card := object.union(base_card, {"sandbox": {"write_paths": []}})
	d := eval_decision(card, "fs.write", {"path": "fixtures/sandbox/out.txt", "content": "x"}, ctx)
	d.effect == "deny"
	"COL-GATE-WRITE-SANDBOX" in d.rule_ids
}

test_deny_scope_expansion if {
	d := eval_decision(base_card, "auth.request_scopes", {"scopes": ["admin:org"]}, ctx)
	d.effect == "deny"
	"COL-GATE-SCOPE-EXPANSION" in d.rule_ids
}

test_deny_scope_expansion_mixed if {
	d := eval_decision(base_card, "auth.request_scopes", {"scopes": ["repo", "admin:org"]}, ctx)
	d.effect == "deny"
	"COL-GATE-SCOPE-EXPANSION" in d.rule_ids
}

test_deny_repo_outside_scope if {
	d := eval_decision(base_card, "repo.read_settings", {"repository": "other-org/private"}, ctx)
	d.effect == "deny"
	"COL-GATE-REPO-SCOPE" in d.rule_ids
}

test_deny_url_outside_scope if {
	d := eval_decision(base_card, "net.fetch", {"url": "https://evil.example/exfil"}, ctx)
	d.effect == "deny"
	"COL-GATE-URL-SCOPE" in d.rule_ids
}

test_escalate_requires_approval if {
	d := eval_decision(approval_card, "fs.write", {"path": "fixtures/sandbox/out.txt", "content": "ok"}, ctx)
	d.effect == "escalate"
	"COL-GATE-APPROVAL-REQUIRED" in d.rule_ids
}

test_allow_with_matching_approval if {
	c := object.union(ctx, {"approvals": ["fp-one"], "approval_fingerprint": "fp-one"})
	d := eval_decision(approval_card, "fs.write", {"path": "fixtures/sandbox/out.txt", "content": "ok"}, c)
	d.effect == "allow"
	"COL-GATE-ALLOW" in d.rule_ids
}

test_escalate_consumed_approval if {
	c := object.union(ctx, {
		"approvals": ["fp-one"],
		"approval_fingerprint": "fp-one",
		"prior_decisions": [{"effect": "allow", "approval_fingerprint": "fp-one"}],
	})
	d := eval_decision(approval_card, "fs.write", {"path": "fixtures/sandbox/out.txt", "content": "ok"}, c)
	d.effect == "escalate"
	"COL-GATE-APPROVAL-REQUIRED" in d.rule_ids
}

test_escalate_mail_without_approval if {
	d := eval_decision(base_card, "mail.send", {"to": "a@acme.example", "subject": "s", "body": "b"}, ctx)
	d.effect == "escalate"
	"COL-GATE-APPROVAL-REQUIRED" in d.rule_ids
}

test_decision_shape_allow if {
	d := eval_decision(base_card, "fs.read", {"path": "fixtures/fs/a.txt"}, ctx)
	d.effect == "allow"
	count(d.rule_ids) > 0
	count(d.reasons) > 0
}

test_decision_shape_deny if {
	d := eval_decision(base_card, "unknown.tool", {}, ctx)
	d.effect == "deny"
	count(d.rule_ids) > 0
	count(d.reasons) > 0
}

test_reasons_name_rule_id if {
	d := eval_decision(base_card, "fs.write", {"path": "/tmp/x", "content": "x"}, ctx)
	some r in d.reasons
	startswith(r, "COL-GATE-WRITE-SANDBOX")
}

test_unknown_tool_does_not_allow if {
	d := eval_decision(base_card, "fs.delete", {"path": "fixtures/fs/a.txt"}, ctx)
	d.effect == "deny"
	d.effect != "allow"
}

test_write_prefix_does_not_match_sibling if {
	d := eval_decision(base_card, "fs.write", {"path": "fixtures/sandbox-escape/x", "content": "x"}, ctx)
	d.effect == "deny"
	"COL-GATE-WRITE-SANDBOX" in d.rule_ids
}
