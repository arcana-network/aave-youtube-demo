import { Box } from '@mui/material';
import React, { ReactNode } from 'react';
import AnalyticsConsent from 'src/components/Analytics/AnalyticsConsent';
import { FeedbackModal } from 'src/layouts/FeedbackDialog';
import { FORK_ENABLED } from 'src/utils/marketsAndNetworksConfig';

import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import TopBarNotify from './TopBarNotify';
// import TopBarNotify from './TopBarNotify';

export function MainLayout({ children }: { children: ReactNode }) {
  const APP_BANNER_VERSION = '5.0.0';

  return (
    <>
      <TopBarNotify
        learnMoreLink="https://sdk.arcana.network/"
        notifyText="A fork of Aave V2 integrated with Arcana Chain Abstraction SDK, Check out the SDK here! 👉"
        bannerVersion={APP_BANNER_VERSION}
        buttonText="Checkout SDK"
      />
      <AppHeader />
      <Box component="main" sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {children}
      </Box>

      <AppFooter />
      <FeedbackModal />
      {FORK_ENABLED ? null : <AnalyticsConsent />}
    </>
  );
}
