"use client";

import { useEffect, useState } from "react";
import type { CaseDataResponse, CaseSourceResult } from "../lib/case-data";

function renderAnswerValue(answer: string | string[] | null) {
  if (answer === null || answer === "") {
    return "No answer";
  }

  if (Array.isArray(answer)) {
    return answer.join(", ");
  }

  return answer;
}

function SourceCard({ source }: { source: CaseSourceResult }) {
  if (source.status === "error") {
    return (
      <article className="source-card error">
        <div className="source-header">
          <div>
            <h2>{source.sourceName}</h2>
            <p className="source-meta">Form ID: {source.formId}</p>
          </div>
          <span className="pill error">Error</span>
        </div>
        <p className="empty-text">{source.error}</p>
      </article>
    );
  }

  return (
    <article className="source-card">
      <div className="source-header">
        <div>
          <h2>{source.sourceName}</h2>
          <p className="source-meta">
            Form ID: {source.formId} | Questions: {source.questions.length} | Submissions:{" "}
            {source.count}
          </p>
        </div>
        <span className="pill">{source.status}</span>
      </div>

      <div className="split-grid">
        <section className="panel">
          <h3>Questions</h3>
          {source.questions.length === 0 ? (
            <p className="empty-text">No questions returned.</p>
          ) : (
            <ul className="question-list">
              {source.questions.map((question) => (
                <li className="question-item" key={question.qid}>
                  <p className="question-label">{question.text || "Untitled question"}</p>
                  <p className="question-meta">
                    qid: {question.qid} | type: {question.type} | name: {question.name || "-"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h3>Submissions</h3>
          {source.submissions.length === 0 ? (
            <p className="empty-text">No submissions returned.</p>
          ) : (
            <div className="submission-stack">
              {source.submissions.map((submission) => (
                <article className="submission-item" key={submission.id}>
                  <p className="submission-meta">
                    Submission ID: {submission.id} | Created: {submission.createdAt}
                  </p>
                  <ul className="answer-list">
                    {submission.answers.map((answer) => (
                      <li key={`${submission.id}-${answer.qid}`}>
                        <p className="answer-label">{answer.text}</p>
                        <p className="answer-value">{renderAnswerValue(answer.answer)}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [data, setData] = useState<CaseDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main>
      <div className="page-shell">
        <section className="hero">
          <h1>Missing Podo: MVP Fetch</h1>
          <p>
            This first pass only proves the data pipeline. It fetches the five Jotform sources,
            normalizes the response shape lightly, and renders the raw records.
          </p>
        </section>

        {loading ? (
          <div className="status-banner loading">Loading Jotform sources...</div>
        ) : null}

        {error ? <div className="status-banner error">{error}</div> : null}

        {!loading && !error && data ? (
          <>
            <div className="status-banner">
              Loaded {data.sources.length} sources. Source-level errors: {data.errors.length}.
            </div>

            <section className="source-grid">
              {data.sources.map((source) => (
                <SourceCard key={source.formId} source={source} />
              ))}
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

