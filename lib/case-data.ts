export type CaseSourceDefinition = {
  sourceName: string;
  formId: string;
};

export type Question = {
  qid: string;
  text: string;
  type: string;
  name: string;
};

export type Answer = {
  qid: string;
  text: string;
  answer: string | string[] | null;
};

export type Submission = {
  id: string;
  createdAt: string;
  answers: Answer[];
};

export type CaseSourceSuccess = {
  sourceName: string;
  formId: string;
  status: "ok" | "empty";
  count: number;
  questions: Question[];
  submissions: Submission[];
};

export type CaseSourceError = {
  sourceName: string;
  formId: string;
  status: "error";
  count: 0;
  questions: [];
  submissions: [];
  error: string;
};

export type CaseSourceResult = CaseSourceSuccess | CaseSourceError;

export type CaseDataResponse = {
  sources: CaseSourceResult[];
  errors: Array<{
    sourceName: string;
    formId: string;
    message: string;
  }>;
  meta: {
    baseUrl: string;
    fetchedAt: string;
  };
};

type JotformEnvelope<T> = {
  responseCode: number;
  message: string;
  content: T;
};

type JotformQuestionRecord = {
  text?: string;
  type?: string;
  name?: string;
};

type JotformSubmissionRecord = {
  id?: string;
  created_at?: string;
  answers?: Record<
    string,
    {
      text?: string;
      answer?: string | string[] | null;
    }
  >;
};

const CASE_SOURCES: CaseSourceDefinition[] = [
  { sourceName: "Checkins", formId: "261065067494966" },
  { sourceName: "Messages", formId: "261065765723966" },
  { sourceName: "Sightings", formId: "261065244786967" },
  { sourceName: "Personal Notes", formId: "261065509008958" },
  { sourceName: "Anonymous Tips", formId: "261065875889981" },
];

function getBaseUrl() {
  return process.env.JOTFORM_API_BASE_URL || "https://api.jotform.com";
}

function getApiKey() {
  const apiKey = process.env.JOTFORM_API_KEY;

  if (!apiKey) {
    throw new Error("Missing JOTFORM_API_KEY.");
  }

  return apiKey;
}

async function jotformFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      APIKEY: getApiKey(),
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as JotformEnvelope<T>;

  if (!response.ok || payload.responseCode !== 200) {
    throw new Error(payload.message || `Jotform request failed for ${path}`);
  }

  return payload.content;
}

function normalizeQuestions(
  content: Record<string, JotformQuestionRecord>,
): Question[] {
  return Object.entries(content).map(([qid, question]) => ({
    qid,
    text: question.text || "",
    type: question.type || "unknown",
    name: question.name || "",
  }));
}

function normalizeSubmissions(content: JotformSubmissionRecord[]): Submission[] {
  return content.map((submission) => ({
    id: submission.id || "",
    createdAt: submission.created_at || "",
    answers: Object.entries(submission.answers || {}).map(([qid, answer]) => ({
      qid,
      text: answer.text || "",
      answer: answer.answer ?? null,
    })),
  }));
}

async function getSourceData(source: CaseSourceDefinition): Promise<CaseSourceResult> {
  try {
    const [questionsPayload, submissionsPayload] = await Promise.all([
      jotformFetch<Record<string, JotformQuestionRecord>>(`/form/${source.formId}/questions`),
      jotformFetch<JotformSubmissionRecord[]>(
        `/form/${source.formId}/submissions?offset=0&limit=1000`,
      ),
    ]);

    const questions = normalizeQuestions(questionsPayload);
    const submissions = normalizeSubmissions(submissionsPayload);

    return {
      sourceName: source.sourceName,
      formId: source.formId,
      status: submissions.length === 0 ? "empty" : "ok",
      count: submissions.length,
      questions,
      submissions,
    };
  } catch (error) {
    return {
      sourceName: source.sourceName,
      formId: source.formId,
      status: "error",
      count: 0,
      questions: [],
      submissions: [],
      error: error instanceof Error ? error.message : "Unknown source error.",
    };
  }
}

export async function getCaseData(): Promise<CaseDataResponse> {
  const sources = await Promise.all(CASE_SOURCES.map((source) => getSourceData(source)));

  return {
    sources,
    errors: sources
      .filter((source): source is CaseSourceError => source.status === "error")
      .map((source) => ({
        sourceName: source.sourceName,
        formId: source.formId,
        message: source.error,
      })),
    meta: {
      baseUrl: getBaseUrl(),
      fetchedAt: new Date().toISOString(),
    },
  };
}

