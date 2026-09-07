package colophon.card_test

import rego.v1

import data.colophon.card

good := {
	"classification": {"risk_tier": "high", "next_review": "2027-12-31"},
	"escalation": {"kill_switch": {"available": true}},
}

test_card_ok_high_with_killswitch if {
	d := card.decision with input as good
	d.effect == "allow"
	"COL-CARD-OK" in d.rule_ids
}

test_card_ok_low_without_killswitch if {
	d := card.decision with input as {
		"classification": {"risk_tier": "low", "next_review": "2027-12-31"},
		"escalation": {"kill_switch": {"available": false}},
	}
	d.effect == "allow"
}

test_card_stale_review if {
	d := card.decision with input as {
		"classification": {"risk_tier": "low", "next_review": "2020-01-01"},
		"escalation": {"kill_switch": {"available": true}},
	}
	d.effect == "deny"
	"COL-CARD-STALE-REVIEW" in d.rule_ids
}

test_card_missing_review if {
	d := card.decision with input as {
		"classification": {"risk_tier": "low"},
		"escalation": {"kill_switch": {"available": true}},
	}
	d.effect == "deny"
	"COL-CARD-STALE-REVIEW" in d.rule_ids
}

test_card_high_no_killswitch if {
	d := card.decision with input as {
		"classification": {"risk_tier": "high", "next_review": "2027-12-31"},
		"escalation": {"kill_switch": {"available": false}},
	}
	d.effect == "deny"
	"COL-CARD-KILLSWITCH" in d.rule_ids
}

test_card_critical_no_killswitch if {
	d := card.decision with input as {
		"classification": {"risk_tier": "critical", "next_review": "2027-12-31"},
		"escalation": {"kill_switch": {"available": false}},
	}
	d.effect == "deny"
	"COL-CARD-KILLSWITCH" in d.rule_ids
}
