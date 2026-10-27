import { useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router';
import {
  api,
  errorMessage,
  useLoad,
  writeErrorMessage,
  type AgentSession,
  type WeeklyHour,
} from '../../api';
import { formatWallTime, parseWallTime, WEEKDAY_NAMES } from '../../time';
import { Field } from '../../ui/Field';
import { PageHeader } from '../../ui/PageHeader';

const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0];

type Range = { start: string; end: string };

export default function HoursPage() {
  const agent = useOutletContext<AgentSession>();
  const [saved, setSaved] = useState<WeeklyHour[]>();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const loaded = useLoad('hours', () => api.agentListWeeklyHours());
  const hours = saved ?? loaded.data;

  async function saveDay(weekday: number, range: Range | null) {
    const others = hours!.filter((hour) => hour.weekday !== weekday);
    setSaved(
      await api.agentReplaceWeeklyHours(
        range ? [...others, { weekday, start_local: range.start, end_local: range.end }] : others,
      ),
    );
    setEditingDay(null);
  }

  return (
    <>
      <title>Hours</title>
      <PageHeader
        title="Hours"
        description={`The weekly times visitors can book. Times in ${agent.timezone}.`}
      />

      {hours === undefined ? (
        loaded.error !== undefined ? (
          <p className="error">{errorMessage(loaded.error)}</p>
        ) : (
          <p className="quiet">Loading…</p>
        )
      ) : (
        <section className="section" aria-label="Weekly hours">
          <ul className="rows">
            {WEEK_FROM_MONDAY.map((weekday) => {
              const ranges = hours.filter((hour) => hour.weekday === weekday);
              return (
                <li key={weekday}>
                  <span className="label row-label">{WEEKDAY_NAMES[weekday]}</span>
                  {editingDay === weekday ? (
                    <HoursEditor
                      weekday={weekday}
                      ranges={ranges}
                      onSave={(range) => saveDay(weekday, range)}
                      onCancel={() => setEditingDay(null)}
                    />
                  ) : (
                    <>
                      <span className="row-value">
                        {ranges.length === 0
                          ? 'Closed'
                          : ranges
                              .map(
                                (r) =>
                                  `${formatWallTime(r.start_local)}–${formatWallTime(r.end_local)}`,
                              )
                              .join(', ')}
                      </span>
                      <button
                        type="button"
                        className="button"
                        disabled={editingDay !== null}
                        onClick={() => setEditingDay(weekday)}
                      >
                        Edit
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {hours.length === 0 && <p>The public page stays empty until hours are set.</p>}
        </section>
      )}
    </>
  );
}

function HoursEditor({
  weekday,
  ranges,
  onSave,
  onCancel,
}: {
  weekday: number;
  ranges: WeeklyHour[];
  onSave: (range: Range | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [closed, setClosed] = useState(ranges.length === 0);
  const [start, setStart] = useState(formatWallTime(ranges[0]?.start_local ?? '09:00'));
  const [end, setEnd] = useState(formatWallTime(ranges[0]?.end_local ?? '17:00'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let range: Range | null = null;
    if (!closed) {
      const startLocal = parseWallTime(start);
      const endLocal = parseWallTime(end);
      if (!startLocal || !endLocal) {
        setError('Enter a time like 9:00 AM.');
        return;
      }
      if (startLocal >= endLocal) {
        setError('Start before end.');
        return;
      }
      range = { start: startLocal, end: endLocal };
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(range);
    } catch (failure) {
      setError(writeErrorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="editor-row">
        <Field
          id={`hours-start-${weekday}`}
          label="Start"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="9:00 AM"
          value={start}
          disabled={closed}
          onChange={(event) => setStart(event.target.value)}
        />
        <Field
          id={`hours-end-${weekday}`}
          label="End"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="5:00 PM"
          value={end}
          disabled={closed}
          onChange={(event) => setEnd(event.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={closed}
            onChange={(event) => setClosed(event.target.checked)}
          />
          Closed
        </label>
      </div>
      <div className="actions">
        <button type="submit" className="button primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
