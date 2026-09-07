package colophon.card

import rego.v1

default effect := "deny"

next_review := object.get(object.get(input, "classification", {}), "next_review", "")

risk_tier := object.get(object.get(input, "classification", {}), "risk_tier", "")

kill_available := object.get(object.get(object.get(input, "escalation", {}), "kill_switch", {}), "available", false)

review_ns := time.parse_rfc3339_ns(sprintf("%sT00:00:00Z", [next_review])) if {
	next_review != ""
}

stale if {
	next_review == ""
}

stale if {
	review_ns < time.now_ns()
}

needs_killswitch if {
	risk_tier in {"high", "critical"}
	kill_available != true
}

effect := "allow" if {
	next_review != ""
	not stale
	not needs_killswitch
}

rule_ids contains "COL-CARD-STALE-REVIEW" if {
	stale
}

rule_ids contains "COL-CARD-KILLSWITCH" if {
	needs_killswitch
}

rule_ids contains "COL-CARD-OK" if {
	effect == "allow"
}

reasons contains sprintf("COL-CARD-STALE-REVIEW: classification.next_review %q is missing or in the past", [next_review]) if {
	stale
}

reasons contains sprintf("COL-CARD-KILLSWITCH: risk_tier %q requires escalation.kill_switch.available=true", [risk_tier]) if {
	needs_killswitch
}

reasons contains "COL-CARD-OK: next_review is current and kill switch requirements are met" if {
	effect == "allow"
}

decision := {
	"effect": effect,
	"rule_ids": [id | some id in rule_ids],
	"reasons": [r | some r in reasons],
}
