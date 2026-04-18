"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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

const DIRECTORY_ROLE_LABELS: Record<PersonSummary["role"], string> = {
  "primary-suspect": "Suspect",
  "person-of-interest": "POI",
  witness: "Witness",
  cleared: "Cleared",
};

const AVATAR_TONES = [
  { backgroundColor: "#10243f", borderColor: "#164e63", color: "#7dd3fc" },
  { backgroundColor: "#1b1f3b", borderColor: "#3730a3", color: "#c4b5fd" },
  { backgroundColor: "#17262c", borderColor: "#0f766e", color: "#5eead4" },
  { backgroundColor: "#2b1c31", borderColor: "#9d174d", color: "#f9a8d4" },
  { backgroundColor: "#2b2115", borderColor: "#b45309", color: "#fbbf24" },
  { backgroundColor: "#1d2a1f", borderColor: "#166534", color: "#86efac" },
];

type RouteStopLayout = {
  locationKey: string;
  x: number;
  y: number;
  anchor: "top" | "bottom" | "left" | "right";
};

const ROUTE_STOP_LAYOUT: RouteStopLayout[] = [
  { locationKey: "CerModern", x: 12, y: 72, anchor: "top" },
  { locationKey: "Tunalı Hilmi Caddesi", x: 28, y: 58, anchor: "bottom" },
  { locationKey: "Kuğulu Park", x: 45, y: 43, anchor: "top" },
  { locationKey: "Seğmenler Parkı", x: 60, y: 56, anchor: "bottom" },
  { locationKey: "Atakule", x: 76, y: 36, anchor: "left" },
  { locationKey: "Ankara Kalesi", x: 90, y: 18, anchor: "bottom" },
];

const ROUTE_STOP_LAYOUT_BY_KEY = new Map(
  ROUTE_STOP_LAYOUT.map((layout) => [layout.locationKey, layout]),
);

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
  if (!stop.startAt && !stop.endAt) {
    return "Route stop";
  }

  return stop.startAt === stop.endAt ? stop.startAt : `${stop.startAt} → ${stop.endAt}`;
}

function createEmptyStop(locationKey: string): TimelineStop {
  return {
    locationKey,
    locationName: locationKey,
    coordinates: "",
    startAt: "",
    endAt: "",
    people: [],
    isCriticalStop: locationKey === "Ankara Kalesi",
    entries: [],
  };
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
  isExpanded,
  onToggle,
}: {
  record: EvidenceRecord;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const detailsId = `evidence-details-${record.id}`;

  return (
    <article className={`evidence-card ${isExpanded ? "evidence-card-expanded" : ""}`}>
      <button
        aria-controls={detailsId}
        aria-expanded={isExpanded}
        className="evidence-card-trigger"
        onClick={onToggle}
        type="button"
      >
        <span className="evidence-card-row">
          <span className="evidence-card-summary">
            <span className="evidence-title">{record.summary}</span>
            <span className="evidence-summary-meta">
              <span className="evidence-time">{record.timestamp}</span>
              {record.people.length > 0 ? <AvatarStack people={record.people} size="small" /> : null}
            </span>
          </span>
          <span className="evidence-expand-hint" aria-hidden="true">
            <span>{isExpanded ? "Collapse" : "Expand"}</span>
            <span className={`evidence-chevron ${isExpanded ? "evidence-chevron-expanded" : ""}`}>
              ▾
            </span>
          </span>
        </span>
      </button>

      <div className="evidence-card-body" id={detailsId}>
        <div className="evidence-card-body-inner">
          <p className="evidence-copy">{record.detailText || record.summary}</p>
          <AvatarStack people={record.people} size="small" />
          <div className="evidence-meta-group">
            <p className="evidence-meta">Source: {record.provenance.sourceName}</p>
            <p className="evidence-meta">Submission ID: {record.provenance.submissionId}</p>
          </div>
        </div>
      </div>
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
  const [expandedEvidenceId, setExpandedEvidenceId] = useState<string | null>(null);
  const hasAppliedDefaultSelection = useRef(false);

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
    if (
      hasAppliedDefaultSelection.current ||
      !data?.investigation.defaultSelection.personSlug
    ) {
      return;
    }

    hasAppliedDefaultSelection.current = true;
    setSelectedPersonSlug(data.investigation.defaultSelection.personSlug);
    setSearchQuery(data.investigation.defaultSelection.searchQuery);
    setActiveSourceFilter(data.investigation.defaultSelection.sourceFilter);
  }, [data]);

  useEffect(() => {
    setExpandedEvidenceId(null);
  }, [selectedPersonSlug, selectedStopLocationKey, activeSourceFilter, searchQuery]);

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
    if (!investigation || !selectedPersonSlug) {
      return null;
    }

    return investigation.people.find((person) => person.slug === selectedPersonSlug) || null;
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

  const routeMapStops = useMemo(() => {
    if (!investigation) {
      return [];
    }

    const allStopsByLocation = new Map(
      allTimelineStops.map((stop) => [stop.locationKey, stop]),
    );
    const filteredStopsByLocation = new Map(
      visibleTimelineStops.map((stop) => [stop.locationKey, stop]),
    );

    return ROUTE_STOP_LAYOUT.map((layout) => {
      const baseStop = allStopsByLocation.get(layout.locationKey) || createEmptyStop(layout.locationKey);
      const filteredStop = filteredStopsByLocation.get(layout.locationKey);

      return {
        ...baseStop,
        people: filteredStop?.people || [],
        entries: filteredStop?.entries || [],
      };
    });
  }, [allTimelineStops, investigation, visibleTimelineStops]);

  const routePolylinePoints = useMemo(
    () => ROUTE_STOP_LAYOUT.map((layout) => `${layout.x},${layout.y}`).join(" "),
    [],
  );

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
  const hasActiveFocus =
    selectedPersonSlug.length > 0 ||
    selectedStopLocationKey !== null ||
    searchQuery.length > 0 ||
    activeSourceFilter !== "all";

  return (
    <main>
      <div className="page-shell operation-shell">
        <section className="top-console">
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
                    <h2>People</h2>
                  </div>
                  <div className="panel-header-actions">
                    {hasActiveFocus ? (
                      <button
                        className="clear-focus-button"
                        onClick={() => {
                          setSelectedPersonSlug("");
                          setSelectedStopLocationKey(null);
                          setSearchQuery("");
                          setActiveSourceFilter("all");
                        }}
                        type="button"
                      >
                        Clear focus
                      </button>
                    ) : null}
                    <span className="panel-meta panel-meta-nowrap">{visiblePeople.length} visible</span>
                  </div>
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
                        <div className="person-row-main">
                          <div className="person-row-left">
                            <AvatarStack people={[{ slug: person.slug, displayName: person.displayName }]} size="small" />
                            <h3>{person.displayName}</h3>
                          </div>
                          <span className={`role-pill role-pill-${person.role}`}>
                            {DIRECTORY_ROLE_LABELS[person.role]}
                          </span>
                          <p aria-label={`Suspicion score ${person.suspicionScore}`} className="person-score">
                            {person.suspicionScore}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <section
                aria-label={selectedPerson ? `Podo route focused on ${selectedPerson.displayName}` : "Podo route"}
                className="operation-panel route-panel"
              >
                <div className="route-panel-header">
                  <h2 className="route-panel-title">Timeline of Podo</h2>
                </div>
                <div className="route-map-shell">
                  <div aria-hidden="true" className="route-map-grid" />

                  <svg
                    aria-hidden="true"
                    className="route-map-svg"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <polyline className="route-map-line-glow" points={routePolylinePoints} />
                    <polyline className="route-map-line" points={routePolylinePoints} />
                  </svg>

                  {routeMapStops.map((stop) => {
                    const layout = ROUTE_STOP_LAYOUT_BY_KEY.get(stop.locationKey);

                    if (!layout) {
                      return null;
                    }

                    const isSelected = selectedStopLocationKey === stop.locationKey;
                    const dimmed =
                      !isSelected &&
                      selectedPersonSlug.length > 0 &&
                      !stop.people.some((person) => person.slug === selectedPersonSlug);
                    const stopStyle = {
                      "--stop-left": `${layout.x}%`,
                      "--stop-top": `${layout.y}%`,
                    } as CSSProperties;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`route-stop route-stop-anchor-${layout.anchor} ${isSelected ? "route-stop-active" : ""} ${dimmed ? "route-stop-dimmed" : ""} ${stop.isCriticalStop ? "route-stop-critical" : ""}`}
                        key={stop.locationKey}
                        onClick={() => setSelectedStopLocationKey(stop.locationKey)}
                        style={stopStyle}
                        type="button"
                      >
                        <span className="route-stop-pin" aria-hidden="true" />

                        <span className="route-stop-card">
                          <span className="route-stop-name">{stop.locationName}</span>
                          {stop.people.length > 0 ? <AvatarStack people={stop.people} size="small" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="operation-panel detail-panel">
                <div className="panel-header">
                  <div>
                    <h2>
                      {detailMode === "stop"
                        ? selectedStop?.locationName || "Stop detail"
                        : selectedPerson?.displayName || "Overview"}
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
                  ) : selectedPerson ? (
                    <span className="panel-meta">
                      {selectedPerson ? ROLE_LABELS[selectedPerson.role] : "No selection"}
                    </span>
                  ) : null}
                </div>

                <div className="panel-scroll detail-scroll">
                  {detailMode === "stop" && selectedStop ? (
                    <div className="detail-stack">
                      <section className="detail-section detail-section-elevated detail-stop-summary">
                        <div className="detail-stop-grid">
                          <div className="detail-stop-block">
                            <p className="detail-kicker">Start</p>
                            <p className="detail-stop-time">{selectedStop.startAt || "Unknown"}</p>
                          </div>
                          <div className="detail-stop-block">
                            <p className="detail-kicker">End</p>
                            <p className="detail-stop-time">{selectedStop.endAt || "Unknown"}</p>
                          </div>
                        </div>

                        <div className="detail-stop-block">
                          <p className="detail-kicker">People at this stop</p>
                          {selectedStop.people.length > 0 ? (
                            <AvatarStack people={selectedStop.people} />
                          ) : (
                            <p className="empty-text">No linked people for this stop.</p>
                          )}
                        </div>
                      </section>

                      <section className="detail-section">
                        <h3>Evidence at this stop</h3>
                        {selectedStopRecords.length === 0 ? (
                          <p className="empty-text">No stop evidence matches the current filters.</p>
                        ) : (
                          <div className="evidence-list">
                            {selectedStopRecords.map((record) => (
                              <EvidenceCard
                                isExpanded={expandedEvidenceId === record.id}
                                key={record.id}
                                onToggle={() =>
                                  setExpandedEvidenceId((current) =>
                                    current === record.id ? null : record.id,
                                  )
                                }
                                record={record}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : selectedPerson ? (
                    <div className="detail-stack">
                      <section className="detail-section detail-person-summary">
                        <div className="detail-chip-group">
                          {selectedPerson.aliases.map((alias) => (
                            <span className="detail-chip" key={`${selectedPerson.slug}-${alias}`}>
                              {alias}
                            </span>
                          ))}
                        </div>

                        <div className="detail-person-facts">
                          <p className="detail-score">Suspicion score: {selectedPerson.suspicionScore}</p>
                          <p className="detail-score">
                            Direct Podo links: {selectedPerson.directPodoTouches}
                          </p>
                        </div>

                        <p className="detail-copy">
                          Sources: {selectedPerson.sourceCoverage.join(", ")}
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
                              <EvidenceCard
                                isExpanded={expandedEvidenceId === record.id}
                                key={record.id}
                                onToggle={() =>
                                  setExpandedEvidenceId((current) =>
                                    current === record.id ? null : record.id,
                                  )
                                }
                                record={record}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : (
                    <section className="detail-empty-state">
                      <p className="detail-copy">
                        Select a suspect from the list to filter the map, or click a node on the
                        route to inspect evidence.
                      </p>
                    </section>
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
