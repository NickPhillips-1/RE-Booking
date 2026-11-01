import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, SelectField } from './Field';

describe('Field', () => {
  it('wires the label to the input', () => {
    render(<Field id="name" label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'name');
  });

  it('sets aria-invalid and aria-describedby when there is an error', () => {
    render(<Field id="name" label="Name" error="Enter your name." />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'name-error');
    expect(screen.getByText('Enter your name.')).toHaveAttribute('id', 'name-error');
  });

  it('omits aria-invalid and aria-describedby when there is no error', () => {
    render(<Field id="name" label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('SelectField', () => {
  it('wires the label to the select', () => {
    render(
      <SelectField id="location" label="Location">
        <option value="phone">Phone</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Location')).toHaveAttribute('id', 'location');
  });

  it('sets aria-invalid and aria-describedby when there is an error', () => {
    render(
      <SelectField id="location" label="Location" error="Choose a location.">
        <option value="phone">Phone</option>
      </SelectField>,
    );
    const select = screen.getByLabelText('Location');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAttribute('aria-describedby', 'location-error');
    expect(screen.getByText('Choose a location.')).toHaveAttribute('id', 'location-error');
  });

  it('omits aria-invalid and aria-describedby when there is no error', () => {
    render(
      <SelectField id="location" label="Location">
        <option value="phone">Phone</option>
      </SelectField>,
    );
    const select = screen.getByLabelText('Location');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
  });
});
