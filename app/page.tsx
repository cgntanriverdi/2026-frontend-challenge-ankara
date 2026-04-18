"use client";

import { useEffect, useMemo, useState } from "react";
import type { CaseDataResponse } from "../lib/case-data";
import {
  buildTimelineStops,
  getSourceFilterType,
  normalizeInvestigationText,
  type EvidenceRecord,
  type InvestigationData,
  type LinkedPersonRef,
  type PersonSummary,
  type SourceFilterKey,
  type SourceHealth,
  type TimelineStop,
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

const AVATAR_TONES = [
  { backgroundColor: "#10243f", borderColor: "#164e63", color: "#7dd3fc" },
  { backgroundColor: "#1b1f3b", borderColor: "#3730a3", color: "#c4b5fd" },
  { backgroundColor: "#17262c", borderColor: "#0f766e", color: "#5eead4" },
  { backgroundColor: "#2b1c31", borderColor: "#9d174d", color: "#f9a8d4" },
  { backgroundColor: "#2b2115", borderColor: "#b45309", color: "#fbbf24" },
  { backgroundColor: "#1d2a1f", borderColor: "#166534", color: "#86efac" },
];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") || "")
    .join("");
}

function getAvatarTone(slug: string) {
  let hash = 0;

  for (const character of slug) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }

  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function formatStopRange(stop: TimelineStop) {
  return stop.startAt === stop.endAt ? stop.startAt : `${stop.startAt} → ${stop.endAt}`;
}

function SourceHealthPill({ source }: { source: SourceHealth }) {
  const label =
    source.status === "error"
      ? "Source error"
      : source.status === "empty"
        ? "Empty"
        : `${source.count} records`;

  return (
    <article
      className={`health-pill ${source.status === "error" ? "health-pill-error" : ""}`}
      aria-label={`${source.sourceName}: ${label}`}
    >
      <span className="health-pill-name">{source.sourceName}</span>
      <span className="health-pill-value">{label}</span>
    </article>
  );
}

function AvatarStack({
  people,
  size = "medium",
}: {
  people: LinkedPersonRef[];
  size?: "medium" | "small";
}) {
  return (
    <div className={`avatar-stack avatar-stack-${size}`}>
      {people.map((person) => {
        const tone = getAvatarTone(person.slug);

        return (
          <span
            aria-label={person.displayName}
            className={`person-avatar person-avatar-${size}`}
            key={`${person.slug}-${size}`}
            style={tone}
            title={person.displayName}
          >
            {getInitials(person.displayName)}
          </span>
        );
      })}
    </div>
  );
}

function EvidenceCard({
  record,
  compact = false,
}: {
  record: EvidenceRecord;
  compact?: boolean;
}) {
  return (
    <article className={`evidence-card ${compact ? "evidence-card-compact" : ""}`}>
      <div className="evidence-card-top">
        <p className="evidence-time">{record.timestamp}</p>
        <div className="evidence-badges">
          <span className="evidence-badge">{SOURCE_TYPE_LABELS[record.sourceType]}</span>
          <span className="evidence-badge evidence-badge-subtle">{record.confidenceLevel}</span>
        </div>
      </div>
      <h4>{record.summary}</h4>
      <p className="evidence-copy">{record.detailText || record.summary}</p>
      <AvatarStack people={record.people} size="small" />
      <p className="evidence-meta">
        {record.locationName} | {record.provenance.sourceName} | Submission {record.provenance.submissionId}
      </p>
    </article>
  );
}

export default function HomePage() {
  const [data, setData] = useState<CaseDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersonSlug, setSelectedPersonSlug] = useState("");
  const [selectedStopLocationKey, setSelectedStopLocationKey] = useState<string | null>(null);
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

  const allTimelineStops = useMemo(() => {
    if (!investigation) {
      return [];
    }

    return buildTimelineStops(
      investigation.evidenceRecords,
      investigation.summary.routeEnd?.recordId || null,
    );
  }, [investigation]);

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

  const selectedStop = useMemo(() => {
    if (!selectedStopLocationKey) {
      return null;
    }

    return (
      allTimelineStops.find((stop) => stop.locationKey === selectedStopLocationKey) ||
      null
    );
  }, [allTimelineStops, selectedStopLocationKey]);

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

  const selectedStopRecords = useMemo(() => {
    if (!investigation || !selectedStop) {
      return [];
    }

    return investigation.evidenceRecords
      .filter((record) => record.locationName === selectedStop.locationKey)
      .filter((record) => matchesRecord(record))
      .sort((left, right) => left.sortKey - right.sortKey);
  }, [investigation, selectedStop, activeSourceFilter, normalizedQuery]);

  const detailMode = selectedStop ? "stop" : "person";

  return (
    <main>
      <div className="page-shell operation-shell">
        <section className="top-console">
          <div className="top-console-brand">
            <p className="console-kicker">Missing Podo</p>
            <h1>Investigation Console</h1>
            <p className="console-copy">
              Track the route, narrow the suspect, and inspect evidence without leaving the screen.
            </p>
          </div>

          <div className="top-console-tools">
            <label className="console-search">
              <span className="visually-hidden">Search evidence</span>
              <input
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by person, location, or clue"
                type="search"
                value={searchQuery}
              />
            </label>

            <div className="console-filter-row" role="toolbar" aria-label="Source filters">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  aria-pressed={filter.key === activeSourceFilter}
                  className={`filter-chip ${filter.key === activeSourceFilter ? "filter-chip-active" : ""}`}
                  key={filter.key}
                  onClick={() => setActiveSourceFilter(filter.key)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {investigation ? (
              <div className="health-pill-row" aria-label="Source health">
                {investigation.sourceHealth.map((source) => (
                  <SourceHealthPill key={source.sourceName} source={source} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="status-banner status-banner-loading">Loading Jotform sources...</div>
        ) : null}

        {error ? <div className="status-banner status-banner-error">{error}</div> : null}

        {!loading && !error && data && investigation ? (
          <>
            <section className="operation-grid">
              <aside className="operation-panel people-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">People</p>
                    <h2>Suspects and witnesses</h2>
                  </div>
                  <span className="panel-meta">{visiblePeople.length} visible</span>
                </div>

                <div className="panel-scroll person-list">
                  {visiblePeople.length === 0 ? (
                    <p className="empty-text">No people match the current search.</p>
                  ) : (
                    visiblePeople.map((person) => (
                      <button
                        aria-pressed={selectedPerson?.slug === person.slug}
                        className={`person-row ${selectedPerson?.slug === person.slug ? "person-row-active" : ""}`}
                        key={person.slug}
                        onClick={() => {
                          setSelectedPersonSlug(person.slug);
                          setSelectedStopLocationKey(null);
                        }}
                        type="button"
                      >
                        <div className="person-row-top">
                          <div className="person-row-title">
                            <AvatarStack people={[{ slug: person.slug, displayName: person.displayName }]} size="small" />
                            <div>
                              <h3>{person.displayName}</h3>
                              <p className="person-row-subtitle">
                                {person.lastSeenWithPodoAt
                                  ? `${person.lastSeenWithPodoLocation} • ${person.lastSeenWithPodoAt}`
                                  : "No direct linked moment with Podo"}
                              </p>
                            </div>
                          </div>
                          <span className={`role-pill role-pill-${person.role}`}>{ROLE_LABELS[person.role]}</span>
                        </div>

                        <div className="person-row-bottom">
                          <p className="person-score">Score {person.suspicionScore}</p>
                          <p className="person-row-reason">
                            {person.keyReasons[0] ||
                              person.counterEvidence[0] ||
                              "Connected to the route without a strong suspicious clue."}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <section className="operation-panel route-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">Metro line</p>
                    <h2>Podo route timeline</h2>
                  </div>
                  <span className="panel-meta">
                    {selectedPerson ? `Focus: ${selectedPerson.displayName}` : "All route stops"}
                  </span>
                </div>

                <div className="panel-scroll metro-list">
                  {visibleTimelineStops.length === 0 ? (
                    <p className="empty-text">No timeline stops match the current filters.</p>
                  ) : (
                    visibleTimelineStops.map((stop) => {
                      const dimmed =
                        selectedPersonSlug.length > 0 &&
                        !stop.people.some((person) => person.slug === selectedPersonSlug);
                      const isSelected = selectedStopLocationKey === stop.locationKey;
                      const previewEntry = stop.entries[0];

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`metro-stop ${isSelected ? "metro-stop-active" : ""} ${dimmed ? "metro-stop-dimmed" : ""} ${stop.isCriticalStop ? "metro-stop-critical" : ""}`}
                          key={`${stop.locationKey}-${stop.startAt}`}
                          onClick={() => setSelectedStopLocationKey(stop.locationKey)}
                          type="button"
                        >
                          <span className="metro-rail" aria-hidden="true">
                            <span
                              className={`metro-bubble ${stop.isCriticalStop ? "metro-bubble-critical" : ""}`}
                            />
                          </span>

                          <div className="metro-content">
                            <div className="metro-top-row">
                              <div>
                                <p className="metro-label">Stop</p>
                                <p className="metro-title">{stop.locationName}</p>
                              </div>
                              <p className="metro-range">{formatStopRange(stop)}</p>
                            </div>

                            <div className="metro-meta-row">
                              <AvatarStack people={stop.people} size="small" />
                              <p className="metro-count">
                                {stop.entries.length} evidence item{stop.entries.length > 1 ? "s" : ""}
                              </p>
                            </div>

                            {previewEntry ? (
                              <p className="metro-preview">{previewEntry.summary}</p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <aside className="operation-panel detail-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-label">{detailMode === "stop" ? "Stop detail" : "Person detail"}</p>
                    <h2>
                      {detailMode === "stop"
                        ? selectedStop?.locationName || "Stop detail"
                        : selectedPerson?.displayName || "Person detail"}
                    </h2>
                  </div>
                  {detailMode === "stop" ? (
                    <button
                      className="clear-stop-button"
                      onClick={() => setSelectedStopLocationKey(null)}
                      type="button"
                    >
                      Back to person
                    </button>
                  ) : (
                    <span className="panel-meta">
                      {selectedPerson ? ROLE_LABELS[selectedPerson.role] : "No selection"}
                    </span>
                  )}
                </div>

                <div className="panel-scroll detail-scroll">
                  {detailMode === "stop" && selectedStop ? (
                    <div className="detail-stack">
                      <section className="detail-section detail-section-elevated">
                        <p className="detail-copy">{formatStopRange(selectedStop)}</p>
                        <AvatarStack people={selectedStop.people} />
                      </section>

                      <section className="detail-section">
                        <h3>Evidence at this stop</h3>
                        {selectedStopRecords.length === 0 ? (
                          <p className="empty-text">No stop evidence matches the current filters.</p>
                        ) : (
                          <div className="evidence-list">
                            {selectedStopRecords.map((record) => (
                              <EvidenceCard key={record.id} record={record} />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : selectedPerson ? (
                    <div className="detail-stack">
                      <section className="detail-section detail-section-elevated">
                        <div className="detail-person-header">
                          <AvatarStack
                            people={[{ slug: selectedPerson.slug, displayName: selectedPerson.displayName }]}
                          />
                          <div>
                            <span className={`role-pill role-pill-${selectedPerson.role}`}>
                              {ROLE_LABELS[selectedPerson.role]}
                            </span>
                            <p className="detail-score">Suspicion score: {selectedPerson.suspicionScore}</p>
                          </div>
                        </div>

                        <div className="detail-chip-group">
                          {selectedPerson.aliases.map((alias) => (
                            <span className="detail-chip" key={`${selectedPerson.slug}-${alias}`}>
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
                          <p className="empty-text">No strong suspicious clue. This person is mostly supporting context.</p>
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
                          <div className="evidence-list">
                            {selectedPersonRecords.map((record) => (
                              <EvidenceCard key={record.id} record={record} />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : (
                    <p className="empty-text">No detail context is selected.</p>
                  )}
                </div>
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
