import type { CaseSourceError, CaseSourceResult, CaseSourceSuccess, Submission } from "./case-data";

export type SourceType = "checkin" | "message" | "sighting" | "note" | "tip";
export type PersonRole = "primary-suspect" | "person-of-interest" | "witness" | "cleared";
export type ConfidenceLevel =
  | "confirmed"
  | "reported"
  | "tip-high"
  | "tip-medium"
  | "tip-low";
export type Relevance = "podo-route" | "suspect-clue" | "background";
export type SourceFilterKey = "all" | "messages" | "sightings" | "notes" | "tips" | "checkins";

export type LinkedPersonRef = {
  slug: string;
  displayName: string;
};

export type EvidenceRecord = {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  submissionId: string;
  timestamp: string;
  sortKey: number;
  locationName: string;
  coordinates: string;
  people: LinkedPersonRef[];
  summary: string;
  detailText: string;
  confidenceLevel: ConfidenceLevel;
  relevance: Relevance;
  provenance: {
    sourceName: string;
    submissionId: string;
  };
};

export type TimelineEntry = {
  recordId: string;
  timestamp: string;
  title: string;
  summary: string;
  people: LinkedPersonRef[];
  sourceType: SourceType;
  confidenceLevel: ConfidenceLevel;
  emphasis: "critical" | "normal" | "muted";
};

export type TimelineStop = {
  locationKey: string;
  locationName: string;
  coordinates: string;
  startAt: string;
  endAt: string;
  entries: TimelineEntry[];
};

export type CaseMoment = {
  recordId: string;
  timestamp: string;
  locationName: string;
  coordinates: string;
};

export type CaseSummary = {
  lastConfirmedSighting: (CaseMoment & { withPerson: LinkedPersonRef | null }) | null;
  lastSeenWith: LinkedPersonRef | null;
  primarySuspectSlug: string | null;
  clearedLeadSlug: string | null;
  routeStart: CaseMoment | null;
  routeEnd: CaseMoment | null;
};

export type PersonSummary = {
  slug: string;
  displayName: string;
  aliases: string[];
  role: PersonRole;
  suspicionScore: number;
  lastSeenWithPodoAt: string | null;
  lastSeenWithPodoLocation: string | null;
  directPodoTouches: number;
  linkedRecordIds: string[];
  keyReasons: string[];
  counterEvidence: string[];
  sourceCoverage: string[];
};

export type SourceHealth = {
  sourceName: string;
  status: "ok" | "empty" | "error";
  count: number;
  questionCount: number;
  error: string | null;
};

export type InvestigationData = {
  summary: CaseSummary;
  people: PersonSummary[];
  timelineStops: TimelineStop[];
  sourceHealth: SourceHealth[];
  defaultSelection: {
    personSlug: string | null;
    sourceFilter: SourceFilterKey;
    searchQuery: string;
    timelineMode: "podo-route";
  };
  evidenceRecords: EvidenceRecord[];
};

type PersonAccumulator = {
  slug: string;
  displayName: string;
  aliases: Set<string>;
  sourceCoverage: Set<string>;
  linkedRecordIds: string[];
};

type PersonSummaryWithMeta = PersonSummary & {
  lastSeenSortKey: number;
  positiveBeforeNegative: number;
};

const SOURCE_TYPE_BY_SOURCE_NAME: Record<string, SourceType> = {
  Checkins: "checkin",
  Messages: "message",
  Sightings: "sighting",
  "Personal Notes": "note",
  "Anonymous Tips": "tip",
};

const SOURCE_FILTER_TO_TYPE: Record<Exclude<SourceFilterKey, "all">, SourceType> = {
  messages: "message",
  sightings: "sighting",
  notes: "note",
  tips: "tip",
  checkins: "checkin",
};

const NON_PERSON_SLUGS = new Set(["unknown", "event staff"]);

const KNOWN_PERSON_LABELS: Record<string, string> = {
  podo: "Podo",
  kagan: "Kağan",
  asli: "Aslı",
  gulsah: "Gülşah",
};

const KNOWN_PERSON_ALIASES: Record<string, string[]> = {
  kagan: ["Kağan", "Kagan", "Kağan A."],
};

const SECRET_DESTINATION_TERMS = [
  "uzaklasalim",
  "son nokta",
  "son durak",
  "asil surpriz",
  "kimse bilmesin",
];

const MISLEADING_TERMS = ["soran olursa", "hamamonu"];
const HARMLESS_EXPLANATION_TERMS = ["konfeti"];
const ALIBI_TERMS = [
  "teknik",
  "teknik ekip",
  "teknik taraf",
  "sehirde gezmiyordu",
  "tunali da degilim",
];

function toAnswerText(answer: string | string[] | null): string {
  if (Array.isArray(answer)) {
    return answer.join(", ");
  }

  return answer ?? "";
}

function buildAnswerMap(submission: Submission) {
  return Object.fromEntries(
    submission.answers.map((answer) => [answer.text, toAnswerText(answer.answer)]),
  );
}

export function normalizeInvestigationText(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSortKey(timestamp: string) {
  const jotformMatch = timestamp.match(
    /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/,
  );

  if (jotformMatch) {
    const [, day, month, year, hour, minute] = jotformMatch;

    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizePersonSlug(name: string) {
  const normalized = normalizeInvestigationText(name).replace(/\b[a-z0-9]\b$/, "").trim();

  if (normalized === "kagan a") {
    return "kagan";
  }

  return normalized;
}

function canonicalizePerson(name: string): LinkedPersonRef | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return null;
  }

  const slug = normalizePersonSlug(trimmed);

  if (!slug || NON_PERSON_SLUGS.has(slug)) {
    return null;
  }

  return {
    slug,
    displayName: KNOWN_PERSON_LABELS[slug] || trimmed,
  };
}

function uniquePeople(people: LinkedPersonRef[]) {
  const seen = new Set<string>();

  return people.filter((person) => {
    if (seen.has(person.slug)) {
      return false;
    }

    seen.add(person.slug);
    return true;
  });
}

function splitMentionedPeople(rawValue: string) {
  return rawValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getSourceType(sourceName: string): SourceType {
  return SOURCE_TYPE_BY_SOURCE_NAME[sourceName];
}

function getConfidenceLevel(sourceType: SourceType, answers: Record<string, string>): ConfidenceLevel {
  if (sourceType === "tip") {
    const rawConfidence = normalizeInvestigationText(answers["Confidence"] || "");

    if (rawConfidence === "high") {
      return "tip-high";
    }

    if (rawConfidence === "medium") {
      return "tip-medium";
    }

    return "tip-low";
  }

  if (sourceType === "note") {
    return "reported";
  }

  return "confirmed";
}

function getParticipants(
  sourceType: SourceType,
  answers: Record<string, string>,
): LinkedPersonRef[] {
  const names: string[] = [];

  if (sourceType === "checkin") {
    names.push(answers["Person Name"] || "");
  }

  if (sourceType === "message") {
    names.push(answers["Sender Name"] || "", answers["Recipient Name"] || "");
  }

  if (sourceType === "sighting") {
    names.push(answers["Person Name"] || "", answers["Seen With"] || "");
  }

  if (sourceType === "note") {
    names.push(answers["Author Name"] || "", ...splitMentionedPeople(answers["Mentioned People"] || ""));
  }

  if (sourceType === "tip") {
    names.push(answers["Suspect Name"] || "");
  }

  return uniquePeople(names.map((name) => canonicalizePerson(name)).filter(Boolean) as LinkedPersonRef[]);
}

function buildRecordCopy(
  sourceType: SourceType,
  answers: Record<string, string>,
  people: LinkedPersonRef[],
  locationName: string,
) {
  const primary = people[0]?.displayName || "Someone";
  const secondary = people[1]?.displayName || "someone";

  if (sourceType === "checkin") {
    return {
      summary: `${primary} checked in at ${locationName}.`,
      detailText: answers["Note"] || "",
    };
  }

  if (sourceType === "message") {
    return {
      summary: `${primary} exchanged a message with ${secondary} near ${locationName}.`,
      detailText: answers["Text"] || "",
    };
  }

  if (sourceType === "sighting") {
    return {
      summary: `${primary} was seen with ${secondary} at ${locationName}.`,
      detailText: answers["Note"] || "",
    };
  }

  if (sourceType === "note") {
    const mentioned = people
      .filter((person) => person.slug !== normalizePersonSlug(answers["Author Name"] || ""))
      .map((person) => person.displayName)
      .join(", ");

    return {
      summary: mentioned
        ? `${primary} noted ${mentioned} at ${locationName}.`
        : `${primary} added a note from ${locationName}.`,
      detailText: answers["Note"] || "",
    };
  }

  return {
    summary: `${primary ? `Anonymous tip pointed to ${primary}` : "Anonymous tip added a clue"} near ${locationName}.`,
    detailText: answers["Tip"] || "",
  };
}

function buildEvidenceRecord(source: CaseSourceSuccess, submission: Submission): EvidenceRecord {
  const sourceType = getSourceType(source.sourceName);
  const answers = buildAnswerMap(submission);
  const people = getParticipants(sourceType, answers);
  const locationName = answers["Location"] || "Unknown location";
  const coordinates = answers["Coordinates"] || "";
  const timestamp = answers["Timestamp"] || submission.createdAt;
  const { summary, detailText } = buildRecordCopy(sourceType, answers, people, locationName);
  const normalizedDetail = normalizeInvestigationText(detailText);
  const involvesPodo = people.some((person) => person.slug === "podo");
  const hasClueLanguage =
    SECRET_DESTINATION_TERMS.some((term) => normalizedDetail.includes(term)) ||
    MISLEADING_TERMS.some((term) => normalizedDetail.includes(term)) ||
    HARMLESS_EXPLANATION_TERMS.some((term) => normalizedDetail.includes(term)) ||
    ALIBI_TERMS.some((term) => normalizedDetail.includes(term));

  let relevance: Relevance = "background";

  if (involvesPodo) {
    relevance = "podo-route";
  } else if (
    sourceType === "tip" ||
    hasClueLanguage ||
    (sourceType === "sighting" && people.length === 1)
  ) {
    relevance = "suspect-clue";
  }

  return {
    id: `${sourceType}-${submission.id}`,
    sourceType,
    sourceName: source.sourceName,
    submissionId: submission.id,
    timestamp,
    sortKey: parseSortKey(timestamp),
    locationName,
    coordinates,
    people,
    summary,
    detailText,
    confidenceLevel: getConfidenceLevel(sourceType, answers),
    relevance,
    provenance: {
      sourceName: source.sourceName,
      submissionId: submission.id,
    },
  };
}

function isSuccessSource(source: CaseSourceResult): source is CaseSourceSuccess {
  return source.status !== "error";
}

function isErrorSource(source: CaseSourceResult): source is CaseSourceError {
  return source.status === "error";
}

function recordHasPerson(record: EvidenceRecord, personSlug: string) {
  return record.people.some((person) => person.slug === personSlug);
}

function getPersonTerms(slug: string) {
  const aliases = KNOWN_PERSON_ALIASES[slug] || [];
  const label = KNOWN_PERSON_LABELS[slug] ? [KNOWN_PERSON_LABELS[slug]] : [];

  return [...new Set([...label, ...aliases].map((value) => normalizeInvestigationText(value)))]
    .filter(Boolean);
}

function getNormalizedRecordText(record: EvidenceRecord) {
  return normalizeInvestigationText(`${record.summary} ${record.detailText}`);
}

function mentionsPersonInText(record: EvidenceRecord, personSlug: string) {
  const recordText = getNormalizedRecordText(record);
  return getPersonTerms(personSlug).some((term) => recordText.includes(term));
}

function isSuspicionFocusedRecord(record: EvidenceRecord, personSlug: string) {
  if (record.people[0]?.slug === personSlug) {
    if (record.sourceType === "note") {
      const otherNamedPeople = record.people.filter(
        (person) => person.slug !== "podo" && person.slug !== personSlug,
      );

      return otherNamedPeople.length === 0;
    }

    return true;
  }

  return mentionsPersonInText(record, personSlug);
}

function isCounterEvidenceFocusedRecord(record: EvidenceRecord, personSlug: string) {
  if (record.people[0]?.slug === personSlug) {
    return true;
  }

  return mentionsPersonInText(record, personSlug);
}

function buildTimelineEntry(record: EvidenceRecord, criticalRecordId: string | null): TimelineEntry {
  const normalizedDetail = normalizeInvestigationText(record.detailText);

  let emphasis: TimelineEntry["emphasis"] = "normal";

  if (
    record.id === criticalRecordId ||
    SECRET_DESTINATION_TERMS.some((term) => normalizedDetail.includes(term))
  ) {
    emphasis = "critical";
  } else if (record.sourceType === "note" || record.sourceType === "tip") {
    emphasis = "muted";
  }

  return {
    recordId: record.id,
    timestamp: record.timestamp,
    title: record.summary.replace(/\.$/, ""),
    summary: record.detailText || record.summary,
    people: record.people,
    sourceType: record.sourceType,
    confidenceLevel: record.confidenceLevel,
    emphasis,
  };
}

export function buildTimelineStops(
  records: EvidenceRecord[],
  criticalRecordId: string | null,
): TimelineStop[] {
  const sortedRecords = [...records].sort((left, right) => left.sortKey - right.sortKey);
  const groupedStops = new Map<string, TimelineStop>();

  for (const record of sortedRecords) {
    const locationKey = record.locationName;
    const existingStop = groupedStops.get(locationKey);
    const entry = buildTimelineEntry(record, criticalRecordId);

    if (!existingStop) {
      groupedStops.set(locationKey, {
        locationKey,
        locationName: record.locationName,
        coordinates: record.coordinates,
        startAt: record.timestamp,
        endAt: record.timestamp,
        entries: [entry],
      });
      continue;
    }

    existingStop.endAt = record.timestamp;
    existingStop.entries.push(entry);
  }

  return [...groupedStops.values()];
}

function comparePeople(left: PersonSummaryWithMeta, right: PersonSummaryWithMeta) {
  return (
    right.suspicionScore - left.suspicionScore ||
    right.lastSeenSortKey - left.lastSeenSortKey ||
    right.directPodoTouches - left.directPodoTouches ||
    right.linkedRecordIds.length - left.linkedRecordIds.length ||
    left.displayName.localeCompare(right.displayName, "tr")
  );
}

function buildPersonScoring(
  slug: string,
  records: EvidenceRecord[],
  lastConfirmedSighting: EvidenceRecord | null,
) {
  const linkedRecords = records.filter((record) => recordHasPerson(record, slug));
  const directPodoRecords = linkedRecords.filter((record) => recordHasPerson(record, "podo"));
  const lastDirectRecord = [...directPodoRecords].sort((left, right) => right.sortKey - left.sortKey)[0];
  const suspicionTexts = linkedRecords
    .filter((record) => isSuspicionFocusedRecord(record, slug))
    .map((record) => getNormalizedRecordText(record));
  const counterEvidenceTexts = linkedRecords
    .filter((record) => isCounterEvidenceFocusedRecord(record, slug))
    .map((record) => getNormalizedRecordText(record));
  const tipRecords = linkedRecords.filter((record) => record.sourceType === "tip");
  const highTip = tipRecords.some((record) => record.confidenceLevel === "tip-high");
  const mediumTip = tipRecords.some((record) => record.confidenceLevel === "tip-medium");
  const laterSoloSighting = linkedRecords.some(
    (record) =>
      record.sourceType === "sighting" &&
      record.people[0]?.slug === slug &&
      !recordHasPerson(record, "podo") &&
      record.sortKey > (lastConfirmedSighting?.sortKey || 0),
  );
  const hasClueLanguage = suspicionTexts.some((text) =>
    SECRET_DESTINATION_TERMS.some((term) => text.includes(term)),
  );
  const hasMisleadingLanguage = suspicionTexts.some((text) =>
    MISLEADING_TERMS.some((term) => text.includes(term)),
  );
  const hasHarmlessExplanation = counterEvidenceTexts.some((text) =>
    HARMLESS_EXPLANATION_TERMS.some((term) => text.includes(term)),
  );
  const hasAlibi = counterEvidenceTexts.some((text) =>
    ALIBI_TERMS.some((term) => text.includes(term)),
  );

  let score = 0;
  let positiveBeforeNegative = 0;
  const keyReasons: string[] = [];
  const counterEvidence: string[] = [];

  if (lastConfirmedSighting && recordHasPerson(lastConfirmedSighting, slug)) {
    score += 6;
    positiveBeforeNegative += 6;
    keyReasons.push("Last confirmed sighting with Podo happened at Ankara Kalesi.");
  }

  if (hasClueLanguage) {
    score += 4;
    positiveBeforeNegative += 4;
    keyReasons.push("Used secret-destination language around the route.");
  }

  if (hasMisleadingLanguage) {
    score += 3;
    positiveBeforeNegative += 3;
    keyReasons.push("Tried to steer attention with misleading location language.");
  }

  if (highTip) {
    score += 3;
    positiveBeforeNegative += 3;
    keyReasons.push("Received a high-confidence anonymous tip.");
  }

  if (mediumTip) {
    score += 2;
    positiveBeforeNegative += 2;
    keyReasons.push("Received a medium-confidence anonymous tip.");
  }

  if (laterSoloSighting) {
    score += 2;
    positiveBeforeNegative += 2;
    keyReasons.push("Appeared alone after the last confirmed Podo sighting.");
  }

  if (hasHarmlessExplanation) {
    score -= 4;
    counterEvidence.push("Confetti explanation weakens the suspicious bag clue.");
  }

  if (hasAlibi) {
    score -= 3;
    counterEvidence.push("Anchored alibi points to staying with technical staff or at CerModern.");
  }

  return {
    score: Math.max(0, score),
    positiveBeforeNegative,
    keyReasons,
    counterEvidence,
    lastSeenWithPodoAt: lastDirectRecord?.timestamp || null,
    lastSeenWithPodoLocation: lastDirectRecord?.locationName || null,
    directPodoTouches: directPodoRecords.length,
    lastSeenSortKey: lastDirectRecord?.sortKey || 0,
  };
}

function buildPeople(records: EvidenceRecord[], lastConfirmedSighting: EvidenceRecord | null) {
  const accumulator = new Map<string, PersonAccumulator>();

  for (const record of records) {
    for (const person of record.people) {
      if (person.slug === "podo") {
        continue;
      }

      const current = accumulator.get(person.slug) || {
        slug: person.slug,
        displayName: person.displayName,
        aliases: new Set<string>(),
        sourceCoverage: new Set<string>(),
        linkedRecordIds: [],
      };

      current.displayName = KNOWN_PERSON_LABELS[person.slug] || current.displayName;
      current.aliases.add(person.displayName);
      (KNOWN_PERSON_ALIASES[person.slug] || []).forEach((alias) => current.aliases.add(alias));
      current.sourceCoverage.add(record.sourceName);
      current.linkedRecordIds.push(record.id);

      accumulator.set(person.slug, current);
    }
  }

  const peopleWithMeta: PersonSummaryWithMeta[] = [...accumulator.values()].map((person) => {
    const scoring = buildPersonScoring(person.slug, records, lastConfirmedSighting);

    return {
      slug: person.slug,
      displayName: person.displayName,
      aliases: [...person.aliases].sort((left, right) => left.localeCompare(right, "tr")),
      role: "witness",
      suspicionScore: scoring.score,
      lastSeenWithPodoAt: scoring.lastSeenWithPodoAt,
      lastSeenWithPodoLocation: scoring.lastSeenWithPodoLocation,
      directPodoTouches: scoring.directPodoTouches,
      linkedRecordIds: person.linkedRecordIds,
      keyReasons: scoring.keyReasons,
      counterEvidence: scoring.counterEvidence,
      sourceCoverage: [...person.sourceCoverage],
      lastSeenSortKey: scoring.lastSeenSortKey,
      positiveBeforeNegative: scoring.positiveBeforeNegative,
    };
  });

  const sortedPeople = peopleWithMeta.sort(comparePeople);

  return sortedPeople.map((person, index) => {
    let role: PersonRole = "witness";

    if (person.counterEvidence.length > 0 && person.suspicionScore <= 2) {
      role = "cleared";
    } else if (index === 0 && person.suspicionScore >= 8) {
      role = "primary-suspect";
    } else if (person.suspicionScore >= 4) {
      role = "person-of-interest";
    }

    return {
      ...person,
      role,
    };
  });
}

function toCaseMoment(record: EvidenceRecord | null): CaseMoment | null {
  if (!record) {
    return null;
  }

  return {
    recordId: record.id,
    timestamp: record.timestamp,
    locationName: record.locationName,
    coordinates: record.coordinates,
  };
}

function buildSourceHealth(sources: CaseSourceResult[]): SourceHealth[] {
  return sources.map((source) => {
    if (isErrorSource(source)) {
      return {
        sourceName: source.sourceName,
        status: "error",
        count: 0,
        questionCount: 0,
        error: source.error,
      };
    }

    return {
      sourceName: source.sourceName,
      status: source.status,
      count: source.count,
      questionCount: source.questions.length,
      error: null,
    };
  });
}

function buildSummary(
  people: PersonSummaryWithMeta[],
  routeRecords: EvidenceRecord[],
  lastConfirmedSighting: EvidenceRecord | null,
): CaseSummary {
  const routeStart = routeRecords[0] || null;
  const routeEnd = lastConfirmedSighting || routeRecords[routeRecords.length - 1] || null;
  const lastSeenWith =
    lastConfirmedSighting?.people.find((person) => person.slug !== "podo") || null;
  const primarySuspect = people.find((person) => person.role === "primary-suspect") || people[0] || null;
  const clearedLead =
    [...people]
      .filter((person) => person.counterEvidence.length > 0 && person.slug !== primarySuspect?.slug)
      .sort(
        (left, right) =>
          right.positiveBeforeNegative - left.positiveBeforeNegative ||
          right.directPodoTouches - left.directPodoTouches,
      )[0] || null;

  return {
    lastConfirmedSighting: lastConfirmedSighting
      ? {
          ...toCaseMoment(lastConfirmedSighting)!,
          withPerson: lastSeenWith,
        }
      : null,
    lastSeenWith,
    primarySuspectSlug: primarySuspect?.slug || null,
    clearedLeadSlug: clearedLead?.slug || null,
    routeStart: toCaseMoment(routeStart),
    routeEnd: toCaseMoment(routeEnd),
  };
}

export function getSourceFilterType(filter: SourceFilterKey) {
  if (filter === "all") {
    return null;
  }

  return SOURCE_FILTER_TO_TYPE[filter];
}

export function buildInvestigationData(sources: CaseSourceResult[]): InvestigationData {
  const successfulSources = sources.filter(isSuccessSource);
  const evidenceRecords = successfulSources
    .flatMap((source) => source.submissions.map((submission) => buildEvidenceRecord(source, submission)))
    .sort((left, right) => left.sortKey - right.sortKey);
  const routeRecords = evidenceRecords.filter((record) => record.relevance === "podo-route");
  const lastConfirmedSighting =
    [...evidenceRecords]
      .filter(
        (record) =>
          record.sourceType === "sighting" &&
          recordHasPerson(record, "podo") &&
          record.people.some((person) => person.slug !== "podo"),
      )
      .sort((left, right) => right.sortKey - left.sortKey)[0] || null;
  const peopleWithMeta = buildPeople(evidenceRecords, lastConfirmedSighting);
  const summary = buildSummary(peopleWithMeta, routeRecords, lastConfirmedSighting);

  return {
    summary,
    people: peopleWithMeta.map(
      ({ lastSeenSortKey: _ignored, positiveBeforeNegative: _ignoredMeta, ...person }) => person,
    ),
    timelineStops: buildTimelineStops(routeRecords, summary.routeEnd?.recordId || null),
    sourceHealth: buildSourceHealth(sources),
    defaultSelection: {
      personSlug: summary.primarySuspectSlug,
      sourceFilter: "all",
      searchQuery: "",
      timelineMode: "podo-route",
    },
    evidenceRecords,
  };
}
