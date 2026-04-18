"use client";

import { useEffect, useMemo, useState } from "react";
import type { CaseDataResponse } from "../lib/case-data";
import {
  buildTimelineStops,
  getSourceFilterType,
  normalizeInvestigationText,
  type EvidenceRecord,
  type InvestigationData,
  type PersonSummary,
  type SourceFilterKey,
} from "../lib/investigation";

const SOURCE_FILTERS: Array<{ key: SourceFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "sightings", label: "Sightings" },
  { key: "notes", label: "Notes" },
  { key: "tips", label: "Tips" },
  { key: "checkins", label: "Checkins" },
];

const ROLE_LABELS: Record<PersonSummary["role"], string> = {
  "primary-suspect": "Primary suspect",
  "person-of-interest": "Person of interest",
  witness: "Witness",
  cleared: "Cleared",
};

const SOURCE_TYPE_LABELS: Record<EvidenceRecord["sourceType"], string> = {
  checkin: "Checkin",
  message: "Message",
  sighting: "Sighting",
  note: "Note",
  tip: "Tip",
};

function findPersonDisplayName(people: PersonSummary[], slug: string | null) {
  if (!slug) {
    return "Unavailable";
  }

  return people.find((person) => person.slug === slug)?.displayName || "Unavailable";
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="summary-card">
      <p className="eyebrow">{label}</p>
      <h2>{value}</h2>
      <p>{detail}</p>
    </article>
  );
}

function EvidenceItem({
  record,
  dimmed,
}: {
  record: EvidenceRecord;
  dimmed?: boolean;
}) {
  return (
    <article
      className={`timeline-item ${record.relevance === "suspect-clue" ? "timeline-item-clue" : ""} ${dimmed ? "timeline-item-dimmed" : ""}`}
    >
      <div className="timeline-item-top">
        <p className="timeline-time">{record.timestamp}</p>
        <div className="timeline-badges">
          <span className="timeline-badge">{SOURCE_TYPE_LABELS[record.sourceType]}</span>
          <span className="timeline-badge subtle">{record.confidenceLevel}</span>
        </div>
      </div>
      <h4>{record.summary}</h4>
      <p className="timeline-copy">{record.detailText || record.summary}</p>
      <div className="person-chip-row">
        {record.people.map((person) => (
          <span className="person-chip" key={`${record.id}-${person.slug}`}>
            {person.displayName}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function HomePage() {
  const [data, setData] = useState<CaseDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersonSlug, setSelectedPersonSlug] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSourceFilter, setActiveSourceFilter] = useState<SourceFilterKey>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadCaseData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/case-data", { cache: "no-store" });
        const payload = (await response.json()) as CaseDataResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Could not load case data.");
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCaseData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data?.investigation.defaultSelection.personSlug || selectedPersonSlug) {
      return;
    }

    setSelectedPersonSlug(data.investigation.defaultSelection.personSlug);
    setSearchQuery(data.investigation.defaultSelection.searchQuery);
    setActiveSourceFilter(data.investigation.defaultSelection.sourceFilter);
  }, [data, selectedPersonSlug]);

  const investigation: InvestigationData | null = data?.investigation || null;
  const recordsById = useMemo(() => {
    if (!investigation) {
      return new Map<string, EvidenceRecord>();
    }

    return new Map(investigation.evidenceRecords.map((record) => [record.id, record]));
  }, [investigation]);

  const normalizedQuery = useMemo(() => normalizeInvestigationText(searchQuery), [searchQuery]);
  const activeSourceType = getSourceFilterType(activeSourceFilter);

  const matchesRecord = (record: EvidenceRecord) => {
    if (activeSourceType && record.sourceType !== activeSourceType) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = normalizeInvestigationText(
      [
        record.summary,
        record.detailText,
        record.locationName,
        record.people.map((person) => person.displayName).join(" "),
      ].join(" "),
    );

    return haystack.includes(normalizedQuery);
  };

  const selectedPerson = useMemo(() => {
    if (!investigation) {
      return null;
    }

    return (
      investigation.people.find((person) => person.slug === selectedPersonSlug) ||
      investigation.people[0] ||
      null
    );
  }, [investigation, selectedPersonSlug]);

  const visiblePeople = useMemo(() => {
    if (!investigation) {
      return [];
    }

    return investigation.people.filter((person) => {
      if (!normalizedQuery && activeSourceFilter === "all") {
        return true;
      }

      const personText = normalizeInvestigationText(
        [
          person.displayName,
          person.aliases.join(" "),
          person.keyReasons.join(" "),
          person.counterEvidence.join(" "),
          person.lastSeenWithPodoLocation || "",
        ].join(" "),
      );

      if (normalizedQuery && personText.includes(normalizedQuery)) {
        return true;
      }

      return person.linkedRecordIds.some((recordId) => {
        const record = recordsById.get(recordId);
        return record ? matchesRecord(record) : false;
      });
    });
  }, [activeSourceFilter, investigation, normalizedQuery, recordsById]);

  const visibleTimelineStops = useMemo(() => {
    if (!investigation) {
      return [];
    }

    if (!normalizedQuery && activeSourceFilter === "all") {
      return investigation.timelineStops;
    }

    const filteredRecords = investigation.evidenceRecords.filter((record) => {
      if (!matchesRecord(record)) {
        return false;
      }

      if (record.relevance !== "background") {
        return true;
      }

      return selectedPerson ? record.people.some((person) => person.slug === selectedPerson.slug) : false;
    });

    return buildTimelineStops(filteredRecords, investigation.summary.routeEnd?.recordId || null);
  }, [activeSourceFilter, investigation, normalizedQuery, selectedPerson]);

  const selectedPersonRecords = useMemo(() => {
    if (!selectedPerson) {
      return [];
    }

    return selectedPerson.linkedRecordIds
      .map((recordId) => recordsById.get(recordId))
      .filter((record): record is EvidenceRecord => Boolean(record))
      .filter((record) => matchesRecord(record))
      .sort((left, right) => right.sortKey - left.sortKey);
  }, [recordsById, selectedPerson, activeSourceFilter, normalizedQuery]);

  return (
    <main>
      <div className="page-shell">
        <section className="hero">
          <p className="hero-kicker">Missing Podo: The Ankara Case</p>
          <h1>Follow Podo&apos;s route. Compare the clues. Narrow the strongest lead.</h1>
          <p>
            This investigation view keeps the five Jotform sources intact, but reorganizes them
            into one route, one suspect list, and one evidence panel so the likely answer is easier
            to follow.
          </p>
        </section>

        {loading ? (
          <div className="status-banner loading">Loading Jotform sources...</div>
        ) : null}

        {error ? <div className="status-banner error">{error}</div> : null}

        {!loading && !error && data && investigation ? (
          <>
            <section className="summary-grid">
              <SummaryCard
                label="Last confirmed sighting"
                value={
                  investigation.summary.routeEnd
                    ? `${investigation.summary.routeEnd.locationName}, ${investigation.summary.routeEnd.timestamp.split(" ")[1]}`
                    : "Unavailable"
                }
                detail="Last confirmed route endpoint in the current evidence set."
              />
              <SummaryCard
                label="Last seen with"
                value={investigation.summary.lastSeenWith?.displayName || "Unavailable"}
                detail="The person attached to Podo’s final confirmed co-presence record."
              />
              <SummaryCard
                label="Strongest lead"
                value={findPersonDisplayName(investigation.people, investigation.summary.primarySuspectSlug)}
                detail="Highest deterministic suspicion score from linked route evidence."
              />
              <SummaryCard
                label="Cleared false lead"
                value={findPersonDisplayName(investigation.people, investigation.summary.clearedLeadSlug)}
                detail="A person who looked suspicious at first but is weakened by later evidence."
              />
            </section>

            <section className="source-health">
              {investigation.sourceHealth.map((source) => (
                <article
                  className={`source-health-item ${source.status === "error" ? "source-health-item-error" : ""}`}
                  key={source.sourceName}
                >
                  <p className="source-health-name">{source.sourceName}</p>
                  <p className="source-health-copy">
                    {source.status === "error"
                      ? source.error
                      : `${source.count} records | ${source.questionCount} questions`}
                  </p>
                </article>
              ))}
            </section>

            <section className="controls-row">
              <label className="search-field">
                <span className="visually-hidden">Search evidence</span>
                <input
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by person, location, or clue"
                  type="search"
                  value={searchQuery}
                />
              </label>
              <div className="chip-row">
                {SOURCE_FILTERS.map((filter) => (
                  <button
                    className={`filter-chip ${filter.key === activeSourceFilter ? "filter-chip-active" : ""}`}
                    key={filter.key}
                    onClick={() => setActiveSourceFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="investigation-grid">
              <aside className="surface suspect-surface">
                <div className="surface-header">
                  <h2>People and Leads</h2>
                  <p>Sorted by evidence strength, not alphabetically.</p>
                </div>
                <div className="suspect-list">
                  {visiblePeople.length === 0 ? (
                    <p className="empty-text">No people match the current search.</p>
                  ) : (
                    visiblePeople.map((person) => (
                      <button
                        className={`suspect-row ${selectedPerson?.slug === person.slug ? "suspect-row-active" : ""}`}
                        key={person.slug}
                        onClick={() => setSelectedPersonSlug(person.slug)}
                        type="button"
                      >
                        <div className="suspect-row-top">
                          <h3>{person.displayName}</h3>
                          <span className={`role-pill role-pill-${person.role}`}>{ROLE_LABELS[person.role]}</span>
                        </div>
                        <p className="suspect-score">Suspicion score: {person.suspicionScore}</p>
                        <p className="suspect-reason">
                          {person.keyReasons[0] ||
                            person.counterEvidence[0] ||
                            "Connected to the route without a strong suspicious clue."}
                        </p>
                        <p className="suspect-meta">
                          {person.lastSeenWithPodoAt
                            ? `Last linked with Podo at ${person.lastSeenWithPodoLocation} (${person.lastSeenWithPodoAt})`
                            : "No direct linked moment with Podo."}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <section className="surface timeline-surface">
                <div className="surface-header">
                  <h2>Podo Route Timeline</h2>
                  <p>
                    {normalizedQuery || activeSourceFilter !== "all"
                      ? "Filtered evidence view. Suspect clues can appear here when they match the current search."
                      : "Default route view. Focused on records that directly mention or involve Podo."}
                  </p>
                </div>
                <div className="timeline-stop-list">
                  {visibleTimelineStops.length === 0 ? (
                    <p className="empty-text">No timeline entries match the current filters.</p>
                  ) : (
                    visibleTimelineStops.map((stop) => (
                      <section className="timeline-stop" key={`${stop.locationKey}-${stop.startAt}`}>
                        <div className="timeline-stop-header">
                          <div>
                            <p className="eyebrow">Location stop</p>
                            <h3>{stop.locationName}</h3>
                          </div>
                          <p className="timeline-stop-range">
                            {stop.startAt === stop.endAt ? stop.startAt : `${stop.startAt} → ${stop.endAt}`}
                          </p>
                        </div>
                        <div className="timeline-stop-entries">
                          {stop.entries.map((entry) => {
                            const record = recordsById.get(entry.recordId);

                            if (!record) {
                              return null;
                            }

                            const dimmed = selectedPerson
                              ? !record.people.some((person) => person.slug === selectedPerson.slug)
                              : false;

                            return <EvidenceItem dimmed={dimmed} key={entry.recordId} record={record} />;
                          })}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              </section>

              <aside className="surface detail-surface">
                {selectedPerson ? (
                  <div className="detail-stack">
                    <div className="surface-header">
                      <h2>{selectedPerson.displayName}</h2>
                      <p>Evidence-driven reading of why this person matters.</p>
                    </div>

                    <div className="detail-header">
                      <span className={`role-pill role-pill-${selectedPerson.role}`}>
                        {ROLE_LABELS[selectedPerson.role]}
                      </span>
                      <p className="detail-score">Suspicion score: {selectedPerson.suspicionScore}</p>
                    </div>

                    <section className="detail-section">
                      <h3>Aliases and coverage</h3>
                      <div className="person-chip-row">
                        {selectedPerson.aliases.map((alias) => (
                          <span className="person-chip" key={`${selectedPerson.slug}-${alias}`}>
                            {alias}
                          </span>
                        ))}
                      </div>
                      <p className="detail-copy">
                        Sources: {selectedPerson.sourceCoverage.join(", ")} | Direct Podo links:{" "}
                        {selectedPerson.directPodoTouches}
                      </p>
                    </section>

                    <section className="detail-section">
                      <h3>Why this person stands out</h3>
                      {selectedPerson.keyReasons.length === 0 ? (
                        <p className="empty-text">
                          No strong suspicious clue. This person is mostly supporting context.
                        </p>
                      ) : (
                        <ul className="detail-list">
                          {selectedPerson.keyReasons.map((reason) => (
                            <li key={`${selectedPerson.slug}-${reason}`}>{reason}</li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="detail-section">
                      <h3>Counter-evidence</h3>
                      {selectedPerson.counterEvidence.length === 0 ? (
                        <p className="empty-text">No strong counter-evidence recorded.</p>
                      ) : (
                        <ul className="detail-list">
                          {selectedPerson.counterEvidence.map((reason) => (
                            <li key={`${selectedPerson.slug}-${reason}`}>{reason}</li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="detail-section">
                      <h3>Last linked moment with Podo</h3>
                      {selectedPerson.lastSeenWithPodoAt ? (
                        <p className="detail-copy">
                          {selectedPerson.lastSeenWithPodoAt} at {selectedPerson.lastSeenWithPodoLocation}
                        </p>
                      ) : (
                        <p className="empty-text">No direct Podo-linked moment was detected.</p>
                      )}
                    </section>

                    <section className="detail-section">
                      <h3>Linked evidence</h3>
                      {selectedPersonRecords.length === 0 ? (
                        <p className="empty-text">No linked evidence matches the current filters.</p>
                      ) : (
                        <div className="linked-evidence-stack">
                          {selectedPersonRecords.map((record) => (
                            <article className="linked-evidence-item" key={record.id}>
                              <div className="linked-evidence-top">
                                <p className="timeline-time">{record.timestamp}</p>
                                <span className="timeline-badge">{SOURCE_TYPE_LABELS[record.sourceType]}</span>
                              </div>
                              <h4>{record.summary}</h4>
                              <p className="detail-copy">{record.detailText || record.summary}</p>
                              <p className="linked-evidence-meta">
                                {record.locationName} | {record.provenance.sourceName} | Submission{" "}
                                {record.provenance.submissionId}
                              </p>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <p className="empty-text">No person selected.</p>
                )}
              </aside>
            </section>

            <p className="footer-note">
              Base URL: {data.meta.baseUrl} | Fetched at: {data.meta.fetchedAt}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
