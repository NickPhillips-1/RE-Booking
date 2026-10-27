import { useState, type FormEvent } from 'react';
import {
  api,
  errorMessage,
  useLoad,
  writeErrorMessage,
  type AgentMeetingType,
  type MeetingLocation,
  type MeetingTypeInput,
} from '../../api';
import { LOCATION_LABELS } from '../../time';
import { Field } from '../../ui/Field';
import { PageHeader } from '../../ui/PageHeader';

const NEW_MEETING_TYPE: MeetingTypeInput = {
  meeting_type_id: null,
  name: '',
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  location: 'video',
  active: true,
};

export default function MeetingsPage() {
  const [saved, setSaved] = useState<AgentMeetingType[]>();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const loaded = useLoad('types', () => api.agentListMeetingTypes());
  const types = saved ?? loaded.data;

  async function save(input: MeetingTypeInput) {
    const row = await api.agentUpsertMeetingType(input);
    const isNew = !types!.some((type) => type.meeting_type_id === row.meeting_type_id);
    setSaved(
      isNew
        ? [...types!, row]
        : types!.map((type) => (type.meeting_type_id === row.meeting_type_id ? row : type)),
    );
    setEditing(null);
  }

  return (
    <>
      <title>Meetings</title>
      <PageHeader
        title="Meetings"
        description="The meeting types visitors choose from on your public page."
      />

      {types === undefined ? (
        loaded.error !== undefined ? (
          <p className="error">{errorMessage(loaded.error)}</p>
        ) : (
          <p className="quiet">Loading…</p>
        )
      ) : (
        <section className="section" aria-label="Meeting types">
          <ul className="rows">
            {types.map((type) => (
              <li key={type.meeting_type_id}>
                {editing === type.meeting_type_id ? (
                  <MeetingTypeEditor
                    initial={type}
                    onSave={save}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <span className="row-value">
                      {type.name}, {type.duration_minutes} min · {LOCATION_LABELS[type.location]}
                    </span>
                    <span className="quiet">{type.active ? 'Active' : 'Inactive'}</span>
                    <button
                      type="button"
                      className="button"
                      disabled={editing !== null}
                      onClick={() => setEditing(type.meeting_type_id)}
                    >
                      Edit
                    </button>
                  </>
                )}
              </li>
            ))}
            {editing === 'new' && (
              <li>
                <MeetingTypeEditor
                  initial={NEW_MEETING_TYPE}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              </li>
            )}
          </ul>
          {editing !== 'new' && (
            <div>
              <button
                type="button"
                className="button"
                disabled={editing !== null}
                onClick={() => setEditing('new')}
              >
                Add type
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function MeetingTypeEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: MeetingTypeInput;
  onSave: (input: MeetingTypeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = initial.meeting_type_id ?? 'new';

  function set<K extends keyof MeetingTypeInput>(key: K, value: MeetingTypeInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (failure) {
      setError(writeErrorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <Field
        id={`type-name-${id}`}
        label="Name"
        value={draft.name}
        onChange={(event) => set('name', event.target.value)}
      />
      <div className="editor-row">
        <Field
          id={`type-duration-${id}`}
          label="Minutes"
          type="number"
          min={5}
          max={480}
          step={5}
          value={draft.duration_minutes}
          onChange={(event) => set('duration_minutes', Number(event.target.value))}
        />
        <div className="field">
          <label className="label" htmlFor={`type-location-${id}`}>
            Location
          </label>
          <select
            id={`type-location-${id}`}
            className="select"
            value={draft.location}
            onChange={(event) => set('location', event.target.value as MeetingLocation)}
          >
            {Object.entries(LOCATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="editor-row">
        <Field
          id={`type-before-${id}`}
          label="Free before (min)"
          type="number"
          min={0}
          max={240}
          step={5}
          value={draft.buffer_before_minutes}
          onChange={(event) => set('buffer_before_minutes', Number(event.target.value))}
        />
        <Field
          id={`type-after-${id}`}
          label="Free after (min)"
          type="number"
          min={0}
          max={240}
          step={5}
          value={draft.buffer_after_minutes}
          onChange={(event) => set('buffer_after_minutes', Number(event.target.value))}
        />
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) => set('active', event.target.checked)}
        />
        Active on the public page
      </label>
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
