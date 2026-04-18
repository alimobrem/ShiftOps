// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/utils', () => ({ cn: (...args: any[]) => args.filter(Boolean).join(' ') }));

vi.mock('../toolbox/SLOTab', () => ({
  SLOTab: () => <div data-testid="slo-tab">SLO Content</div>,
}));

import SloView from '../SloView';

describe('SloView', () => {
  afterEach(cleanup);

  function renderView() {
    return render(
      <MemoryRouter>
        <SloView />
      </MemoryRouter>,
    );
  }

  it('renders page header', () => {
    renderView();
    expect(screen.getByText('Service Level Objectives')).toBeDefined();
  });

  it('renders subtitle text', () => {
    renderView();
    expect(screen.getByText(/Define and track service health targets/)).toBeDefined();
  });

  it('renders the SLOTab component', () => {
    renderView();
    expect(screen.getByTestId('slo-tab')).toBeDefined();
  });
});
