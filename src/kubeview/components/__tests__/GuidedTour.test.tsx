// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GuidedTour } from '../GuidedTour';

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GuidedTour', () => {
  it('does not render when localStorage key is set', () => {
    vi.mocked(Storage.prototype.getItem).mockReturnValue('true');
    const { container } = render(<GuidedTour />);
    expect(container.innerHTML).toBe('');
  });

  it('renders step 1 on first visit', () => {
    render(<GuidedTour />);
    expect(screen.getByText('Welcome to Pulse')).toBeDefined();
    expect(screen.getByText(/Your cluster health at a glance/)).toBeDefined();
  });

  it('advances to step 2 when Next button is clicked', () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText('Incident Center')).toBeDefined();
    expect(screen.getByText(/All alerts, findings, and auto-fix results/)).toBeDefined();
  });

  it('returns to step 1 when Back button is clicked', () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText('Incident Center')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByText('Welcome to Pulse')).toBeDefined();
  });

  it('does not show Back button on step 1', () => {
    render(<GuidedTour />);
    expect(screen.queryByLabelText('Previous step')).toBeNull();
  });

  it('closes tour and sets localStorage when Skip is clicked', () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByText('Skip tour'));
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('openshiftpulse-tour-completed', 'true');
    expect(screen.queryByText('Welcome to Pulse')).toBeNull();
  });

  it('sets localStorage when completing all steps via Get Started', () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByText("You're Ready")).toBeDefined();
    expect(screen.getByText('Get Started')).toBeDefined();
    fireEvent.click(screen.getByText('Get Started'));
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('openshiftpulse-tour-completed', 'true');
    expect(screen.queryByText("You're Ready")).toBeNull();
  });

  it('closes tour on Escape key', () => {
    render(<GuidedTour />);
    expect(screen.getByText('Welcome to Pulse')).toBeDefined();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('openshiftpulse-tour-completed', 'true');
    expect(screen.queryByText('Welcome to Pulse')).toBeNull();
  });

  it('closes tour on backdrop click', () => {
    render(<GuidedTour />);
    const backdrop = screen.getByText('Welcome to Pulse').closest('.fixed');
    expect(backdrop).toBeDefined();
    fireEvent.click(backdrop!);
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('openshiftpulse-tour-completed', 'true');
    expect(screen.queryByText('Welcome to Pulse')).toBeNull();
  });

  it('does not close when clicking inside the dialog', () => {
    render(<GuidedTour />);
    const title = screen.getByText('Welcome to Pulse');
    fireEvent.click(title);
    expect(screen.getByText('Welcome to Pulse')).toBeDefined();
  });

  it('shows correct number of progress dots', () => {
    const { container } = render(<GuidedTour />);
    const dotContainer = container.querySelector('.flex.gap-1\\.5');
    const dots = dotContainer!.querySelectorAll('span.rounded-full');
    expect(dots.length).toBe(5);
  });

  it('shows active progress dot for current step', () => {
    const { container } = render(<GuidedTour />);
    const dotContainer = container.querySelector('.flex.gap-1\\.5');
    const dots = dotContainer!.querySelectorAll('span.rounded-full');
    expect(dots[0].className).toContain('w-4');
    expect(dots[1].className).toContain('w-1.5');

    fireEvent.click(screen.getByLabelText('Next step'));
    const dotsAfter = dotContainer!.querySelectorAll('span.rounded-full');
    expect(dotsAfter[0].className).toContain('w-1.5');
    expect(dotsAfter[1].className).toContain('w-4');
  });

  it('shows Close button with correct aria-label', () => {
    render(<GuidedTour />);
    const closeBtn = screen.getByLabelText('Close tour');
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn);
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('openshiftpulse-tour-completed', 'true');
    expect(screen.queryByText('Welcome to Pulse')).toBeNull();
  });

  it('shows last step with Get Started button instead of Next', () => {
    render(<GuidedTour />);
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.queryByLabelText('Next step')).toBeNull();
    expect(screen.getByText('Get Started')).toBeDefined();
  });
});
