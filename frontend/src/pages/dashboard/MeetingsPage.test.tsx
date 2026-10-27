import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type AgentMeetingType, type MeetingTypeInput } from '../../api';
import MeetingsPage from './MeetingsPage';

const consultation: AgentMeetingType = {
  meeting_type_id: 1,
  name: 'Consultation',
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  location: 'video',
  active: true,
};

const showing: AgentMeetingType = {
  meeting_type_id: 2,
  name: 'Showing',
  duration_minutes: 60,
  buffer_before_minutes: 0,
  buffer_after_minutes: 15,
  location: 'in_person',
  active: false,
};

function savedRow(input: MeetingTypeInput): AgentMeetingType {
  return { ...input, meeting_type_id: input.meeting_type_id ?? 9 };
}

describe('MeetingsPage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentListMeetingTypes').mockResolvedValue([consultation, showing]);
    vi.spyOn(api, 'agentUpsertMeetingType').mockImplementation(async (input) => savedRow(input));
  });

  it('lists each type with its duration, location, and whether it is active', async () => {
    render(<MeetingsPage />);
    expect(await screen.findByText('Consultation, 30 min · Video call')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Showing, 60 min · In person')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('saves an edited type and leaves the others in place', async () => {
    const user = userEvent.setup();
    render(<MeetingsPage />);
    await screen.findByText('Consultation, 30 min · Video call');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add type' })).toBeDisabled();

    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Video consult');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.agentUpsertMeetingType).toHaveBeenCalledWith({
      ...consultation,
      name: 'Video consult',
    });
    expect(await screen.findByText('Video consult, 30 min · Video call')).toBeInTheDocument();
    expect(screen.getByText('Showing, 60 min · In person')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('adds a type and can abandon the editor', async () => {
    const user = userEvent.setup();
    render(<MeetingsPage />);
    await screen.findByRole('button', { name: 'Add type' });
    await user.click(screen.getByRole('button', { name: 'Add type' }));

    await user.type(screen.getByLabelText('Name'), 'Open house');
    await user.selectOptions(screen.getByLabelText('Location'), 'phone');
    await user.click(screen.getByRole('checkbox', { name: 'Active on the public page' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.agentUpsertMeetingType).not.toHaveBeenCalled();
    expect(screen.queryByText(/Open house/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add type' }));
    await user.type(screen.getByLabelText('Name'), 'Open house');
    await user.selectOptions(screen.getByLabelText('Location'), 'phone');
    await user.click(screen.getByRole('checkbox', { name: 'Active on the public page' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.agentUpsertMeetingType).toHaveBeenCalledWith({
      meeting_type_id: null,
      name: 'Open house',
      duration_minutes: 30,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      location: 'phone',
      active: false,
    });
    const added = await screen.findByText('Open house, 30 min · Phone call');
    expect(added.closest('li')).toHaveTextContent('Inactive');
  });

  it('keeps the editor open when the save is rejected', async () => {
    const user = userEvent.setup();
    vi.mocked(api.agentUpsertMeetingType).mockRejectedValue(
      new ApiError(400, 'invalid_input', 'Name is taken.'),
    );
    render(<MeetingsPage />);
    await user.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]!);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is taken.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Consultation');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says when meeting types cannot be loaded', async () => {
    vi.mocked(api.agentListMeetingTypes).mockRejectedValue(new ApiError(0, 'network', 'offline'));
    render(<MeetingsPage />);
    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add type' })).not.toBeInTheDocument();
  });
});
