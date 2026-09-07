import { randomUUID } from "node:crypto";
import { uuidV5 } from "../lib/hash.ts";
import type { AgentCard, ControlOutcome } from "../types.ts";

export type ObservationDraft = {
  uuid: string;
  title: string;
  description: string;
  evidence_uuids: string[];
};

export function buildOscal(opts: {
  card: AgentCard;
  outcomes: ControlOutcome[];
  observations: ObservationDraft[];
  started: string;
  ended: string;
}): Record<string, unknown> {
  const docUuid = uuidV5(`colophon:ar:${opts.card.metadata.id}:${opts.started}`);
  const resultUuid = uuidV5(`colophon:result:${docUuid}`);
  const observations = opts.observations.map((o) => ({
    uuid: o.uuid,
    title: o.title,
    description: o.description,
    methods: ["EXAMINE"],
    collected: opts.ended,
    "relevant-evidence": o.evidence_uuids.map((id) => ({
      href: `#${id}`,
      description: `Evidence ${id}`,
    })),
  }));

  const findings = opts.outcomes.map((outcome) => {
    const findingUuid = uuidV5(`colophon:finding:${resultUuid}:${outcome.control.id}`);
    const related = outcome.evidence_uuids
      .map((id) => observations.find((o) => o["relevant-evidence"].some((e) => e.href === `#${id}`)))
      .filter((o): o is (typeof observations)[number] => Boolean(o))
      .map((o) => ({ "observation-uuid": o.uuid }));
    const uniqueRelated = [...new Map(related.map((r) => [r["observation-uuid"], r])).values()];
    return {
      uuid: findingUuid,
      title: outcome.control.title,
      description: `${outcome.control.intent} ${outcome.summary}`,
      target: {
        type: "objective-id",
        "target-id": outcome.control.id,
        status: {
          state: outcome.satisfied ? "satisfied" : "not-satisfied",
          reason: outcome.satisfied ? "pass" : "fail",
        },
      },
      ...(uniqueRelated.length > 0 ? { "related-observations": uniqueRelated } : {}),
    };
  });

  return {
    "assessment-results": {
      uuid: docUuid,
      metadata: {
        title: `Colophon assessment of ${opts.card.metadata.name}`,
        "last-modified": opts.ended,
        version: "1.0.0",
        "oscal-version": "1.1.2",
      },
      "import-ap": {
        href: "https://colophon.example/assessment-plan",
      },
      results: [
        {
          uuid: resultUuid,
          title: `Session assessment for ${opts.card.metadata.name}`,
          description: `Deterministic evaluation of least-agency and custody controls for agent ${opts.card.metadata.id}.`,
          start: opts.started,
          end: opts.ended,
          "reviewed-controls": {
            description: "Colophon agent-controls.yaml",
            "control-selections": [
              {
                "include-controls": opts.outcomes.map((o) => ({ "control-id": o.control.id })),
              },
            ],
          },
          observations,
          findings,
        },
      ],
    },
  };
}

export function observationUuid(key: string): string {
  try {
    return uuidV5(`colophon:obs:${key}`);
  } catch {
    return randomUUID();
  }
}
