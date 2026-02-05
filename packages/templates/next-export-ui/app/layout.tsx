import './globals.css';

import React from 'react';

import ConnectButton from '../src/components/ConnectButton';
import FaucetButton from '../src/components/FaucetButton';
import NetworkStatus from '../src/components/NetworkStatus';
import { ths } from '../src/lib/ths';
import { rootStyleVars } from '../src/theme';

export const metadata = {
  title: `${ths.app.name} - Token Host`,
  description: 'Token Host generated app (static export)'
};

export default function RootLayout(props: { children: React.ReactNode }) {
  const themeVars = rootStyleVars();
  return (
    <html lang="en">
      <body style={themeVars}>
        <div className="container">
          <div className="heroGlow" />
          <div className="nav">
            <div className="brand">
              <h1>{ths.app.name}</h1>
              <span className="badge">{ths.schemaVersion}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <FaucetButton />
              <ConnectButton />
            </div>
          </div>
          <NetworkStatus />
          {props.children}
        </div>
      </body>
    </html>
  );
}
