export type TrackerStepState = 'done' | 'active' | 'pending';
export type TrackerStage = 'submitted' | 'assigning' | 'assigned' | 'rescuing' | 'resolved';

export type TrackerStep = {
  key: 'submitted' | 'assigned' | 'inProgress' | 'resolved';
  title: string;
  details: string[];
  state: TrackerStepState;
};

export type DistressReportDoc = {
  reportId?: string;
  fullName?: string;
  name?: string;
  address?: string;
  contactNumber?: string;
  phone?: string;
  report?: string;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  assignedAt?: unknown;
  assignmentAt?: unknown;
  dispatchedAt?: unknown;
  acceptedAt?: unknown;
  inProgressAt?: unknown;
  respondingAt?: unknown;
  rescueStartedAt?: unknown;
  rescuingAt?: unknown;
  resolvedAt?: unknown;
  completedAt?: unknown;
  closedAt?: unknown;
  rescuedAt?: unknown;
  assignedTo?: string;
  assignedTeam?: string;
  responderTeam?: string;
  responseTeam?: string;
  barangayTeam?: string;
  teamName?: string;
};

type TimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
};

export const toDateValue = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  if (typeof value === 'object') {
    const timestampLike = value as TimestampLike;

    if (typeof timestampLike.toDate === 'function') {
      const parsedDate = timestampLike.toDate();
      return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())
        ? parsedDate
        : null;
    }

    if (typeof timestampLike.seconds === 'number') {
      const milliseconds = timestampLike.seconds * 1000;
      const nanos = typeof timestampLike.nanoseconds === 'number'
        ? Math.floor(timestampLike.nanoseconds / 1_000_000)
        : 0;
      return new Date(milliseconds + nanos);
    }
  }

  return null;
};

export const formatDateTime = (value: Date | null): string | null => {
  if (!value) {
    return null;
  }

  const dateLabel = value.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateLabel} ${timeLabel}`;
};

const normalizeStatus = (value?: string): string => {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const hasMatchingStatus = (normalizedStatus: string, patterns: string[]): boolean => {
  return patterns.some((pattern) => normalizedStatus === pattern || normalizedStatus.includes(pattern));
};

const getFirstDate = (...values: unknown[]): Date | null => {
  for (const value of values) {
    const parsedDate = toDateValue(value);
    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
};

const getFirstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmedValue = value.trim();
    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return null;
};

const compactText = (values: (string | null | undefined)[]): string[] => {
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
};

const getAssignedStepDate = ({
  assignedAt,
  inProgressAt,
  resolvedAt,
  updatedAt,
  createdAtDate,
}: {
  assignedAt: Date | null;
  inProgressAt: Date | null;
  resolvedAt: Date | null;
  updatedAt: Date | null;
  createdAtDate: Date | null;
}): Date | null => {
  return assignedAt ?? inProgressAt ?? resolvedAt ?? updatedAt ?? createdAtDate;
};

const getInProgressStepDate = ({
  inProgressAt,
  resolvedAt,
  updatedAt,
  assignedAt,
  createdAtDate,
}: {
  inProgressAt: Date | null;
  resolvedAt: Date | null;
  updatedAt: Date | null;
  assignedAt: Date | null;
  createdAtDate: Date | null;
}): Date | null => {
  return inProgressAt ?? resolvedAt ?? updatedAt ?? assignedAt ?? createdAtDate;
};

export const getTrackerStage = (report: DistressReportDoc): TrackerStage => {
  const normalizedStatus = normalizeStatus(report.status);
  const hasAssignedAt = Boolean(
    getFirstDate(report.assignedAt, report.assignmentAt, report.dispatchedAt, report.acceptedAt)
  );
  const hasInProgressAt = Boolean(
    getFirstDate(report.inProgressAt, report.respondingAt, report.rescueStartedAt, report.rescuingAt)
  );
  const hasResolvedAt = Boolean(
    getFirstDate(report.resolvedAt, report.completedAt, report.closedAt, report.rescuedAt)
  );

  if (
    hasMatchingStatus(normalizedStatus, ['resolved', 'completed', 'closed', 'done', 'rescued']) ||
    hasResolvedAt
  ) {
    return 'resolved';
  }

  if (
    hasMatchingStatus(normalizedStatus, ['assigning', 'pending_assignment', 'waiting_assignment', 'dispatching'])
  ) {
    return 'assigning';
  }

  if (
    hasMatchingStatus(normalizedStatus, [
      'in_progress',
      'progress',
      'responding',
      'rescuing',
      'en_route',
      'on_scene',
      'handling',
    ]) ||
    hasInProgressAt
  ) {
    return 'rescuing';
  }

  if (hasMatchingStatus(normalizedStatus, ['assigned', 'dispatched', 'accepted']) || hasAssignedAt) {
    return 'assigned';
  }

  return 'submitted';
};

export const getTrackerStageLabel = (report: DistressReportDoc): string => {
  const stage = getTrackerStage(report);

  switch (stage) {
    case 'assigning':
      return 'Assigning';
    case 'assigned':
      return 'Assigned';
    case 'rescuing':
      return 'In Progress';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Submitted';
  }
};

export const buildTrackerSteps = ({
  reportData,
  createdAtDate,
}: {
  reportData: DistressReportDoc;
  createdAtDate: Date | null;
}): TrackerStep[] => {
  const stage = getTrackerStage(reportData);
  const updatedAt = getFirstDate(reportData.updatedAt);
  const assignedAt = getFirstDate(
    reportData.assignedAt,
    reportData.assignmentAt,
    reportData.dispatchedAt,
    reportData.acceptedAt
  );
  const inProgressAt = getFirstDate(
    reportData.inProgressAt,
    reportData.respondingAt,
    reportData.rescueStartedAt,
    reportData.rescuingAt
  );
  const resolvedAt = getFirstDate(
    reportData.resolvedAt,
    reportData.completedAt,
    reportData.closedAt,
    reportData.rescuedAt
  );
  const assignedStepDate = getAssignedStepDate({
    assignedAt,
    inProgressAt,
    resolvedAt,
    updatedAt,
    createdAtDate,
  });
  const inProgressStepDate = getInProgressStepDate({
    inProgressAt,
    resolvedAt,
    updatedAt,
    assignedAt,
    createdAtDate,
  });
  const assignedTeam = getFirstText(
    reportData.assignedTeam,
    reportData.assignedTo,
    reportData.responderTeam,
    reportData.responseTeam,
    reportData.barangayTeam,
    reportData.teamName
  );

  const assignedState: TrackerStepState =
    stage === 'assigning' ? 'active' : stage === 'assigned' || stage === 'rescuing' || stage === 'resolved' ? 'done' : 'pending';
  const inProgressState: TrackerStepState =
    stage === 'rescuing' ? 'active' : stage === 'resolved' ? 'done' : 'pending';
  const resolvedState: TrackerStepState = stage === 'resolved' ? 'done' : 'pending';

  return [
    {
      key: 'submitted',
      title: 'Report Submitted',
      state: 'done',
      details: compactText([formatDateTime(createdAtDate)]),
    },
    {
      key: 'assigned',
      title: 'Assigned',
      state: assignedState,
      details:
        assignedState === 'pending'
          ? []
          : assignedState === 'active'
            ? compactText([
                'Assigning responders to your report.',
                formatDateTime(assignedStepDate),
              ])
            : compactText([
                assignedTeam ? `Assigned to ${assignedTeam}` : 'Responders have been assigned.',
                formatDateTime(assignedStepDate),
              ]),
    },
    {
      key: 'inProgress',
      title: 'In Progress',
      state: inProgressState,
      details:
        inProgressState === 'pending'
          ? []
          : inProgressState === 'active'
            ? compactText([
                'Responders are currently handling the incident.',
                formatDateTime(inProgressStepDate),
              ])
            : compactText([
                'Responders handled the incident.',
                formatDateTime(inProgressStepDate),
              ]),
    },
    {
      key: 'resolved',
      title: 'Resolved',
      state: resolvedState,
      details:
        resolvedState === 'done'
          ? compactText([
              'The report has been marked resolved.',
              formatDateTime(resolvedAt ?? updatedAt),
            ])
          : [],
    },
  ];
};
