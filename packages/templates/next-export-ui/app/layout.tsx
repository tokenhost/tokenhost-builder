import './globals.css';

import React from 'react';
import Link from 'next/link';

import ConnectButton from '../src/components/ConnectButton';
import FaucetButton from '../src/components/FaucetButton';
import FooterDeploymentMeta from '../src/components/FooterDeploymentMeta';
import LivingGrid from '../src/components/LivingGrid';
import NetworkStatus from '../src/components/NetworkStatus';
import ThemeToggle from '../src/components/ThemeToggle';
import { ths } from '../src/lib/ths';

export const metadata = {
  title: `${ths.app.name} - Token Host`,
  description: 'Token Host generated app (static export)'
};

const themeBootScript = `
(() => {
  try {
    const storageKey = 'TH_THEME';
    const stored = localStorage.getItem(storageKey);
    const resolved = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
  }
})();
`;

export default function RootLayout(props: { children: React.ReactNode }) {
  const primaryCollection = ths.collections[0] ?? null;
  const navCollections = ths.collections.slice(0, 2);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <div className="siteBackground" aria-hidden="true">
          <div className="siteGridLayer" />
          <LivingGrid />
        </div>
        <div className="container">
          <header className="navShell">
            <div className="nav">
              <Link className="brand" href="/">
                <div className="brandCopy">
                  <div className="brandIdentity">
                    <span className="brandWordText">
                      <span className="brandWordBase">token</span>
                      <span className="brandWordAccent">host</span>
                    </span>
                  </div>
                </div>
              </Link>
              <nav className="navRail" aria-label="Primary">
                <Link className="navRailLink" href="/">Overview</Link>
                {navCollections.map((collection) => (
                  <Link key={collection.name} className="navRailLink" href={`/${collection.name}/`}>
                    {collection.name}
                  </Link>
                ))}
                <a className="navRailLink" href="/.well-known/tokenhost/manifest.json">Manifest</a>
              </nav>
              <div className="controlCluster">
                <ThemeToggle />
                <FaucetButton />
                <ConnectButton />
                {primaryCollection ? <Link className="btn primary navCta" href={`/${primaryCollection.name}/?mode=new`}>Create record</Link> : null}
              </div>
            </div>
          </header>
          <main className="mainShell">
            <div className="siteContent">
              <NetworkStatus />
              {props.children}
            </div>
          </main>
          <footer className="siteFooter">
            <div className="siteShell">
              <div className="footerGrid">
                <div className="footerSection">
                  <h4 className="footerLabel">/collections</h4>
                  <div className="footerList">
                    {ths.collections.slice(0, 3).map((collection) => (
                      <Link key={collection.name} className="footerLinkText" href={`/${collection.name}/`}>
                        {collection.name}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="footerSection">
                  <h4 className="footerLabel">/runtime</h4>
                  <div className="footerList">
                    <Link className="footerLinkText" href="/">Overview</Link>
                    <a className="footerLinkText" href="/.well-known/tokenhost/manifest.json">Manifest</a>
                    <a className="footerLinkText" href="/compiled/App.json">Compiled ABI</a>
                    {primaryCollection ? <Link className="footerLinkText" href={`/${primaryCollection.name}/?mode=new`}>Create record</Link> : null}
                  </div>
                </div>
              </div>
              <FooterDeploymentMeta>
                <span className="badge">schema {ths.schemaVersion}</span>
              </FooterDeploymentMeta>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
