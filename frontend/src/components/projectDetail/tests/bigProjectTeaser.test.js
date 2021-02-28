import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { BigProjectTeaser } from '../bigProjectTeaser';
import { IntlProviders } from '../../../utils/testWithIntl';

describe('BigProjectTeaser component', () => {
  it('shows 5 total contributors', () => {
    render(
      <IntlProviders>
        <BigProjectTeaser
          lastUpdated={'2020-02-08T21:34:58.998247Z'}
          totalContributors={5}
          className={'pt3'}
          littleFont={'f7'}
          bigFont={'f6'}
        />
      </IntlProviders>,
    );
    expect(screen.queryByText('5')).toBeInTheDocument();
    expect(screen.getByText(/total contributors/)).toBeInTheDocument();
    expect(screen.getByText(/Last contribution/)).toBeInTheDocument();
  });

  it('shows 0 total contributors for project with no mapping or validation', () => {
    render(
      <IntlProviders>
        <BigProjectTeaser
          lastUpdated={'2021-02-28T21:34:58.998247Z'}
          totalContributors={0}
          className={'pt3'}
          littleFont={'f7'}
          bigFont={'f6'}
        />
      </IntlProviders>,
    );
    expect(screen.queryByText('0')).toBeInTheDocument();
    expect(screen.getByText(/total contributors/)).toBeInTheDocument();
    expect(screen.getByText(/Last contribution/)).toBeInTheDocument();
  });
});
