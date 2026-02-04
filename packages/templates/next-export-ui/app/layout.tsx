import './globals.css';

import React from 'react';

import ConnectButton from '../src/components/ConnectButton';
import { ths } from '../src/generated/ths';

export const metadata = {
  title: `${ths.app.name} - Token Host`,
  description: 'Token Host generated app (static export)'
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <div className="nav">
            <div className="brand">
              <h1>{ths.app.name}</h1>
              <span className="badge">{ths.schemaVersion}</span>
            </div>
            <ConnectButton />
          </div>
          {props.children}
        </div>
      </body>
    </html>
  );
}
